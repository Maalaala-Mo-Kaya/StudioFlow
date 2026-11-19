import { useState, useEffect, useMemo, useCallback } from 'react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import type {
  Organization, Level, Course, SchoolCourse, AssignSchoolCourse, Package, AddOn,
  Registration, MasterListItem, StaffUser, StaffRole,
  FramingStatus, PhotoStatus, PaymentRecord,
} from '../../types';
import { parseRosterCsv, exportRegistrationsToCsv } from '../../utils/csv';
import { PROTECTED_SYSTEM_USERNAMES } from '../../constants/studio';
import type { StudentExcelData } from './studentExcel';

export type AdminTab = 'metrics' | 'orgs' | 'packages' | 'roster' | 'staff' | 'framing' | 'students' | 'workflow';

const excelUnavailable = 'The connected PocketBase server did not return an Excel report. Restart it with the latest StudioFlow hooks and migrations, then try again.';

export function useAdminData() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('metrics');

  // Master Data
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [schoolCourses, setSchoolCourses] = useState<SchoolCourse[]>([]);
  const [courseCatalogStatus, setCourseCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [packages, setPackages] = useState<Package[]>([]);
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [masterList, setMasterList] = useState<MasterListItem[]>([]);
  const [staffAccounts, setStaffAccounts] = useState<StaffUser[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Form States
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCode, setNewOrgCode] = useState('');

  const [newPkgCode, setNewPkgCode] = useState('');
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgAmount, setNewPkgAmount] = useState<number>(1000);
  const [newPkgPhotoLimit, setNewPkgPhotoLimit] = useState(0);
  const [newPkgRequiresMua, setNewPkgRequiresMua] = useState(false);
  const [newPkgMuaTypes, setNewPkgMuaTypes] = useState<string[]>([]);
  const [newPkgInclusions, setNewPkgInclusions] = useState('');

  // Roster CSV Upload State
  const [csvText, setCsvText] = useState('');
  const [rosterOrgId, setRosterOrgId] = useState('');

  // New Staff Account State
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState<StaffRole>('cashier');

  const loadAllData = useCallback(async () => {
    try {
      const [regsRes, orgsRes, levelsRes, coursesRes, schoolCoursesRes, pkgsRes, addonsRes, rosterRes, usersRes, paymentsRes] =
        await Promise.all([
          pb.collection('registrations').getFullList<Registration>({
            sort: '-created',
            expand: 'organization,level,course,package',
            requestKey: null,
          }),
          pb.collection('organizations').getFullList<Organization>({ requestKey: null }),
          pb.collection('levels').getFullList<Level>({ requestKey: null }),
          pb.collection('courses').getFullList<Course>({ requestKey: null }),
          pb.collection('school_courses').getFullList<SchoolCourse>({ requestKey: null }),
          pb.collection('packages').getFullList<Package>({ requestKey: null }),
          pb.collection('add_ons').getFullList<AddOn>({ requestKey: null }),
          pb.collection('master_lists').getFullList<MasterListItem>({ requestKey: null }),
          pb.collection('users').getFullList<StaffUser>({ requestKey: null }).catch(() => []),
          pb.collection('payments').getFullList<PaymentRecord>({ sort: 'created', requestKey: null }),
        ]);

      setRegistrations(regsRes);
      setOrganizations(orgsRes);
      setLevels(levelsRes);
      setCourses(coursesRes);
      setSchoolCourses(schoolCoursesRes);
      setCourseCatalogStatus('ready');
      setPackages(pkgsRes);
      setAddOns(addonsRes);
      setMasterList(rosterRes);
      setStaffAccounts(usersRes);
      setPayments(paymentsRes);
      if (orgsRes.length > 0 && !rosterOrgId) setRosterOrgId(orgsRes[0].id);
    } catch (err) {
      if (err && typeof err === 'object' && 'isAbort' in err && err.isAbort) return;
      setCourseCatalogStatus((status) => status === 'ready' ? status : 'error');
      console.error('Failed to load admin data:', err);
    }
  }, [rosterOrgId]);

  useEffect(() => {
    loadAllData();
    pb.collection('registrations').subscribe('*', () => {
      loadAllData();
    });
    pb.collection('packages').subscribe('*', () => {
      loadAllData();
    }).catch((error) => console.error('Could not subscribe to package updates:', error));
    pb.collection('payments').subscribe('*', () => {
      loadAllData();
    }).catch((error) => console.error('Could not subscribe to payment updates:', error));
    return () => {
      pb.collection('registrations').unsubscribe('*');
      pb.collection('packages').unsubscribe('*');
      pb.collection('payments').unsubscribe('*');
    };
  }, [loadAllData]);

  // Metrics Calculations
  const metrics = useMemo(() => {
    const totalRegistrations = registrations.length;
    const totalPaidShooting = registrations.filter((r) => r.status !== 'pending_payment').length;
    const totalCompleted = registrations.filter(
      (r) => r.status === 'done_shooting' || r.status === 'completed'
    ).length;
    const totalCollections = payments.reduce((sum, payment) =>
      payment.status === 'voided' || payment.status === 'refunded' ? sum : sum + payment.amount, 0);
    const totalOutstandingBalances = Math.max(0,
      registrations.reduce((sum, r) => sum + (r.total_amount || 0), 0) - totalCollections);

    return {
      totalRegistrations,
      totalPaidShooting,
      totalCompleted,
      totalCollections,
      totalOutstandingBalances,
    };
  }, [registrations, payments]);

  // Add Organization
  const handleAddOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    try {
      await pb.collection('organizations').create({
        name: newOrgName.trim(),
        code: newOrgCode.trim().toUpperCase(),
        is_active: true,
      });
      setNewOrgName('');
      setNewOrgCode('');
      loadAllData();
    } catch (err) {
      console.error('Failed to add organization:', err);
    }
  };

  // Add Package
  const handleAddPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPkgName.trim() || !newPkgCode.trim()) return;
    try {
      const inclusions = newPkgInclusions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      await pb.collection('packages').create({
        code: newPkgCode.trim().toUpperCase(),
        name: newPkgName.trim(),
        amount: Number(newPkgAmount),
        photo_selection_limit: newPkgPhotoLimit,
        requires_mua: newPkgRequiresMua,
        mua_service_types: newPkgMuaTypes,
        inclusions: JSON.stringify(inclusions),
        is_active: true,
      });

      setNewPkgCode('');
      setNewPkgName('');
      setNewPkgInclusions('');
      setNewPkgPhotoLimit(0);
      setNewPkgRequiresMua(false);
      setNewPkgMuaTypes([]);
      loadAllData();
    } catch (err) {
      console.error('Failed to add package:', err);
    }
  };

  // Import Roster
  const handleImportRoster = async () => {
    const rows = parseRosterCsv(csvText);
    if (rows.length === 0) return;

    let imported = 0;
    for (const item of rows) {
      try {
        await pb.collection('master_lists').create({
          organization: rosterOrgId,
          full_name: item.full_name,
          student_id: item.student_id,
          section: item.section,
          email: item.email,
          mobile_number: item.mobile_number,
        });
        imported++;
      } catch {
        // Continue with remaining rows if one fails
      }
    }

    toast.success(`Successfully imported ${imported} roster records!`);
    setCsvText('');
    loadAllData();
  };

  // Create Staff Account
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = staffUsername.trim().toLowerCase().replace(/[^a-z0-9._]/g, '');

    if (!cleanUsername || cleanUsername.length < 3) {
      toast.error('Username must be at least 3 characters and contain only letters, numbers, or dots.');
      return;
    }

    if (!staffPassword || staffPassword.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      return;
    }

    // Pre-check for duplicate username
    if (staffAccounts.some((a) => a.username.toLowerCase() === cleanUsername)) {
      toast.error(`Username "${cleanUsername}" is already in use by an active staff account.`);
      return;
    }

    try {
      await pb.collection('users').create({
        username: cleanUsername,
        email: `${cleanUsername}@hilightstudio.com`,
        password: staffPassword,
        passwordConfirm: staffPassword,
        name: staffName.trim() || cleanUsername,
        role: staffRole,
      });

      setStaffUsername('');
      setStaffPassword('');
      setStaffName('');
      toast.success(`Provisioned ${staffRole.toUpperCase()} account "${cleanUsername}"!`);
      loadAllData();
    } catch (err: unknown) {
      console.error('Failed to create staff account:', err);
      let errorMsg = 'Failed to create staff account.';
      if (typeof err === 'object' && err !== null) {
        const anyErr = err as {
          response?: { data?: Record<string, { message?: string }> };
          message?: string;
        };
        if (anyErr.response?.data && Object.keys(anyErr.response.data).length > 0) {
          const details = Object.entries(anyErr.response.data)
            .map(([field, errObj]) => `${field}: ${errObj?.message || JSON.stringify(errObj)}`)
            .join('; ');
          errorMsg = `Validation failed — ${details}`;
        } else if (anyErr.message) {
          errorMsg = anyErr.message;
        }
      }
      toast.error(errorMsg);
    }
  };

  const handleUpdateStaff = async (id: string, changes: Partial<Pick<StaffUser, 'role' | 'disabled'>>) => {
    try {
      const updated = await pb.collection('users').update<StaffUser>(id, changes);
      setStaffAccounts((accounts) => accounts.map((account) => account.id === id ? updated : account));
      toast.success('Staff account updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update staff account.');
    }
  };

  const handleDeleteStaff = async (id: string, username: string) => {
    if ((PROTECTED_SYSTEM_USERNAMES as readonly string[]).includes(username)) {
      toast.error('Default system role accounts cannot be deleted.');
      return;
    }
    try {
      await pb.collection('users').delete(id);
      toast.success(`Staff user @${username} deleted.`);
      loadAllData();
    } catch (err) {
      console.error('Failed to delete staff:', err);
      toast.error('Failed to delete staff user.');
    }
  };

  const handleUpdateFramingStatus = async (id: string, framingStatus: FramingStatus) => {
    try {
      await pb.collection('registrations').update(id, {
        framing_status: framingStatus,
      });
      toast.success('Framing status updated.');
      loadAllData();
    } catch (err) {
      console.error('Failed to update framing status:', err);
      toast.error('Failed to update framing status.');
    }
  };

  const handleUpdatePhotoStatus = async (id: string, photoStatus: PhotoStatus) => {
    try {
      await pb.collection('registrations').update(id, {
        photo_status: photoStatus,
      });
      toast.success('Photo production status updated.');
      loadAllData();
    } catch (err) {
      console.error('Failed to update photo status:', err);
      toast.error('Failed to update photo status.');
    }
  };

  // --- Organization & Course Mutations (T018, T019) ---
  const handleUpdateOrg = async (id: string, name: string, code: string) => {
    try {
      await pb.collection('organizations').update(id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
      });
      toast.success('Organization updated.');
      loadAllData();
    } catch (err) {
      console.error('Failed to update organization:', err);
      toast.error('Failed to update organization.');
    }
  };

  const handleToggleOrgActive = async (id: string, current: boolean) => {
    try {
      await pb.collection('organizations').update(id, { is_active: !current });
      loadAllData();
    } catch (err) {
      console.error('Failed to toggle organization status:', err);
    }
  };

  const handleDeleteOrg = async (id: string) => {
    try {
      await pb.collection('organizations').delete(id);
      toast.success('Organization deleted.');
      loadAllData();
    } catch (err) {
      console.error('Failed to delete organization:', err);
      toast.error('Failed to delete organization.');
    }
  };

  const handleAddCourse = async (assignment: AssignSchoolCourse) => {
    await pb.send('/api/studioflow/school-courses', {
      method: 'POST',
      body: assignment,
    });
    await loadAllData();
  };

  const handleUpdateCourse = async (id: string, name: string, code: string) => {
    await pb.collection('courses').update(id, {
      name: name.trim(),
      code: code.trim().toUpperCase(),
    });
    await loadAllData();
  };

  const handleRemoveCourse = async (assignmentId: string) => {
    await pb.collection('school_courses').delete(assignmentId);
    await loadAllData();
  };

  // --- Package & Add-on Mutations (T020) ---
  const handleUpdatePackage = async (
    id: string,
    data: { name: string; code: string; amount: number; inclusions: string[]; photo_selection_limit: number; requires_mua: boolean; mua_service_types: string[] }
  ) => {
    try {
      await pb.collection('packages').update(id, {
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        amount: Number(data.amount),
        inclusions: JSON.stringify(data.inclusions),
        photo_selection_limit: data.photo_selection_limit,
        requires_mua: data.requires_mua,
        mua_service_types: data.mua_service_types,
      });
      loadAllData();
    } catch (err) {
      console.error('Failed to update package:', err);
      throw err;
    }
  };

  const handleTogglePackageActive = async (id: string, current: boolean) => {
    try {
      await pb.collection('packages').update(id, { is_active: !current });
      toast.success(`Package ${!current ? 'activated' : 'deactivated'}.`);
      loadAllData();
    } catch (err) {
      console.error('Failed to toggle package:', err);
      toast.error('Failed to toggle package status.');
    }
  };

  const handleDeletePackage = async (id: string) => {
    try {
      await pb.collection('packages').delete(id);
      toast.success('Package deleted.');
      loadAllData();
    } catch (err) {
      console.error('Failed to delete package:', err);
      toast.error('Failed to delete package.');
    }
  };

  const handleAddAddOn = async (name: string, code: string, amount: number, requiresMua: boolean, serviceTypes: string[]) => {
    if (!name.trim()) return;
    try {
      await pb.collection('add_ons').create({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        amount: Number(amount),
        requires_mua: requiresMua,
        mua_service_types: serviceTypes,
        is_active: true,
      });
      loadAllData();
    } catch (err) {
      console.error('Failed to add add-on:', err);
      throw err;
    }
  };

  const handleUpdateAddOn = async (
    id: string,
    name: string,
    code: string,
    amount: number,
    requiresMua: boolean,
    serviceTypes: string[]
  ) => {
    try {
      await pb.collection('add_ons').update(id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        amount: Number(amount),
        requires_mua: requiresMua,
        mua_service_types: serviceTypes,
      });
      loadAllData();
    } catch (err) {
      console.error('Failed to update add-on:', err);
      throw err;
    }
  };

  const handleToggleAddOnActive = async (id: string, current: boolean) => {
    try {
      await pb.collection('add_ons').update(id, { is_active: !current });
      toast.success(`Add-on ${!current ? 'activated' : 'deactivated'}.`);
      loadAllData();
    } catch (err) {
      console.error('Failed to toggle add-on:', err);
      toast.error('Failed to toggle add-on status.');
    }
  };

  const handleDeleteAddOn = async (id: string) => {
    try {
      await pb.collection('add_ons').delete(id);
      toast.success('Add-on deleted.');
      loadAllData();
    } catch (err) {
      console.error('Failed to delete add-on:', err);
      toast.error('Failed to delete add-on.');
    }
  };

  // --- Master Roster Mutations (T021, T022) ---
  const handleDeleteMasterListItem = async (id: string) => {
    try {
      await pb.collection('master_lists').delete(id);
      toast.success('Roster item deleted.');
      loadAllData();
    } catch (err) {
      console.error('Failed to delete roster item:', err);
      toast.error('Failed to delete roster item.');
    }
  };

  const handleClearMasterList = async (orgId: string) => {
    try {
      const items = await pb.collection('master_lists').getFullList({
        filter: pb.filter('organization = {:orgId}', { orgId }),
        requestKey: null,
      });
      for (const item of items) {
        await pb.collection('master_lists').delete(item.id);
      }
      toast.success('Organization master list cleared.');
      loadAllData();
    } catch (err) {
      console.error('Failed to clear master list:', err);
      toast.error('Failed to clear master list.');
    }
  };

  // --- Student Registration Mutations (T028) ---
  const handleUpdateRegistration = async (id: string, data: Partial<Registration> & { mua_correction?: 'required' | 'waived' }) => {
    await pb.collection('registrations').update(id, data);
    loadAllData();
  };

  const handleDeleteRegistration = async (id: string) => {
    try {
      await pb.collection('registrations').delete(id);
      toast.success('Registration cancelled and deleted.');
      loadAllData();
    } catch (err) {
      console.error('Failed to delete registration:', err);
      toast.error('Failed to delete registration.');
    }
  };

  const exportCsv = useCallback(() => {
    exportRegistrationsToCsv(registrations);
  }, [registrations]);

  const exportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const [data, { downloadStudentExcel }] = await Promise.all([
        // Bypass any app page cached under this URL before the export route was installed.
        pb.send<Partial<StudentExcelData> | null>('/api/studioflow/student-excel', { method: 'GET', cache: 'no-store' }),
        import('./studentExcel'),
      ]);
      // An older server can serve the app's HTML for an unknown GET route.
      // PocketBase's client treats that non-JSON response as an empty object.
      if (!Array.isArray(data?.packages) || !Array.isArray(data?.addOns) || !Array.isArray(data?.rows)) {
        toast.error(excelUnavailable);
        return;
      }
      await downloadStudentExcel({ packages: data.packages, addOns: data.addOns, rows: data.rows });
    } catch (err) {
      console.error('Failed to export the student workbook:', err);
      toast.error(err instanceof ClientResponseError && err.status === 404
        ? excelUnavailable
        : 'Could not export the student workbook. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  return {
    activeTab,
    setActiveTab,
    registrations,
    organizations,
    levels,
    courses,
    schoolCourses,
    courseCatalogStatus,
    packages,
    addOns,
    masterList,
    staffAccounts,
    payments,
    metrics,
    // Add Org Form
    newOrgName,
    setNewOrgName,
    newOrgCode,
    setNewOrgCode,
    handleAddOrg,
    // Add Pkg Form
    newPkgCode,
    setNewPkgCode,
    newPkgName,
    setNewPkgName,
    newPkgAmount,
    newPkgPhotoLimit,
    setNewPkgPhotoLimit,
    newPkgRequiresMua,
    setNewPkgRequiresMua,
    newPkgMuaTypes,
    setNewPkgMuaTypes,
    setNewPkgAmount,
    newPkgInclusions,
    setNewPkgInclusions,
    handleAddPackage,
    // Roster Ingestion
    csvText,
    setCsvText,
    rosterOrgId,
    setRosterOrgId,
    handleImportRoster,
    // Staff Management
    staffUsername,
    setStaffUsername,
    staffPassword,
    setStaffPassword,
    staffName,
    setStaffName,
    staffRole,
    setStaffRole,
    handleCreateStaff,
    handleDeleteStaff,
    handleUpdateStaff,
    handleUpdateFramingStatus,
    handleUpdatePhotoStatus,
    // School & Course Mutations
    handleUpdateOrg,
    handleToggleOrgActive,
    handleDeleteOrg,
    handleAddCourse,
    handleUpdateCourse,
    handleRemoveCourse,
    // Package & Add-on Mutations
    handleUpdatePackage,
    handleTogglePackageActive,
    handleDeletePackage,
    handleAddAddOn,
    handleUpdateAddOn,
    handleToggleAddOnActive,
    handleDeleteAddOn,
    // Master List Mutations
    handleDeleteMasterListItem,
    handleClearMasterList,
    // Student Registration Mutations
    handleUpdateRegistration,
    handleDeleteRegistration,
    // Report Export
    exportCsv,
    exportExcel,
    exportingExcel,
  };
}
