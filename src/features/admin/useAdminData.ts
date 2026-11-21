import { useState, useEffect, useMemo, useCallback } from 'react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import type {
  Organization, Level, Course, SchoolCourse, AssignSchoolCourse, Package, AddOn,
  Registration, MasterListItem, StaffUser, StaffRole, RevenueCategory,
  ProductionStatus, ProductionUpdateResult, PhotoStatus, PaymentRecord, RefundRecord,
} from '../../types';
import { parseRosterCsv, exportRegistrationsToCsv } from '../../utils/csv';
import { PROTECTED_SYSTEM_USERNAMES } from '../../constants/studio';
import { overviewMetrics } from './overviewMetrics';
import { refreshClientDocuments } from '../receipts/clientDocuments';
import type { DateRange, OverallScope, StudentExcelData } from './studentExcel';
import type { RegistrationEdits } from './components/EditStudentModal';
import type { DraftAddOn, DraftPackage } from './catalogImport/catalogParser';
import { saveCatalogDrafts } from './catalogImport/saveCatalog';

export type PackageKind = 'school' | 'walkin' | 'both';

/** Body of POST /api/studioflow/refunds. clientKey makes a retried request return the same refund. */
export interface RefundRequest {
  registrationId: string;
  amount: number;
  method: RefundRecord['method'];
  reason: string;
  clientKey: string;
}

