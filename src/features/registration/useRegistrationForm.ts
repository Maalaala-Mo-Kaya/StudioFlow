import { useState, useEffect, useMemo, useCallback } from 'react';
import { pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import type {
  Organization,
  Level,
  Course,
  Package,
  AddOn,
  Registration,
  MasterListItem,
} from '../../types';
import { splitFullName } from '../../utils/formatters';

export function useRegistrationForm() {
  const { toast } = useToast();

  // Reference Master Data
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [addOnsList, setAddOnsList] = useState<AddOn[]>([]);
  const [masterList, setMasterList] = useState<MasterListItem[]>([]);

  // Form Fields
  const [familyName, setFamilyName] = useState('');
  const [givenName, setGivenName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedLevelId, setSelectedLevelId] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [section, setSection] = useState('');
  const [department, setDepartment] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [email, setEmail] = useState('');

  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [paymentType, setPaymentType] = useState<'full' | 'downpayment'>('full');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  // Master List Lookup State
  const [searchName, setSearchName] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedRecord, setSubmittedRecord] = useState<Registration | null>(null);

  // 1. Initial Load of Reference Data
  useEffect(() => {
    async function loadReferenceData() {
      try {
        const [orgsRes, pkgsRes, addonsRes] = await Promise.all([
          pb.collection('organizations').getFullList<Organization>({
            filter: 'is_active = true',
            requestKey: null,
          }),
          pb.collection('packages').getFullList<Package>({
            filter: 'is_active = true',
            requestKey: null,
          }),
          pb.collection('add_ons').getFullList<AddOn>({
            filter: 'is_active = true',
            requestKey: null,
          }),
        ]);

        setOrganizations(orgsRes);
        setPackages(pkgsRes);
        setAddOnsList(addonsRes);

        if (orgsRes.length > 0) setSelectedOrgId(orgsRes[0].id);
        if (pkgsRes.length > 0) setSelectedPackageId(pkgsRes[0].id);

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

  // 2. Cascade load levels when organization changes
  useEffect(() => {
    if (!selectedOrgId) {
      setLevels([]);
      return;
    }
    async function loadLevels() {
      try {
        const res = await pb.collection('levels').getFullList<Level>({
          filter: pb.filter('organization = {:orgId}', { orgId: selectedOrgId }),
          sort: 'order',
          requestKey: null,
        });
        setLevels(res);
        setSelectedLevelId(res.length > 0 ? res[0].id : '');
      } catch (err) {
        console.error('Failed to load levels:', err);
      }
    }
    loadLevels();
  }, [selectedOrgId]);

  // 3. Cascade load courses when level changes
  useEffect(() => {
    if (!selectedLevelId) {
      setCourses([]);
      return;
    }
    async function loadCourses() {
      try {
        const res = await pb.collection('courses').getFullList<Course>({
          filter: pb.filter('level = {:levelId}', { levelId: selectedLevelId }),
          requestKey: null,
        });
        setCourses(res);
        setSelectedCourseId(res.length > 0 ? res[0].id : '');
      } catch (err) {
        console.error('Failed to load courses:', err);
      }
    }
    loadCourses();
  }, [selectedLevelId]);

  // Master list selection auto-fill
  const selectFromMasterList = useCallback((item: MasterListItem) => {
    const { familyName: fName, givenName: gName } = splitFullName(item.full_name);
    if (fName) setFamilyName(fName);
    setGivenName(gName);
    if (item.email) setEmail(item.email);
    if (item.mobile_number) setMobileNumber(item.mobile_number);
    if (item.section) setSection(item.section);
    if (item.organization) setSelectedOrgId(item.organization);
    if (item.level) setSelectedLevelId(item.level);
    if (item.course) setSelectedCourseId(item.course);
    setSearchName('');
    setIsSearching(false);
  }, []);

  const toggleAddOn = useCallback((id: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  // Live Total Calculation
  const totalAmount = useMemo(() => {
    const selectedPackage = packages.find((p) => p.id === selectedPackageId);
    const packageAmount = selectedPackage ? selectedPackage.amount : 0;
    const addOnsTotal = selectedAddOns.reduce((sum, id) => {
      const item = addOnsList.find((a) => a.id === id);
      return sum + (item ? item.amount : 0);
    }, 0);
    return packageAmount + addOnsTotal;
  }, [packages, selectedPackageId, selectedAddOns, addOnsList]);

  // Signature Handler
  const handleSignatureChange = useCallback((blob: Blob | null, dataUrl?: string | null) => {
    setSignatureBlob(blob);
    setSignatureDataUrl(dataUrl || null);
  }, []);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!familyName.trim() || !givenName.trim()) {
      toast.error('Please enter both Family Name and Given Name.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!mobileNumber.trim()) {
      toast.error('Please provide a valid contact mobile number.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!selectedPackageId) {
      toast.error('Please select a pictorial package.');
      return;
    }
    if (!termsAccepted) {
      toast.error('You must agree to the Terms & Conditions to proceed.');
      return;
    }
    if (!signatureBlob) {
      toast.error('Please provide your digital signature on the signature pad.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedAddOnObjects = selectedAddOns.map((id) => {
        const item = addOnsList.find((a) => a.id === id);
        return { code: item?.code, name: item?.name || '', amount: item?.amount || 0 };
      });

      const formData = new FormData();
      formData.append('family_name', familyName.trim());
      formData.append('given_name', givenName.trim());
      formData.append('middle_name', middleName.trim());
      if (selectedOrgId) formData.append('organization', selectedOrgId);
      if (selectedLevelId) formData.append('level', selectedLevelId);
      if (selectedCourseId) formData.append('course', selectedCourseId);
      formData.append('section', section.trim());
      formData.append('department', department.trim());
      formData.append('mobile_number', mobileNumber.trim());
      formData.append('email', email.trim());
      formData.append('package', selectedPackageId);
      formData.append('add_ons', JSON.stringify(selectedAddOnObjects));
      formData.append('total_amount', String(totalAmount));
      formData.append('balance', String(totalAmount));
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
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to submit registration. Please ensure the PocketBase backend server is running.';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = useCallback(() => {
    setFamilyName('');
    setGivenName('');
    setMiddleName('');
    setSection('');
    setDepartment('');
    setMobileNumber('');
    setEmail('');
    setSelectedAddOns([]);
    setTermsAccepted(false);
    setSignatureBlob(null);
    setSignatureDataUrl(null);
    setSubmittedRecord(null);
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
    setFamilyName,
    givenName,
    setGivenName,
    middleName,
    setMiddleName,
    selectedOrgId,
    setSelectedOrgId,
    selectedLevelId,
    setSelectedLevelId,
    selectedCourseId,
    setSelectedCourseId,
    section,
    setSection,
    mobileNumber,
    setMobileNumber,
    email,
    setEmail,
    selectedPackageId,
    setSelectedPackageId,
    selectedAddOns,
    toggleAddOn,
    paymentType,
    setPaymentType,
    termsAccepted,
    setTermsAccepted,
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
    isSubmitting,
    submittedRecord,
    handleSubmit,
    resetForm,
  };
}
