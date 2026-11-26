import { useState, useEffect, useEffectEvent, useLayoutEffect, useCallback, useRef } from 'react';
import { ClientResponseError } from 'pocketbase';
// The kiosk talks to the server as a guest, whoever is signed in on this browser.
import { kioskPb as pb } from '../../db/pocketbase';
import { useToast } from '../../context/ToastContext';
import type {
  Registration,
  MasterListItem,
} from '../../types';
import type { ClientKind } from '../../types';
import { splitFullName } from '../../utils/formatters';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import { randomId } from '../../utils/randomId';
import {
  activeKind, availableKinds as kindsIn, clearRegistrationDraft, readRegistrationDraft,
  registrationDraftLifetime, saveRegistrationDraft, textFields, type RegistrationConfiguration, type RegistrationDraft, type RegistrationStepId,
} from './registrationDraft';
import { isMakeupArtistService, registrationAddOns } from './registrationAddOns';
import { makeRegistrationQuote, recaptureSignature, reconcileRegistration, registrationTerms, termsKey } from './registrationRecovery';
import { keepValidPicks, missingPicks, optionGroups, picksPayload, type OptionPicks } from '../../utils/packageOptions';
import {
  emailPattern, mobilePattern, packageRequiredMessage, registrationFields, registrationNameLimit, validationProps,
  type RegistrationErrors,
} from './registrationValidation';

