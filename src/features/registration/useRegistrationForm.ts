import { useState, useEffect, useCallback, useRef } from 'react';
import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import type {
  Organization,
  Level,
  SchoolCourse,
  Package,
  AddOn,
  Registration,
  MasterListItem,
} from '../../types';
import { splitFullName } from '../../utils/formatters';
import {
  emailPattern, mobilePattern, packageRequiredMessage, registrationFields, validationProps,
  type RegistrationErrors,
} from './registrationValidation';

export function useRegistrationForm() {
  const { toast } = useToast();

  // Reference Master Data
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [schoolCatalog, setSchoolCatalog] = useState<{
    schoolId: string;
    levels: Level[];
    assignments: SchoolCourse[];
    failed?: boolean;
  } | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [addOnsList, setAddOnsList] = useState<AddOn[]>([]);
  const [masterList, setMasterList] = useState<MasterListItem[]>([]);

  // Form Fields
  const [familyName, setFamilyName] = useState('');
  const [givenName, setGivenName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [preferredLevelId, setPreferredLevelId] = useState('');
  const [preferredCourseId, setPreferredCourseId] = useState('');
  const [section, setSection] = useState('');
  const [department, setDepartment] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [paymentType, setPaymentType] = useState<'full' | 'downpayment'>('full');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Master List Lookup State
  const [searchName, setSearchName] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Submission State
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitting = useRef(false);
  const [submittedRecord, setSubmittedRecord] = useState<Registration | null>(null);

  // 1. Initial Load of Reference Data
  useEffect(() => {
    async function loadReferenceData() {
      try {
        const [orgsRes, addonsRes] = await Promise.all([
          pb.collection('organizations').getFullList<Organization>({
            filter: 'is_active = true',
            requestKey: null,
          }),
          pb.collection('add_ons').getFullList<AddOn>({
            filter: 'is_active = true',
            requestKey: null,
          }),
        ]);

        setOrganizations(orgsRes);
        setAddOnsList(addonsRes);

        // Fetch master list safely (protected under staff auth / RA 10173)
        try {
          const masterRes = await pb.collection('master_lists').getFullList<MasterListItem>({
            requestKey: null,
          });
          setMasterList(masterRes);
        } catch {
          setMasterList([]);
        }
      } catch (err) {
        console.error('Failed to load initial form data:', err);
      }
    }
    loadReferenceData();
  }, []);

  useEffect(() => {
    const collection = pb.collection('packages');
    let active = true;
    let version = 0;
    let unsubscribe: (() => Promise<void>) | undefined;

    async function refreshPackages() {
      const request = ++version;
      try {
        const records = await collection.getFullList<Package>({ filter: 'is_active = true', sort: 'created,id' });
        if (active && request === version) {
          setPackages(records);
          setSelectedPackageId((id) => records.some((pkg) => pkg.id === id) ? id : null);
        }
      } catch (err) {
        if (active && request === version) console.error('Failed to load registration packages:', err);
      }
    }

    void refreshPackages();
    void collection.subscribe('*', refreshPackages).then((stop) => {
      if (!active) return stop();
      unsubscribe = stop;
      return refreshPackages();
    }).catch((err) => console.error('Failed to subscribe to registration packages:', err));

    return () => {
      active = false;
      void unsubscribe?.().catch(console.error);
    };
  }, []);

  // Fetch the selected school's levels and assignments together. Ignore late results
  // after switching schools so an old response cannot repopulate the dropdowns.
  useEffect(() => {
    if (!selectedOrgId) return;
    let current = true;
    async function loadSchoolCatalog() {
      try {
        const [levels, assignments] = await Promise.all([
          pb.collection('levels').getFullList<Level>({
            filter: pb.filter('organization = {:schoolId}', { schoolId: selectedOrgId }),
            sort: 'order,name',
          }),
          pb.collection('school_courses').getFullList<SchoolCourse>({
            filter: pb.filter('school_id = {:schoolId}', { schoolId: selectedOrgId }),
            expand: 'course_id',
            sort: 'course_id.name',
          }),
        ]);
        if (current) setSchoolCatalog({ schoolId: selectedOrgId, levels, assignments });
      } catch (err) {
        if (current) {
          console.error('Failed to load school courses:', err);
          setSchoolCatalog({ schoolId: selectedOrgId, levels: [], assignments: [], failed: true });
        }
      }
    }
    loadSchoolCatalog();
    return () => { current = false; };
  }, [selectedOrgId]);

  const catalog = schoolCatalog?.schoolId === selectedOrgId ? schoolCatalog : null;
  const levels = catalog?.levels ?? [];
  const preferredLevel = levels.find((level) => level.id === preferredLevelId);
  const selectedLevelId = preferredLevel?.id ?? '';
  const courses = catalog?.assignments.flatMap((assignment) =>
    assignment.level === selectedLevelId && assignment.expand?.course_id ? [assignment.expand.course_id] : []
  ) ?? [];
  const selectedCourseId = courses.some((course) => course.id === preferredCourseId)
    ? preferredCourseId : '';

  const clearErrors = useCallback((...fields: (keyof RegistrationErrors)[]) => {
    setErrors((previous) => {
      if (!fields.some((field) => previous[field])) return previous;
      const next = { ...previous };
      fields.forEach((field) => delete next[field]);
      return next;
    });
  }, []);

  const changeField = <T,>(field: keyof RegistrationErrors, setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      clearErrors(field);
    };

  const changeSchool = (schoolId: string) => {
    if (schoolId === selectedOrgId) return;
    setSchoolCatalog(null);
    setSelectedOrgId(schoolId);
    setPreferredLevelId('');
    setPreferredCourseId('');
    clearErrors('organization', 'level', 'course');
  };

  const changeLevel = (levelId: string) => {
    setPreferredLevelId(levelId);
    setPreferredCourseId('');
    clearErrors('level', 'course');
  };

  // Master list selection auto-fill
  const selectFromMasterList = useCallback((item: MasterListItem) => {
    const { familyName: fName, givenName: gName } = splitFullName(item.full_name);
    if (fName) setFamilyName(fName);
    setGivenName(gName);
    if (item.email) setEmail(item.email);
    if (item.mobile_number) setMobileNumber(item.mobile_number);
    if (item.section) setSection(item.section);
    if (item.organization && organizations.some((school) => school.id === item.organization)) {
      if (item.organization !== selectedOrgId) setSchoolCatalog(null);
      setSelectedOrgId(item.organization);
      setPreferredLevelId(item.level || '');
      setPreferredCourseId(item.course || '');
    }
    setSearchName('');
    setIsSearching(false);
    clearErrors('family_name', 'given_name', 'email', 'mobile_number', 'organization', 'level', 'course');
  }, [clearErrors, organizations, selectedOrgId]);

  const toggleAddOn = useCallback((id: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  // Live Total Calculation
  const selectedPackage = packages.find((pkg) => pkg.id === selectedPackageId);
  const totalAmount = selectedPackage
    ? selectedPackage.amount + addOnsList.reduce((sum, item) => (
      selectedAddOns.includes(item.id) ? sum + item.amount : sum
    ), 0)
    : 0;

  // Signature Handler
  const handleSignatureChange = useCallback((blob: Blob | null, dataUrl?: string | null) => {
    setSignatureBlob(blob);
    setSignatureDataUrl(dataUrl || null);
    if (blob) clearErrors('signature');
  }, [clearErrors]);

  const showErrors = (fieldErrors: RegistrationErrors) => {
    setErrors(fieldErrors);
    const field = fieldErrors.package ? 'package' : registrationFields.find((key) => fieldErrors[key]);
    if (!field) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(validationProps(field).id);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: field === 'package' ? 'start' : 'center', behavior: 'smooth' });
    });
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;

    const cleanEmail = email.trim();
    const cleanMobile = mobileNumber.trim();
    const fieldErrors: RegistrationErrors = {};
    if (!familyName.trim()) fieldErrors.family_name = 'Enter your family name.';
    if (!givenName.trim()) fieldErrors.given_name = 'Enter your given name.';
    if (!selectedOrgId) fieldErrors.organization = 'Select your school, campus, or organization.';
    if (!selectedLevelId) fieldErrors.level = 'Select your academic level.';
    if (!selectedCourseId) fieldErrors.course = 'Select a course or strand for this school and academic level.';
    if (!cleanEmail) fieldErrors.email = 'Enter your email address.';
    else if (!emailPattern.test(cleanEmail)) fieldErrors.email = 'Enter a valid email address.';
    if (cleanMobile && !mobilePattern.test(cleanMobile.replace(/[ -]/g, ''))) {
      fieldErrors.mobile_number = 'Enter a valid Philippine mobile number, such as 0917-000-0000.';
    }
    if (!termsAccepted) fieldErrors.terms_accepted = 'Agree to the Terms & Conditions to proceed.';
    if (!selectedPackage || !signatureBlob || Object.keys(fieldErrors).length) {
      if (!selectedPackage) fieldErrors.package = packageRequiredMessage;
      if (!signatureBlob) fieldErrors.signature = 'Provide your digital signature on the signature pad.';
      showErrors(fieldErrors);
      return;
    }

    submitting.current = true;
    setErrors({});
    setIsSubmitting(true);
    try {
      const selectedAddOnObjects = selectedAddOns.map((id) => {
        const item = addOnsList.find((a) => a.id === id);
        return { id, code: item?.code, name: item?.name || '', amount: item?.amount || 0 };
      });

      const formData = new FormData();
      formData.append('family_name', familyName.trim());
      formData.append('given_name', givenName.trim());
      formData.append('middle_name', middleName.trim());
      formData.append('organization', selectedOrgId);
      formData.append('level', selectedLevelId);
      formData.append('course', selectedCourseId);
      formData.append('section', section.trim());
      formData.append('department', department.trim());
      formData.append('mobile_number', cleanMobile);
      formData.append('email', cleanEmail);
      formData.append('package', selectedPackage.id);
      formData.append('add_ons', JSON.stringify(selectedAddOnObjects));
      formData.append('paid_amount', '0');
      formData.append('payment_type', paymentType);
      formData.append('payment_status', 'unpaid');
      formData.append('status', 'pending_payment');
      formData.append('terms_accepted', 'true');
      formData.append('signature', signatureBlob, 'signature.png');

      const created = await pb.collection('registrations').create<Registration>(formData, {
        expand: 'organization,level,course,package',
      });

      if (signatureDataUrl) {
        created.signatureDataUrl = signatureDataUrl;
      }

      toast.success('Registration submitted! Official Job Order recorded.');
      setSubmittedRecord(created);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      console.error('Registration submission failed:', err);
      if (err instanceof ClientResponseError) {
        const fieldErrors: RegistrationErrors = {};
        for (const field of registrationFields) {
          const message = err.response.data?.[field]?.message;
          if (typeof message === 'string') fieldErrors[field] = message;
        }
        if (Object.keys(fieldErrors).length) {
          showErrors(fieldErrors);
          return;
        }
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to submit registration. Please ensure the PocketBase backend server is running.';
      toast.error(message);
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const resetForm = useCallback(() => {
    setFamilyName('');
    setGivenName('');
    setMiddleName('');
    setSelectedOrgId('');
    setPreferredLevelId('');
    setPreferredCourseId('');
    setSchoolCatalog(null);
    setSection('');
    setDepartment('');
    setMobileNumber('');
    setEmail('');
    setSelectedPackageId(null);
    setSelectedAddOns([]);
    setPaymentType('full');
    setTermsAccepted(false);
    setSignatureBlob(null);
    setSignatureDataUrl(null);
    setSubmittedRecord(null);
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return {
    // Master Data
    organizations,
    levels,
    courses,
    packages,
    addOnsList,
    masterList,
    // Form State & Setters
    familyName,
    setFamilyName: changeField('family_name', setFamilyName),
    givenName,
    setGivenName: changeField('given_name', setGivenName),
    middleName,
    setMiddleName,
    selectedOrgId,
    setSelectedOrgId: changeSchool,
    selectedLevelId,
    setSelectedLevelId: changeLevel,
    selectedCourseId,
    setSelectedCourseId: changeField('course', setPreferredCourseId),
    schoolCatalogLoading: !!selectedOrgId && !catalog,
    schoolCatalogFailed: !!catalog?.failed,
    section,
    setSection,
    mobileNumber,
    setMobileNumber: changeField('mobile_number', setMobileNumber),
    email,
    setEmail: changeField('email', setEmail),
    selectedPackageId: selectedPackage?.id ?? null,
    setSelectedPackageId: changeField('package', (id: string) => setSelectedPackageId(id)),
    selectedAddOns,
    toggleAddOn,
    paymentType,
    setPaymentType,
    termsAccepted,
    setTermsAccepted: changeField('terms_accepted', setTermsAccepted),
    signatureBlob,
    signatureDataUrl,
    hasSignature: Boolean(signatureBlob),
    setSignatureBlob,
    handleSignatureChange,
    // Master List Lookup
    searchName,
    setSearchName,
    isSearching,
    setIsSearching,
    selectFromMasterList,
    // Computed & Actions
    totalAmount,
    errors,
    isSubmitting,
    submittedRecord,
    handleSubmit,
    resetForm,
  };
}