export type AdminTab = 'metrics' | 'orgs' | 'packages' | 'roster' | 'staff' | 'framing' | 'students' | 'workflow' | 'camera' | 'clients' | 'catalog-import';

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
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Form States
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgCode, setNewOrgCode] = useState('');

  const [newPkgCode, setNewPkgCode] = useState('');
  const [newPkgName, setNewPkgName] = useState('');
  const [newPkgAmount, setNewPkgAmount] = useState<number>(1000);
  const [newPkgPhotoLimit, setNewPkgPhotoLimit] = useState(0);
  const [newPkgRequiresMua, setNewPkgRequiresMua] = useState(false);
  const [newPkgKind, setNewPkgKind] = useState<PackageKind>('school');
  const [newPkgRevenue, setNewPkgRevenue] = useState<RevenueCategory>('studio');
  const [newPkgInclusions, setNewPkgInclusions] = useState('');
  const [newPkgFreebies, setNewPkgFreebies] = useState<string[]>([]);

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
      const [regsRes, orgsRes, levelsRes, coursesRes, schoolCoursesRes, pkgsRes, addonsRes, rosterRes, usersRes, paymentsRes, refundsRes] =
        await Promise.all([
          pb.collection('registrations').getFullList<Registration>({
            sort: '-created',
            expand: 'organization,level,course,package,session_type',
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
          // An older server without the refunds collection: treat as no refunds.
          pb.collection('refunds').getFullList<RefundRecord>({ sort: 'created', requestKey: null }).catch(() => []),
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
      setRefunds(refundsRes);
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
    pb.collection('refunds').subscribe('*', () => {
      loadAllData();
    }).catch((error) => console.error('Could not subscribe to refund updates:', error));
    return () => {
      pb.collection('registrations').unsubscribe('*');
      pb.collection('packages').unsubscribe('*');
      pb.collection('payments').unsubscribe('*');
      pb.collection('refunds').unsubscribe('*');
    };
  }, [loadAllData]);

  // Metrics Calculations
  // All-time figures (the Overview tab can also show today or this month).
  const metrics = useMemo(() => overviewMetrics(registrations, payments, refunds), [registrations, payments, refunds]);

  // Add Organization. Returns the new school's id so the Schools tab can select it.
  const handleAddOrg = async (e: React.FormEvent): Promise<string | undefined> => {
    e.preventDefault();
    const name = newOrgName.trim();
    if (!name) return undefined;
    try {
      const created = await pb.collection('organizations').create<Organization>({
        name,
        code: newOrgCode.trim().toUpperCase(),
        is_active: true,
      });
      setNewOrgName('');
      setNewOrgCode('');
      await loadAllData();
      toast.success(`School "${name}" registered. Add its levels and courses on the right.`);
      return created.id;
    } catch (err) {
      console.error('Failed to add organization:', err);
      toast.error(err instanceof Error && err.message ? err.message : 'Failed to register the school.');
      return undefined;
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
        client_kind: newPkgKind,
        revenue_category: newPkgRevenue,
        inclusions: JSON.stringify(inclusions),
        freebies: newPkgFreebies.map((item) => item.trim()).filter(Boolean),
        is_active: true,
      });

      setNewPkgCode('');
      setNewPkgName('');
      setNewPkgInclusions('');
      setNewPkgFreebies([]);
      setNewPkgPhotoLimit(0);
      setNewPkgRequiresMua(false);
      setNewPkgRevenue('studio');
      toast.success('Package created.');
      loadAllData();
    } catch (err) {
      console.error('Failed to add package:', err);
      // The server explains refusals, such as a package code that is already used.
      toast.error(err instanceof Error && err.message ? err.message : 'Failed to create the package.');
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
      toast.error('Username must be at least 3 characters and contain only letters, numbers, dots, or underscores.');
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

  // Throws on failure so the reset dialog stays open for another try.
  const handleResetStaffPassword = async (id: string, username: string, password: string) => {
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      throw new Error('Password too short');
    }
    try {
      // Admins hold the users manageRule, so no oldPassword is needed. PocketBase
      // rotates the account's tokenKey, which signs that user out everywhere.
      await pb.collection('users').update(id, { password, passwordConfirm: password });
      toast.success(`Password reset for @${username}. They must log in again.`);
    } catch (error) {
      const data = (error as { response?: { data?: Record<string, { message?: string }> } })?.response?.data;
      const detail = data && Object.values(data).map((field) => field?.message).filter(Boolean).join('; ');
      toast.error(detail || (error instanceof Error ? error.message : 'Failed to reset password.'));
      throw error;
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

  /** Sets the production status of one or many job orders (server skips orders it cannot change). */
  const handleSetProductionStatus = async (ids: string[], status: ProductionStatus) => {
    try {
      const result = await pb.send<ProductionUpdateResult>('/api/studioflow/production-status', {
        method: 'POST', body: { ids, status },
      });
      const { skipped } = result;
      const notes = [
        skipped.notShot && `${skipped.notShot} not photographed yet`,
        skipped.unpaid && `${skipped.unpaid} unpaid`,
        skipped.released && `${skipped.released} already released`,
        skipped.cancelled && `${skipped.cancelled} cancelled`,
        skipped.missing && `${skipped.missing} no longer exist`,
      ].filter(Boolean);
      const message = ids.length === 1 && !notes.length
        ? 'Production status updated.'
        : `${result.updated} job order${result.updated === 1 ? '' : 's'} updated`
          + (result.unchanged ? `, ${result.unchanged} already set` : '')
          + (notes.length ? `. Skipped: ${notes.join(', ')}.` : '.');
      if (notes.length && !result.updated) toast.error(message);
      else toast.success(message);
      await loadAllData();
    } catch (err) {
      console.error('Failed to update production status:', err);
      toast.error('Failed to update production status: ' + (err instanceof Error ? err.message : 'Unknown error'));
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
  const handleUpdateOrg = async (id: string, name: string, code: string, askLook: boolean) => {
    try {
      await pb.collection('organizations').update(id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        makeup_look_off: !askLook,
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
    data: { name: string; code: string; amount: number; inclusions: string[]; freebies: string[]; photo_selection_limit: number; requires_mua: boolean; client_kind: PackageKind; revenue_category: RevenueCategory | '' }
  ) => {
    try {
      await pb.collection('packages').update(id, {
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        amount: Number(data.amount),
        inclusions: JSON.stringify(data.inclusions),
        freebies: data.freebies.map((item) => item.trim()).filter(Boolean),
        photo_selection_limit: data.photo_selection_limit,
        requires_mua: data.requires_mua,
        client_kind: data.client_kind,
        revenue_category: data.revenue_category,
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
      toast.error(err instanceof Error && err.message ? err.message : 'Failed to delete package.');
    }
  };

  const handleAddAddOn = async (
    name: string, code: string, amount: number, requiresMua: boolean,
    clientKind: PackageKind, revenueCategory: RevenueCategory | '', defaultWhenNoMua: boolean,
  ) => {
    if (!name.trim()) return;
    try {
      await pb.collection('add_ons').create({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        amount: Number(amount),
        requires_mua: requiresMua,
        client_kind: clientKind,
        revenue_category: revenueCategory,
        default_when_no_mua: defaultWhenNoMua,
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
    clientKind: PackageKind,
    revenueCategory: RevenueCategory | '',
    defaultWhenNoMua: boolean,
  ) => {
    try {
      await pb.collection('add_ons').update(id, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        amount: Number(amount),
        requires_mua: requiresMua,
        client_kind: clientKind,
        revenue_category: revenueCategory,
        default_when_no_mua: defaultWhenNoMua,
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
      toast.error(err instanceof Error ? err.message : 'Failed to toggle add-on status.');
    }
  };

  const handleDeleteAddOn = async (id: string) => {
    try {
      await pb.collection('add_ons').delete(id);
      toast.success('Add-on deleted.');
      loadAllData();
    } catch (err) {
      console.error('Failed to delete add-on:', err);
      toast.error(err instanceof Error && err.message ? err.message : 'Failed to delete add-on.');
    }
  };

  /**
   * Saves the packages and add-ons reviewed in Import Catalog. Each one is created active, so the
   * kiosk and cashier offer it right away. Returns the drafts that could not be saved, with the reason.
   */
  const handleImportCatalog = async (packagesToSave: DraftPackage[], addOnsToSave: DraftAddOn[]) => {
    const result = await saveCatalogDrafts(pb, packagesToSave, addOnsToSave);
    await loadAllData();
    return result;
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
  // After each change below, the PDF copies in the client's folder (RECEIPTS\) are redrawn in the background.
  const refreshDocuments = (registrationId: string) => refreshClientDocuments(registrationId, toast.warning);

  const handleUpdateRegistration = async (id: string, data: RegistrationEdits) => {
    await pb.collection('registrations').update(id, data);
    refreshDocuments(id);
    loadAllData();
  };

  // Cancelling keeps the job order and its payment records for the ledger and receipt trail.
  // The caller shows the success or error toast.
  // Voids, refunds, cancellations and restores go through server routes that record who, when and why.
  const handleCancelRegistration = async (id: string, reason: string) => {
    await pb.send(`/api/studioflow/registrations/${id}/cancel`, { method: 'POST', body: { reason } });
    refreshDocuments(id);
    await loadAllData();
  };
  const handleRestoreRegistration = async (id: string) => {
    await pb.send(`/api/studioflow/registrations/${id}/restore`, { method: 'POST' });
    refreshDocuments(id);
    await loadAllData();
  };
  const handleVoidPayment = async (paymentId: string, reason: string) => {
    const voided = await pb.send<PaymentRecord>(`/api/studioflow/payments/${paymentId}/void`, { method: 'POST', body: { reason } });
    refreshDocuments(voided.registration);
    await loadAllData();
  };
  const handleRefund = async (refund: RefundRequest) => {
    const saved = await pb.send<RefundRecord>('/api/studioflow/refunds', { method: 'POST', body: refund });
    refreshDocuments(saved.registration);
    await loadAllData();
    return saved;
  };

  const exportCsv = useCallback(() => {
    exportRegistrationsToCsv(registrations, payments, refunds);
  }, [registrations, payments, refunds]);

  /** Overall workbook: by level (as before), master (one sheet per school), one school, or walk-ins. */
  const exportExcel = async (scope: OverallScope = { kind: 'levels' }, range: DateRange = {}, label = '') => {
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
      await downloadStudentExcel({ packages: data.packages, addOns: data.addOns, rows: data.rows }, scope, range, label);
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
    newPkgKind,
    newPkgRevenue,
    setNewPkgRevenue,
    setNewPkgKind,
    setNewPkgRequiresMua,
    setNewPkgAmount,
    newPkgInclusions,
    setNewPkgInclusions,
    newPkgFreebies,
    setNewPkgFreebies,
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
    handleResetStaffPassword,
    handleSetProductionStatus,
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
    handleImportCatalog,
    // Master List Mutations
    handleDeleteMasterListItem,
    handleClearMasterList,
    // Student Registration Mutations
    handleUpdateRegistration,
    handleCancelRegistration,
    handleRestoreRegistration,
    handleVoidPayment,
    handleRefund,
    refunds,
    // Report Export
    exportCsv,
    exportExcel,
    exportingExcel,
  };
}