export function useRegistrationForm() {
  const { toast } = useToast();
  const [initial] = useState(readRegistrationDraft);
  const [requestId, setRequestId] = useState(() => initial?.requestId ?? randomId());
  const [stepId, setStepId] = useState<RegistrationStepId>(initial?.step ?? 'package');
  const [reachedId, setReachedId] = useState<RegistrationStepId>(initial?.reached ?? 'package');
  const [notices, setNotices] = useState(initial?.notices ?? []);
  const [reviewNeeded, setReviewNeeded] = useState(initial?.reviewNeeded ?? false);
  const [dismissedVersion, setDismissedVersion] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [draftStored, setDraftStored] = useState(true);
  const [registrationCatalog, setRegistrationCatalog] = useState<RegistrationConfiguration | null>(null);
  const { data: published, error: catalogError, refresh: refreshCatalog } =
    useWorkflowData<RegistrationConfiguration>('/registration-catalog', 8_000, false, 'studioflow-registration-catalog');
  const pendingUpdate = !!registrationCatalog && !!published && registrationCatalog.version !== published.version;
  const [chosenKind, setChosenKind] = useState<ClientKind | ''>(initial?.chosenKind ?? '');
  const availableKinds = kindsIn(registrationCatalog);
  const clientKind = activeKind(availableKinds, chosenKind);
  const isWalkIn = clientKind === 'walkin';
  const [sessionTypeId, setSessionTypeId] = useState(initial?.sessionTypeId ?? '');
  const [eventDate, setEventDate] = useState(initial?.eventDate ?? '');
  const [eventVenue, setEventVenue] = useState(initial?.eventVenue ?? '');
  const [clientOrg, setClientOrg] = useState(initial?.clientOrg ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const sessionTypes = registrationCatalog?.sessionTypes ?? [];
  const selectedSession = sessionTypes.find((type) => type.id === sessionTypeId);
  const walkinTerms = registrationTerms(registrationCatalog, 'walkin');
  const organizations = registrationCatalog?.organizations ?? [];
  const packages = registrationCatalog?.packages ?? [];
  const addOnsList = registrationCatalog?.addOns ?? [];
  const [masterList, setMasterList] = useState<MasterListItem[]>([]);

  // Form Fields
  const [familyName, setFamilyName] = useState(initial?.familyName ?? '');
  const [givenName, setGivenName] = useState(initial?.givenName ?? '');
  const [middleName, setMiddleName] = useState(initial?.middleName ?? '');
  const [gender, setGender] = useState(initial?.gender ?? '');
  const [studentId, setStudentId] = useState(initial?.studentId ?? '');
  const [selectedOrgId, setSelectedOrgId] = useState(initial?.selectedOrgId ?? '');
  const [preferredLevelId, setPreferredLevelId] = useState(initial?.preferredLevelId ?? '');
  const [preferredCourseId, setPreferredCourseId] = useState(initial?.preferredCourseId ?? '');
  const [section, setSection] = useState(initial?.section ?? '');
  const [department, setDepartment] = useState(initial?.department ?? '');
  const [mobileNumber, setMobileNumber] = useState(initial?.mobileNumber ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');

  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(initial?.selectedPackageId ?? null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>(initial?.selectedAddOns ?? []);
  const [optionPicks, setOptionPicks] = useState<OptionPicks>(initial?.optionPicks ?? {});
  const [makeupLookNote, setMakeupLookNote] = useState(initial?.makeupLookNote ?? '');
  const [paymentType, setPaymentType] = useState<'full' | 'downpayment'>(initial?.paymentType ?? 'full');
  const [termsAccepted, setTermsAccepted] = useState(initial?.termsAccepted ?? false);
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

  useEffect(() => {
    let active = true;
    void pb.collection('master_lists').getFullList<MasterListItem>().then((items) => {
      if (active) setMasterList(items);
    }).catch((error: unknown) => {
      // The optional staff roster is deliberately unavailable to kiosk guests.
      if (active && !(error instanceof ClientResponseError && [401, 403, 404].includes(error.status))) {
        console.error('Failed to load the optional registration roster:', error);
      }
    });
    return () => { active = false; };
  }, []);

  const levels = registrationCatalog?.levels.filter((level) => level.organization === selectedOrgId) ?? [];
  const selectedLevelId = levels.find((level) => level.id === preferredLevelId)?.id ?? '';
  const courses = registrationCatalog?.schoolCourses.flatMap((assignment) =>
    assignment.school_id === selectedOrgId && assignment.level === selectedLevelId && assignment.expand?.course_id
      ? [assignment.expand.course_id] : []
  ) ?? [];
  const selectedCourseId = courses.some((course) => course.id === preferredCourseId) ? preferredCourseId : '';

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
  const selectFromMasterList = (item: MasterListItem) => {
    setStudentId(item.student_id ?? '');
    const { familyName: fName, givenName: gName } = splitFullName(item.full_name);
    if (fName) setFamilyName(fName);
    setGivenName(gName);
    if (item.email) setEmail(item.email);
    // Same rule as typing: digits only, 11 at most (+63 9… becomes 09…).
    if (item.mobile_number) setMobileNumber(item.mobile_number.replace(/\D/g, '').replace(/^63(?=9)/, '0').slice(0, 11));
    if (item.section) setSection(item.section);
    if (item.organization && organizations.some((school) => school.id === item.organization)) {
      setSelectedOrgId(item.organization);
      setPreferredLevelId(item.level || '');
      setPreferredCourseId(item.course || '');
    }
    setSearchName('');
    setIsSearching(false);
    clearErrors('family_name', 'given_name', 'middle_name', 'gender', 'email', 'mobile_number', 'organization', 'level', 'course');
  };

  const toggleAddOn = useCallback((id: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }, []);

  // Packages offered to this type of client (older packages without a type are school packages).
  const kindPackages = clientKind
    ? packages.filter((pkg) => [clientKind, 'both'].includes(pkg.client_kind || 'school'))
    : [];

  // Add-ons offered to this type of client (older add-ons without a type are offered to both).
  const kindAddOns = clientKind
    ? addOnsList.filter((item) => [clientKind, 'both'].includes(item.client_kind || 'both'))
    : [];
  const selectedPackage = kindPackages.find((pkg) => pkg.id === selectedPackageId);
  const { manualAddOns, selected, defaultAddOn, requiresMua: asksLook, totalAmount } =
    registrationAddOns(selectedPackage, kindAddOns, selectedAddOns);
  const selectMakeupService = (id: string) => {
    const serviceIds = new Set(manualAddOns.filter(isMakeupArtistService).map((item) => item.id));
    setSelectedAddOns((previous) => [
      ...previous.filter((item) => !serviceIds.has(item)),
      ...(serviceIds.has(id) ? [id] : []),
    ]);
  };
  // The package's option groups, and the picks that still apply to this package and gender.
  const packageOptionGroups = optionGroups(selectedPackage);
  const clientGender = gender === 'male' || gender === 'female' ? gender : '';
  const validPicks = keepValidPicks(packageOptionGroups, clientGender, optionPicks);

  const draft: RegistrationDraft = {
    requestId, chosenKind: clientKind || chosenKind, selectedPackageId, selectedAddOns, optionPicks, paymentType,
    familyName, givenName, middleName, gender, studentId, selectedOrgId, preferredLevelId, preferredCourseId,
    section, department, mobileNumber, email, sessionTypeId, eventDate, eventVenue, clientOrg, notes, makeupLookNote,
    termsAccepted, hadSignature: !!signatureBlob, step: stepId, reached: reachedId, notices, reviewNeeded,
    quote: registrationCatalog ? makeRegistrationQuote(selectedPackage, { selected, defaultAddOn }, termsKey(registrationCatalog, clientKind)) : undefined,
  };
  const hasProgress = !!(draft.selectedPackageId || draft.selectedAddOns.length || draft.chosenKind && availableKinds.length > 1
    || textFields.some((field) => draft[field]) || draft.step !== 'package' || draft.notices.length);
  const serialized = hasProgress ? JSON.stringify(draft) : '';
  const draftReady = !!registrationCatalog && !submittedRecord;
  const expireDraft = useEffectEvent(() => {
    if (submitting.current) clearRegistrationDraft();
    else resetForm();
  });
  useLayoutEffect(() => {
    if (!draftReady) return;
    if (!serialized) {
      clearRegistrationDraft();
      return;
    }
    const saved = saveRegistrationDraft(serialized);
    setDraftStored(saved);
    if (saved) {
      const expiration = window.setTimeout(() => expireDraft(), registrationDraftLifetime);
      return () => window.clearTimeout(expiration);
    }
  }, [serialized, draftReady]);

  function applyConfiguration(config: RegistrationConfiguration, saved: RegistrationDraft | null) {
    if (saved) {
      const next = reconcileRegistration(saved, config);
      setSelectedPackageId(next.selectedPackageId);
      setSelectedAddOns(next.selectedAddOns);
      setOptionPicks(next.optionPicks);
      setSelectedOrgId(next.selectedOrgId);
      setPreferredLevelId(next.preferredLevelId);
      setPreferredCourseId(next.preferredCourseId);
      setSessionTypeId(next.sessionTypeId);
      setTermsAccepted(next.termsAccepted);
      setNotices(next.notices);
      setReviewNeeded(next.reviewNeeded);
      setStepId(next.step);
      setReachedId(next.reached);
      setSignatureBlob(null);
      setSignatureDataUrl(null);
    }
    setRegistrationCatalog(config);
    setRefreshRequired(false);
    setDismissedVersion('');
  }

  const applyInitialConfiguration = useEffectEvent((config: RegistrationConfiguration) => applyConfiguration(config, initial));
  const initialized = useRef(false);
  useEffect(() => {
    if (!published || initialized.current) return;
    initialized.current = true;
    applyInitialConfiguration(published);
  }, [published]);

  function refreshAndContinue() {
    if (submitting.current) return;
    if (!hasProgress || saveRegistrationDraft(JSON.stringify(draft))) {
      window.location.reload();
    } else if (published && pendingUpdate) {
      applyConfiguration(published, draft);
    } else {
      refreshCatalog();
      toast.error('Draft storage is unavailable. Keep this page open while StudioFlow checks for updates.');
    }
  }

  // Signature Handler
  const handleSignatureChange = (blob: Blob | null, dataUrl?: string | null) => {
    setSignatureBlob(blob);
    setSignatureDataUrl(dataUrl || null);
    if (blob) {
      clearErrors('signature');
      setNotices((current) => current.filter((message) => message !== recaptureSignature));
    }
  };

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

  /**
   * Every problem in the form, by field (the kiosk steps check their own fields with it before Next,
   * and Submit checks all of them).
   */
  const collectErrors = (): RegistrationErrors => {
    const cleanEmail = email.trim();
    const cleanMobile = mobileNumber.trim();
    const fieldErrors: RegistrationErrors = {};
    if (!familyName.trim()) fieldErrors.family_name = 'Enter your family name.';
    if (!givenName.trim()) fieldErrors.given_name = 'Enter your given name.';
    const names = [
      ['family_name', 'Family name', familyName],
      ['given_name', 'Given name', givenName],
      ['middle_name', 'Middle name', middleName],
    ] as const;
    for (const [field, label, value] of names) {
      if (Array.from(value.trim()).length > registrationNameLimit) {
        fieldErrors[field] = `${label} must be ${registrationNameLimit} characters or fewer.`;
      }
    }
    if (!['male', 'female'].includes(gender)) fieldErrors.gender = "Please select the client's gender.";
    if (!clientKind) {
      fieldErrors.client_kind = availableKinds.length ? 'Choose the type of client.' : 'Registration is closed right now. Please ask the staff.';
    } else if (isWalkIn) {
      if (!selectedSession) fieldErrors.session_type = 'Select the type of session.';
      else if (selectedSession.on_location) {
        if (!eventDate) fieldErrors.event_date = 'Enter the event date.';
        if (!eventVenue.trim()) fieldErrors.event_venue = 'Enter the event venue.';
      }
    } else {
      if (!organizations.some((school) => school.id === selectedOrgId)) fieldErrors.organization = 'Select your school, campus, or organization.';
      if (!selectedLevelId) fieldErrors.level = 'Select your academic level.';
      if (!selectedCourseId) fieldErrors.course = 'Select a course or strand for this school and academic level.';
    }
    if (cleanEmail && !emailPattern.test(cleanEmail)) fieldErrors.email = 'Enter a valid email address.';
    if (!cleanMobile) fieldErrors.mobile_number = 'Mobile number is required.';
    else if (!/^09\d{9}$/.test(cleanMobile) || !mobilePattern.test(cleanMobile)) {
      fieldErrors.mobile_number = 'Enter the 11-digit mobile number starting with 09, such as 09170000000.';
    }
    // Options are checked once the gender is known (some choices are for one gender only).
    const optionsMissing = selectedPackage && clientGender ? missingPicks(packageOptionGroups, clientGender, validPicks) : null;
    if (optionsMissing) fieldErrors.package_options = optionsMissing;
    if (!termsAccepted) fieldErrors.terms_accepted = 'Agree to the Terms & Conditions to proceed.';
    if (!selectedPackage) fieldErrors.package = packageRequiredMessage;
    if (!signatureBlob) fieldErrors.signature = 'Provide your digital signature on the signature pad.';
    return fieldErrors;
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    if (!registrationCatalog || pendingUpdate || refreshRequired) {
      setRefreshRequired(true);
      refreshCatalog();
      return;
    }
    if (reviewNeeded) {
      document.getElementById('registration-review-changes')?.focus();
      return;
    }

    const cleanEmail = email.trim();
    const cleanMobile = mobileNumber.trim();
    const fieldErrors = collectErrors();
    if (!selectedPackage || !signatureBlob || Object.keys(fieldErrors).length) {
      showErrors(fieldErrors);
      return;
    }

    submitting.current = true;
    setErrors({});
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('registration_version', registrationCatalog.version);
      formData.append('registration_request_id', requestId);
      formData.append('family_name', familyName.trim());
      formData.append('given_name', givenName.trim());
      formData.append('middle_name', middleName.trim());
      formData.append('gender', gender);
      formData.append('client_kind', clientKind);
      if (isWalkIn) {
        formData.append('session_type', selectedSession?.id ?? '');
        if (selectedSession?.on_location) {
          formData.append('event_date', eventDate + ' 00:00:00.000Z');
          formData.append('event_venue', eventVenue.trim());
        }
        formData.append('client_org', clientOrg.trim());
        formData.append('notes', notes.trim());
      } else {
        formData.append('student_id', studentId.trim());
        formData.append('organization', selectedOrgId);
        formData.append('level', selectedLevelId);
        formData.append('course', selectedCourseId);
        formData.append('section', section.trim());
        formData.append('department', department.trim());
      }
      formData.append('mobile_number', cleanMobile);
      formData.append('email', cleanEmail);
      formData.append('package', selectedPackage.id);
      formData.append('add_ons', JSON.stringify(selected.map(({ id }) => ({ id }))));
      formData.append('package_options', JSON.stringify(picksPayload(validPicks)));
      formData.append('no_mua_default_quote', defaultAddOn
        ? `${defaultAddOn.id}:${Math.round(defaultAddOn.amount * 100)}`
        : 'none');
      if (asksLook) {
        formData.append('makeup_look_note', makeupLookNote.trim());
      }
      formData.append('paid_amount', '0');
      formData.append('payment_type', paymentType);
      formData.append('payment_status', 'unpaid');
      formData.append('status', 'pending_payment');
      formData.append('terms_accepted', 'true');
      formData.append('signature', signatureBlob, 'signature.png');

      const created = await pb.collection('registrations').create<Registration>(formData, {
        expand: 'organization,level,course,package,session_type',
      });

      if (signatureDataUrl) {
        created.signatureDataUrl = signatureDataUrl;
      }

      clearRegistrationDraft();
      toast.success('Registration submitted. Show your reference to the cashier.');
      setSubmittedRecord(created);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: unknown) {
      refreshCatalog();
      console.error('Registration submission failed:', err);
      if (err instanceof ClientResponseError) {
        if (err.status === 409) {
          setRefreshRequired(true);
          return;
        }
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

  function resetForm() {
    clearRegistrationDraft();
    setRequestId(randomId());
    setStepId('package');
    setReachedId('package');
    setNotices([]);
    setReviewNeeded(false);
    setRefreshRequired(false);
    setDismissedVersion('');
    if (published) setRegistrationCatalog(published);
    setFamilyName('');
    setGivenName('');
    setMiddleName('');
    setGender('');
    setStudentId('');
    setSelectedOrgId('');
    setPreferredLevelId('');
    setPreferredCourseId('');
    setSection('');
    setDepartment('');
    setChosenKind('');
    setSessionTypeId('');
    setEventDate('');
    setEventVenue('');
    setClientOrg('');
    setNotes('');
    setMobileNumber('');
    setEmail('');
    setSelectedPackageId(null);
    setSelectedAddOns([]);
    setOptionPicks({});
    setMakeupLookNote('');
    setPaymentType('full');
    setTermsAccepted(false);
    setSignatureBlob(null);
    setSignatureDataUrl(null);
    setSearchName('');
    setIsSearching(false);
    setSubmittedRecord(null);
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const changeKind = (kind: ClientKind) => {
    setChosenKind(kind);
    setSelectedPackageId(null);
    setSelectedAddOns([]);
    setOptionPicks({});
    setTermsAccepted(false);
    setSignatureBlob(null);
    setSignatureDataUrl(null);
    clearErrors('client_kind', 'package', 'package_options');
  };

  return {
    // Client type & walk-in details
    studioLoaded: !!registrationCatalog,
    availableKinds,
    clientKind,
    setClientKind: changeKind,
    isWalkIn,
    sessionTypes,
    sessionTypeId,
    setSessionTypeId: (id: string) => { setSessionTypeId(id); clearErrors('session_type', 'event_date', 'event_venue'); },
    selectedSession,
    eventDate,
    setEventDate: changeField('event_date', setEventDate),
    eventVenue,
    setEventVenue: changeField('event_venue', setEventVenue),
    clientOrg,
    setClientOrg,
    notes,
    setNotes,
    walkinTerms,
    // Master Data
    organizations,
    levels,
    courses,
    packages: kindPackages,
    addOnsList: manualAddOns,
    defaultAddOn,
    catalogError,
    refreshCatalog,
    masterList,
    // Form State & Setters
    familyName,
    setFamilyName: changeField('family_name', setFamilyName),
    givenName,
    setGivenName: changeField('given_name', setGivenName),
    middleName,
    setMiddleName: changeField('middle_name', setMiddleName),
    gender,
    setGender: changeField('gender', setGender),
    studentId,
    setStudentId,
    selectedOrgId,
    setSelectedOrgId: changeSchool,
    selectedLevelId,
    setSelectedLevelId: changeLevel,
    selectedCourseId,
    setSelectedCourseId: changeField('course', setPreferredCourseId),
    schoolCatalogLoading: !registrationCatalog,
    schoolCatalogFailed: !registrationCatalog && !!catalogError,
    section,
    setSection,
    mobileNumber,
    setMobileNumber: changeField('mobile_number', setMobileNumber),
    email,
    setEmail: changeField('email', setEmail),
    selectedPackageId: selectedPackage?.id ?? null,
    setSelectedPackageId: changeField('package', (id: string) => {
      if (id !== selectedPackageId) { setSelectedPackageId(id); setOptionPicks({}); }
    }),
    selectedAddOns: selected.map(({ id }) => id),
    toggleAddOn,
    selectMakeupService,
    packageOptionGroups,
    optionPicks: validPicks,
    setOptionPicks: changeField('package_options', setOptionPicks),
    asksLook,
    makeupLookNote,
    setMakeupLookNote,
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
    // Kiosk steps: check a step's fields before Next, and show only those errors.
    collectErrors,
    showErrors,
    resetForm,
    stepId, setStepId, reachedId, setReachedId, hasProgress,
    notices, reviewNeeded,
    confirmReview: () => { setReviewNeeded(false); setNotices((current) => current.filter((message) => message === recaptureSignature)); },
    showUpdate: refreshRequired || (pendingUpdate && dismissedVersion !== published?.version),
    deferredUpdate: pendingUpdate && dismissedVersion === published?.version,
    dismissUpdate: () => { setDismissedVersion(published?.version ?? ''); setRefreshRequired(false); },
    refreshAndContinue,
    draftStored,
  };
}
