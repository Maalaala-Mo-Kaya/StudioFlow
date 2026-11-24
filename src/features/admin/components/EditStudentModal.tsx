import React, { useState } from 'react';
import { RecordActionButton } from '../../../components/common/RecordActionButton';
import { Modal } from '../../../components/common/Modal';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import type {
  AddOn,
  RegistrationAddOn,
  Registration,
  Organization,
  Course,
  Package,
  RegistrationStatus,
  FramingStatus,
  PhotoStatus,
  Gender,
  Level,
  SchoolCourse,
} from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { getRegistrationAddOns, sumAddOnAmounts } from '../../../utils/registrationAddOns';
import { isWalkIn } from '../../../utils/clientInfo';
import { useStudioSettings } from '../../../hooks/useStudioSettings';
import { MAKEUP_LOOKS, MAKEUP_LOOK_NOTE_MAX } from '../../../constants/makeupLook';
import { discountCents, revenueTerms } from '../../../utils/revenue';
import { PackageOptionsPicker } from '../../../components/common/PackageOptionsPicker';
import { PhotographyProgress } from '../../photographer/components/PhotographyProgress';
import { CashierEditHistory } from './CashierEditHistory';
import { mobilePattern, registrationNameLimit } from '../../registration/registrationValidation';
import {
  chosenOptionLines, keepValidPicks, missingPicks, optionGroups, picksFromSaved, picksPayload, type OptionPicks,
} from '../../../utils/packageOptions';

export type RegistrationEdits = Omit<Partial<Registration>, 'add_ons' | 'package_options'> & {
  /** The client's picks by id; the server checks them and saves the labels. */
  package_options?: { group: string; choices: string[] }[];
  mua_correction?: 'required' | 'waived';
  review_mua_amount?: number;
  review_revenue_reason?: string;
  order_discount?: { studio: number; mua: number; reason: string };
  /** Add-on choices only: the server prices them from the catalog (ones already on the order keep their price). */
  add_ons?: Array<{ id?: string; code?: string; name?: string }>;
};

interface EditStudentModalProps {
  registration: Registration;
  organizations: Organization[];
  courses: Course[];
  packages: Package[];
  cashierCatalog?: { levels: Level[]; schoolCourses: SchoolCourse[] };
  /** Add-on catalog: active items can be added to the order. */
  addOnCatalog?: AddOn[];
  onClose: () => void;
  onSave: (id: string, data: RegistrationEdits) => Promise<void>;
}

export const EditStudentModal: React.FC<EditStudentModalProps> = ({
  registration: reg,
  organizations,
  courses,
  packages,
  cashierCatalog,
  addOnCatalog = [],
  onClose,
  onSave,
}) => {
  const [givenName, setGivenName] = useState(reg.given_name || '');
  const [familyName, setFamilyName] = useState(reg.family_name || '');
  const [middleName, setMiddleName] = useState(reg.middle_name || '');
  const [gender, setGender] = useState<Gender | ''>(reg.gender || '');
  const [studentId, setStudentId] = useState(reg.student_id || '');
  const [section, setSection] = useState(reg.section || '');
  const [mobileNumber, setMobileNumber] = useState(reg.mobile_number || '');
  const [email, setEmail] = useState(reg.email || '');
  const [organizationId, setOrganizationId] = useState(reg.organization || '');
  const [levelId, setLevelId] = useState(reg.level || '');
  const [courseId, setCourseId] = useState(reg.course || '');
  const [packageId, setPackageId] = useState(reg.package || '');
  const [optionPicks, setOptionPicks] = useState<OptionPicks>(() => picksFromSaved(reg.package_options));
  const [optionsTouched, setOptionsTouched] = useState(false);
  const [pictorialDate, setPictorialDate] = useState(reg.pictorial_date?.slice(0, 10) ?? '');
  const [status, setStatus] = useState<RegistrationStatus>(reg.status);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>(
    reg.framing_status || 'none'
  );
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>(
    reg.photo_status || 'pending_shoot'
  );
  const [notes, setNotes] = useState(reg.notes || '');
  // Walk-in clients have a session instead of a school and course.
  const walkIn = isWalkIn(reg);
  const { sessionTypes } = useStudioSettings();
  const [sessionTypeId, setSessionTypeId] = useState(reg.session_type || '');
  const [clientOrg, setClientOrg] = useState(reg.client_org || '');
  const [eventDate, setEventDate] = useState(reg.event_date?.slice(0, 10) ?? '');
  const [eventVenue, setEventVenue] = useState(reg.event_venue || '');
  const [muaCorrection, setMuaCorrection] = useState<NonNullable<RegistrationEdits['mua_correction']> | ''>('');
  const [makeupLook, setMakeupLook] = useState(reg.makeup_look || '');
  const [makeupLookNote, setMakeupLookNote] = useState(reg.makeup_look_note || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [reviewAmount, setReviewAmount] = useState('');
  const [reviewReason, setReviewReason] = useState('');
  const [studioDiscount, setStudioDiscount] = useState((reg.revenue_discount?.studio ?? 0) / 100);
  const [muaDiscount, setMuaDiscount] = useState((reg.revenue_discount?.mua ?? 0) / 100);
  const [discountReason, setDiscountReason] = useState(reg.revenue_discount?.reason ?? '');

  // Add-ons: the ones on the order keep the price they were sold at; new ones show today's catalog price.
  // The server prices them again from the catalog, so only their ids are sent.
  const savedAddOns = getRegistrationAddOns(reg.add_ons);
  const [addOns, setAddOns] = useState<RegistrationAddOn[]>(savedAddOns);
  const [addOnToAdd, setAddOnToAdd] = useState('');
  const savedIds = new Set(savedAddOns.map((item) => item.id).filter(Boolean));
  const addOnKey = (items: RegistrationAddOn[]) => items.map((item) => item.id ?? item.name).join('|');
  const addOnsChanged = addOnKey(addOns) !== addOnKey(savedAddOns);
  // Active add-ons offered to this type of client (empty type = both) and not already on the order.
  const addableAddOns = addOnCatalog.filter((item) => item.is_active
    && [walkIn ? 'walkin' : 'school', 'both'].includes(item.client_kind || 'both')
    && !addOns.some((selected) => selected.id === item.id));
  const isCancelled = reg.status === 'cancelled';
  // Released orders are closed; cancelled ones owe nothing (Restore first). The server enforces both.
  const canEditAddOns = !isCancelled && reg.status !== 'released';
  // Makeup can be added until the shoot is done: during the shoot the client goes back to the MUA queue.
  const inShoot = reg.status === 'shooting';
  const photosDone = !['pending_payment', 'paid', 'shooting'].includes(reg.status);
  const addAddOn = () => {
    const item = addOnCatalog.find((entry) => entry.id === addOnToAdd);
    if (!item) return;
    setAddOns((current) => [...current, { id: item.id, code: item.code, name: item.name, amount: item.amount }]);
    setAddOnToAdd('');
  };

  const cents = (value: number | undefined) => Math.round((value || 0) * 100);
  const clientKind = walkIn ? 'walkin' : 'school';
  // Packages on sale for this type of client, plus the order's own package (even if retired since).
  const packageChoices = packages.filter((pkg) => pkg.id === reg.package
    || (pkg.is_active && [clientKind, 'both'].includes(pkg.client_kind || 'school')));
  const selectedPkg = packages.find((p) => p.id === packageId);
  const packageChanged = Boolean(selectedPkg) && packageId !== reg.package;
  // Package options: sent only when changed (or with a new package); otherwise the picks saved at
  // sale stay as they are, even if the package's options were edited since.
  const groups = optionGroups(selectedPkg);
  const validPicks = keepValidPicks(groups, gender, optionPicks);
  const sendOptions = packageChanged || optionsTouched || (!!cashierCatalog && groups.length > 0 && gender !== (reg.gender || ''));
  const optionsProblem = sendOptions && gender ? missingPicks(groups, gender, validPicks)
    : cashierCatalog && sendOptions && groups.length ? 'Select a gender to choose the package options.' : null;
  const savedOptionLines = chosenOptionLines(reg.package_options);

  // Same rule as the server: when the package or add-ons change, the automatic add-on for clients
  // without makeup is added (order no longer brings makeup) or dropped (it does).
  const defaultAddOn = addOnCatalog.find((item) => item.is_active && item.default_when_no_mua
    && [clientKind, 'both'].includes(item.client_kind || 'both'));
  const isAuto = (item: RegistrationAddOn) => !!item.auto_applied || (!!defaultAddOn && item.id === defaultAddOn.id);
  const bringsMakeup = !!selectedPkg?.requires_mua
    || addOns.some((item) => addOnCatalog.find((entry) => entry.id === item.id)?.requires_mua);
  const autoAddOn = (packageChanged || addOnsChanged) && defaultAddOn && !bringsMakeup
    ? savedAddOns.find((item) => item.id === defaultAddOn.id) ?? { id: defaultAddOn.id, code: defaultAddOn.code, name: defaultAddOn.name, amount: defaultAddOn.amount }
    : undefined;
  const pricedAddOns = packageChanged || addOnsChanged
    ? [...addOns.filter((item) => !isAuto(item)), ...(autoAddOn ? [autoAddOn] : [])]
    : addOns;
  const addsMakeup = addOns.some((item) => !savedIds.has(item.id ?? '')
    && addOnCatalog.find((entry) => entry.id === item.id)?.requires_mua);
  const discountChanged = studioDiscount !== (reg.revenue_discount?.studio ?? 0) / 100
    || muaDiscount !== (reg.revenue_discount?.mua ?? 0) / 100
    || ((studioDiscount > 0 || muaDiscount > 0) && discountReason.trim() !== (reg.revenue_discount?.reason ?? ''));
  const itemsChanged = packageChanged || addOnsChanged;
  const priceChanged = itemsChanged || discountChanged;
  // Same rule as the server: a new package is priced from the catalog; otherwise only the add-ons are swapped.
  const subtotal = packageChanged && selectedPkg
    ? cents(selectedPkg.amount) + cents(sumAddOnAmounts(pricedAddOns)) + cents(reg.other_fees)
    : cents(reg.total_amount) + discountCents(reg) - cents(sumAddOnAmounts(savedAddOns)) + cents(sumAddOnAmounts(pricedAddOns));
  const totalCents = subtotal - cents(studioDiscount) - cents(muaDiscount);
  const currentTotal = totalCents / 100;
  const paid = reg.paid_amount || 0;
  const currentBalance = !priceChanged ? reg.balance : isCancelled ? 0 : Math.max(0, currentTotal - paid);
  // A lower price can leave the client paid beyond the new total: that money is owed back.
  const refundDue = priceChanged && !isCancelled ? Math.max(0, paid - currentTotal) : 0;
  const beforePhotography = ['pending_payment', 'paid'].includes(reg.status);
  const canCorrectMua = beforePhotography && !reg.makeup_state;
  const assignedCourses = cashierCatalog?.schoolCourses.filter((assignment) => assignment.school_id === organizationId && assignment.level === levelId);
  const schoolChoices = cashierCatalog ? organizations.filter((org) => org.is_active || org.id === reg.organization) : organizations;
  const levelChoices = cashierCatalog?.levels.filter((level) => level.organization === organizationId) ?? [];
  const courseChoices = assignedCourses ? courses.filter((course) => assignedCourses.some((assignment) => assignment.course_id === course.id)
    || (organizationId === reg.organization && levelId === reg.level && course.id === reg.course)) : courses;
  const academicChanged = organizationId !== (reg.organization || '') || levelId !== (reg.level || '') || courseId !== (reg.course || '');
  const session = sessionTypes.find((type) => type.id === sessionTypeId);
  const requireEvent = !!cashierCatalog && !!session?.on_location
    && (sessionTypeId !== (reg.session_type || '') || eventDate !== (reg.event_date?.slice(0, 10) || '') || eventVenue !== (reg.event_venue || ''));

  function requestClose() {
    if (isSubmitting) return;
    if (cashierCatalog && dirty) setConfirmDiscard(true);
    else onClose();
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (optionsProblem) return;
    setSaveError('');
    if (cashierCatalog) {
      const names = [familyName.trim(), givenName.trim(), middleName.trim()];
      if (!names[0] || !names[1] || names.some((name) => Array.from(name).length > registrationNameLimit)) {
        setSaveError(`Enter the client's given and family names. Names can be up to ${registrationNameLimit} characters each.`);
        return;
      }
      if (mobileNumber.trim() !== (reg.mobile_number || '') && !mobilePattern.test(mobileNumber.trim().replace(/[ -]/g, ''))) {
        setSaveError('Enter a valid Philippine mobile number, such as 0917-000-0000.');
        return;
      }
    }
    setIsSubmitting(true);
    try {
      await onSave(reg.id, {
        given_name: givenName.trim(),
        family_name: familyName.trim(),
        middle_name: middleName.trim(),
        gender: gender || undefined,
        mobile_number: mobileNumber.trim(),
        email: email.trim(),
        ...(walkIn ? {
          session_type: sessionTypeId,
          client_org: clientOrg.trim(),
          event_date: eventDate ? `${eventDate} 00:00:00.000Z` : '',
          event_venue: eventVenue.trim(),
        } : {
          student_id: studentId.trim(),
          section: section.trim(),
          organization: organizationId,
          ...(cashierCatalog ? { level: levelId } : {}),
          course: courseId,
        }),
        package: packageId,
        ...(sendOptions ? { package_options: picksPayload(validPicks) } : {}),
        ...(!cashierCatalog && !itemsChanged && reviewAmount !== '' ? { review_mua_amount: Number(reviewAmount), review_revenue_reason: reviewReason.trim() } : {}),
        ...(!cashierCatalog && canEditAddOns && discountChanged ? { order_discount: { studio: studioDiscount, mua: muaDiscount, reason: discountReason.trim() } } : {}),
        ...(addOnsChanged ? { add_ons: addOns.map((item) => (item.id ? { id: item.id } : { code: item.code, name: item.name })) } : {}),
        ...(!cashierCatalog ? {
          pictorial_date: pictorialDate ? `${pictorialDate} 00:00:00.000Z` : '',
          status, framing_status: framingStatus, photo_status: photoStatus,
          mua_correction: canCorrectMua && muaCorrection ? muaCorrection : undefined,
        } : {}),
        notes: notes.trim(),
        makeup_look: makeupLook,
        makeup_look_note: makeupLookNote.trim(),
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save this registration.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Modal title={cashierCatalog ? 'Edit Client' : `Edit ${walkIn ? 'Walk-in Client' : 'Student'} Record`}
        subtitle={reg.job_order_no ? `JO № ${reg.job_order_no}` : `Registration ${reg.id}`}
        onClose={requestClose} busy={isSubmitting} size="xl">
        {!cashierCatalog && <PhotographyProgress registration={reg} audit />}
        <form onSubmit={handleSubmit} onChange={() => setDirty(true)} className="space-y-4">
          {!cashierCatalog && <fieldset className="border border-line p-3 space-y-2">
            <legend className="px-1 font-black uppercase">Revenue review and discounts</legend>
            {reg.revenue_review && <p>Verified by {reg.revenue_review.by} · {reg.revenue_review.reason}</p>}
            {(revenueTerms(reg).unallocated > 0 || reg.revenue_review) && !itemsChanged && <>
              <p>Check the original paperwork. Enter the verified MUA subtotal before discounts. Enter zero only if the paperwork confirms all charges were Studio.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label>Verified MUA subtotal (₱)<input className="block w-full border border-line p-2" type="number" min="0" step="0.01"
                  value={reviewAmount} onChange={(event) => setReviewAmount(event.target.value)} /></label>
                <label>Evidence or reason<input className="block w-full border border-line p-2" required={reviewAmount !== ''} minLength={3} maxLength={500}
                  value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></label>
              </div>
            </>}
            {canEditAddOns && <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label>Studio discount (₱)<input className="block w-full border border-line p-2" type="number" min="0" step="1"
                  value={studioDiscount} onChange={(event) => setStudioDiscount(Number(event.target.value))} /></label>
                <label>MUA discount (₱)<input className="block w-full border border-line p-2" type="number" min="0" step="1"
                  value={muaDiscount} onChange={(event) => setMuaDiscount(Number(event.target.value))} /></label>
              </div>
              {(studioDiscount > 0 || muaDiscount > 0) && <label className="block">Discount reason
                <input className="block w-full border border-line p-2" required minLength={3} maxLength={500}
                  value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} />
              </label>}
              {priceChanged && <p>New total {formatCurrency(currentTotal, { exact: true })} · Balance {formatCurrency(currentBalance, { exact: true })}</p>}
            </>}
          </fieldset>}
          {/* Row 1: Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="edit-student-family" className="block font-black uppercase text-ink mb-1">
                Family Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                id="edit-student-family" value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="w-full p-2 bg-panel border border-line uppercase"
              />
            </div>
            <div>
              <label htmlFor="edit-student-given" className="block font-black uppercase text-ink mb-1">
                Given Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                id="edit-student-given" value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                className="w-full p-2 bg-panel border border-line uppercase"
              />
            </div>
            <div>
              <label htmlFor="edit-student-middle" className="block font-black uppercase text-ink mb-1">
                Middle Name
              </label>
              <input
                type="text"
                id="edit-student-middle" value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className="w-full p-2 bg-panel border border-line uppercase"
              />
            </div>
            <div>
              <label htmlFor="edit-student-gender" className="block font-black uppercase text-ink mb-1">Gender</label>
              <select id="edit-student-gender" value={gender} onChange={(e) => setGender(e.target.value as Gender | '')}
                className="w-full p-2 bg-panel border border-line">
                <option value="" disabled={!!cashierCatalog && !!reg.gender}>Unset (legacy record)</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>

          {/* Row 2: Identifiers & Contact */}
          <div className={`grid grid-cols-1 gap-3 ${walkIn ? 'sm:grid-cols-2' : 'sm:grid-cols-4'}`}>
            {!walkIn && <>
            <div>
              <label htmlFor="edit-student-id" className="block font-black uppercase text-ink mb-1">
                Student ID
              </label>
              <input
                type="text"
                id="edit-student-id" value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              />
            </div>
            <div>
              <label htmlFor="edit-student-section" className="block font-black uppercase text-ink mb-1">
                Section
              </label>
              <input
                type="text"
                id="edit-student-section" value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full p-2 bg-panel border border-line uppercase"
              />
            </div>
            </>}
            <div>
              <label htmlFor="edit-student-mobile" className="block font-black uppercase text-ink mb-1">
                Mobile Number <span className="text-red-600">*</span>
              </label>
              <input
                id="edit-student-mobile"
                type="tel"
                required={!!cashierCatalog && mobileNumber !== (reg.mobile_number || '')}
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              />
            </div>
            <div>
              <label htmlFor="edit-student-email" className="block font-black uppercase text-ink mb-1">
                Email Address <span className="font-normal text-neutral-500">(Optional)</span>
              </label>
              <input
                type="email"
                id="edit-student-email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              />
            </div>
          </div>

          {/* Row 3 (walk-in): Session, Organization, Event Date & Venue */}
          {walkIn && (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label htmlFor="edit-walkin-session" className="block font-black uppercase text-ink mb-1">Session</label>
                <select id="edit-walkin-session" value={sessionTypeId} onChange={(e) => setSessionTypeId(e.target.value)}
                  className="w-full p-2 bg-panel border border-line">
                  <option value="">—</option>
                  {sessionTypes.filter((type) => type.is_active || type.id === sessionTypeId).map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-walkin-org" className="block font-black uppercase text-ink mb-1">Organization / Company</label>
                <input id="edit-walkin-org" value={clientOrg} maxLength={120} onChange={(e) => setClientOrg(e.target.value)}
                  className="w-full p-2 bg-panel border border-line" />
              </div>
              <div>
                <label htmlFor="edit-walkin-date" className="block font-black uppercase text-ink mb-1">
                  Event Date {requireEvent && <span aria-hidden="true" className="text-red-600">*</span>}
                </label>
                <input id="edit-walkin-date" type="date" required={requireEvent} value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                  className="w-full p-2 bg-panel border border-line" />
              </div>
              <div>
                <label htmlFor="edit-walkin-venue" className="block font-black uppercase text-ink mb-1">
                  Venue {requireEvent && <span aria-hidden="true" className="text-red-600">*</span>}
                </label>
                <input id="edit-walkin-venue" value={eventVenue} required={requireEvent} maxLength={200} onChange={(e) => setEventVenue(e.target.value)}
                  className="w-full p-2 bg-panel border border-line" />
              </div>
            </div>
          )}

          {/* Row 3: School, Course & Schedule */}
          <div className={`grid grid-cols-1 gap-3 ${walkIn ? '' : 'sm:grid-cols-3'}`}>
            {!walkIn && <>
            <div>
              <label htmlFor="edit-student-school" className="block font-black uppercase text-ink mb-1">
                School / Organization {cashierCatalog && academicChanged && <span aria-hidden="true" className="text-red-600">*</span>}
              </label>
              <select
                value={organizationId}
                id="edit-student-school"
                required={!!cashierCatalog && academicChanged}
                onChange={(e) => {
                  setOrganizationId(e.target.value);
                  if (cashierCatalog) { setLevelId(''); setCourseId(''); }
                }}
                className="w-full p-2 bg-panel border border-line"
              >
                {cashierCatalog && <option value="">Choose a school</option>}
                {schoolChoices.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.code ? `${org.code} - ${org.name}` : org.name}
                  </option>
                ))}
              </select>
            </div>
            {cashierCatalog && (
              <div>
                <label htmlFor="edit-student-level" className="block font-black uppercase text-ink mb-1">
                  Academic Level {academicChanged && <span aria-hidden="true" className="text-red-600">*</span>}
                </label>
                <select id="edit-student-level" className="w-full p-2 bg-panel border border-line"
                  value={levelId} required={academicChanged}
                  onChange={(event) => { setLevelId(event.target.value); setCourseId(''); }}>
                  <option value="">Choose a level</option>
                  {levelChoices.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="edit-student-course" className="block font-black uppercase text-ink mb-1">
                Degree Program / Course {cashierCatalog && academicChanged && <span aria-hidden="true" className="text-red-600">*</span>}
              </label>
              <select
                value={courseId}
                id="edit-student-course"
                required={!!cashierCatalog && academicChanged}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              >
                {cashierCatalog && <option value="">Choose a course</option>}
                {courseChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} - ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>
            </>}
            {!cashierCatalog && <div>
              <label htmlFor="edit-student-pictorial-date" className="block font-black uppercase text-ink mb-1">
                Scheduled Pictorial Date
              </label>
              <input
                id="edit-student-pictorial-date"
                type="date"
                value={pictorialDate}
                onChange={(e) => setPictorialDate(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              />
            </div>}
          </div>

          {/* Row 4: Package Selection & Amounts */}
          <div className="p-3 bg-panel border border-line space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div>
                <label htmlFor="edit-student-package" className="block font-black uppercase text-ink mb-1">
                  Assigned Package {cashierCatalog && <span aria-hidden="true" className="text-red-600">*</span>}
                </label>
                <select
                  value={packageId}
                  id="edit-student-package"
                  required={!!cashierCatalog}
                  onChange={(e) => setPackageId(e.target.value)}
                  disabled={!canEditAddOns}
                  title={!canEditAddOns ? (isCancelled ? 'Restore the job order to change its package.' : 'Released orders can\'t change package.') : undefined}
                  className="w-full p-2 bg-canvas border border-line font-bold disabled:opacity-60"
                >
                  {cashierCatalog && <option value="">Choose a package</option>}
                  {packageChoices.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.code} - {pkg.name} ({formatCurrency(pkg.amount)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-right sm:text-center">
                <span className="text-[10px] text-neutral-500 uppercase block">Total Billed</span>
                <span className="text-base font-black text-ink">{formatCurrency(currentTotal)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-neutral-500 uppercase block">Remaining Balance</span>
                <span className={`text-base font-black ${currentBalance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatCurrency(currentBalance)}
                </span>
              </div>
            </div>
            {(groups.length > 0 || savedOptionLines.length > 0) && (
              <div className="space-y-2 border-t border-neutral-200 pt-2">
                <h4 className="font-black uppercase">Package options</h4>
                {!packageChanged && savedOptionLines.length > 0 && (
                  <p className="text-neutral-600">Chosen: {savedOptionLines.join(' · ')}</p>
                )}
                {packageChanged && groups.length > 0 && (
                  <p className="text-amber-800 font-bold">New package: choose its options for the client.</p>
                )}
                {!gender ? (
                  <p className="text-neutral-600">Set the client's gender to choose options.</p>
                ) : (
                  <PackageOptionsPicker groups={groups} gender={gender} picks={validPicks} disabled={!canEditAddOns}
                    onChange={(picks) => { setOptionPicks(picks); setOptionsTouched(true); setDirty(true); }}
                    error={optionsProblem ?? undefined} />
                )}
              </div>
            )}
            {refundDue > 0 && (
              <div role="alert" className="p-3 border-2 border-red-600 bg-red-50 text-red-900 leading-relaxed">
                <strong>The client already paid {formatCurrency(reg.paid_amount, { exact: true })}</strong>, more than the new total of {formatCurrency(currentTotal, { exact: true })}.
                After saving, {formatCurrency(refundDue, { exact: true })} is owed back to the client: record it with <strong>Refund</strong> in
                Analytics &amp; Overview → ledger (filter “Refund Due”).
              </div>
            )}
            <div className="space-y-2 border-t border-neutral-200 pt-2">
              <h4 className="font-black uppercase">Add-ons</h4>
              {addOns.length === 0 && <p className="text-neutral-500">No add-ons on this job order.</p>}
              {addOns.length > 0 && (
                <ul className="space-y-1">
                  {addOns.map((item, index) => {
                    const isNew = !item.id || !savedIds.has(item.id);
                    const catalogItem = addOnCatalog.find((entry) => entry.id === item.id);
                    return (
                      <li key={item.id ?? index} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          {item.name}
                          {isNew && <span className="ml-2 px-1 border border-gold text-[9px] font-black uppercase text-gold-soft">New</span>}
                          {isNew && catalogItem?.requires_mua && (
                            <span className="ml-1 text-[10px] text-neutral-500">adds makeup / grooming</span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span title={isNew ? 'Today\'s catalog price' : 'Price it was sold at'}>{formatCurrency(item.amount, { exact: true })}</span>
                          {canEditAddOns && (
                            <RecordActionButton variant="delete" recordName={item.name}
                              onClick={() => { setDirty(true); setAddOns((current) => current.filter((_, i) => i !== index)); }} />
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {canEditAddOns ? (
                addableAddOns.length > 0 && (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select value={addOnToAdd} onChange={(e) => setAddOnToAdd(e.target.value)} aria-label="Add-on to add"
                      className="flex-1 min-w-0 p-2 bg-canvas border border-line">
                      <option value="">Choose an add-on to add…</option>
                      {addableAddOns.map((item) => (
                        <option key={item.id} value={item.id} disabled={photosDone && !!item.requires_mua}>
                          {item.code ? `${item.code} - ` : ''}{item.name} ({formatCurrency(item.amount, { exact: true })}){item.requires_mua ? ' · makeup / grooming' : ''}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => { addAddOn(); setDirty(true); }} disabled={!addOnToAdd}
                      className="btn-tactile px-4 py-2 bg-gold text-on-gold border border-line font-black uppercase cursor-pointer disabled:opacity-40">
                      Add
                    </button>
                  </div>
                )
              ) : (
                <p className="text-[10px] text-neutral-600">
                  {isCancelled ? 'Restore the job order to change its add-ons.' : 'Released orders can\'t change add-ons.'}
                </p>
              )}
              {addOnsChanged && (
                <p className="text-[10px] text-neutral-600">
                  Total and balance update when you save. New add-ons are charged at today&apos;s catalog price; the cashier collects any new balance.
                </p>
              )}
              {canEditAddOns && photosDone && addableAddOns.some((item) => item.requires_mua) && (
                <p className="text-[10px] text-neutral-600">Photos are already done, so makeup or grooming add-ons can&apos;t be added.</p>
              )}
              {addsMakeup && (inShoot || reg.makeup_state === 'completed') && (
                <p role="alert" className="p-2 border border-gold bg-gold-wash text-[11px] leading-relaxed">
                  {inShoot
                    ? 'Saving pauses the shoot: the client goes back to the MUA queue for the new makeup, keeps their photo queue number, and the camera is unlinked. Call them again on the Photo Floor once makeup is done.'
                    : 'Saving sends the client back to the MUA queue for the new makeup. The artist is credited only for the new service.'}
                </p>
              )}
              {defaultAddOn && (packageChanged || addOnsChanged)
                && autoAddOn?.id !== addOns.find(isAuto)?.id && (
                <p className="text-[10px] text-neutral-600">
                  {autoAddOn
                    ? `${defaultAddOn.name} (${formatCurrency(autoAddOn.amount, { exact: true })}) is added automatically: this order no longer includes makeup or grooming.`
                    : `${defaultAddOn.name} is removed automatically: this order now includes makeup or grooming.`}
                </p>
              )}
            </div>
            {!cashierCatalog && beforePhotography && (
              <div className="space-y-1 border-t border-neutral-200 pt-2">
                <p>Saved MUA requirement: {reg.makeup_service || 'No MUA required'}</p>
                {canCorrectMua ? (
                  <label className="block">
                    <span className="font-black uppercase">Correct MUA requirement</span>
                    <select
                      value={muaCorrection}
                      onChange={(e) => setMuaCorrection(e.target.value as typeof muaCorrection)}
                      className="mt-1 w-full p-2 bg-canvas border border-line"
                    >
                      <option value="">No manual correction</option>
                      <option value="required">Require makeup / grooming</option>
                      <option value="waived">Waive makeup / grooming</option>
                    </select>
                  </label>
                ) : reg.makeup_state !== 'completed' && (
                  <p className="text-neutral-600">Release the active MUA assignment to correct its requirement.</p>
                )}
              </div>
            )}
            {(reg.makeup_service || reg.makeup_look || muaCorrection === 'required' || (!!cashierCatalog && bringsMakeup)) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t border-neutral-200 pt-2">
                <label className="block">
                  <span className="font-black uppercase">Preferred look</span>
                  <select value={makeupLook} onChange={(e) => setMakeupLook(e.target.value)}
                    className="mt-1 w-full p-2 bg-canvas border border-line">
                    <option value="">Not chosen</option>
                    {MAKEUP_LOOKS.map((look) => <option key={look.value} value={look.value}>{look.label}</option>)}
                  </select>
                </label>
                <label className="block sm:col-span-2">
                  <span className="font-black uppercase">Note for the makeup artist</span>
                  <input value={makeupLookNote} maxLength={MAKEUP_LOOK_NOTE_MAX} onChange={(e) => setMakeupLookNote(e.target.value)}
                    placeholder="e.g. no lipstick" className="mt-1 w-full p-2 bg-canvas border border-line" />
                </label>
              </div>
            )}
          </div>

          {/* Row 5: Operational & Floor Statuses */}
          {!cashierCatalog && <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Queue Status
              </label>
              <select
                value={status}
                disabled={isCancelled}
                title={isCancelled ? 'Cancelled: use the Restore button in the Clients Directory' : undefined}
                onChange={(e) => setStatus(e.target.value as RegistrationStatus)}
                className="w-full p-2 bg-panel border border-line uppercase text-[11px] disabled:opacity-60"
              >
                <option value="pending_payment">Pending Payment</option>
                <option value="paid">Paid (In Queue)</option>
                <option value="shooting">Shooting (On Set)</option>
                <option value="done_shooting">Done Shooting</option>
                <option value="completed">Completed</option>
                <option value="ready_for_pickup">Ready for Pickup</option>
                {/* Release happens at the cashier (it records who claimed the order). */}
                {reg.status === 'released' && <option value="released">Released</option>}
                {/* Cancelling and restoring use their own buttons (they record the reason and who). */}
                {isCancelled && <option value="cancelled">Cancelled</option>}
              </select>
              {isCancelled && <p className="mt-1 text-[10px] text-neutral-600">Use Restore in the Clients Directory.</p>}
            </div>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Payment Status
              </label>
              {/* Worked out from the receipts and refunds; it can't be set by hand. */}
              <div className="w-full p-2 bg-canvas border border-neutral-300 uppercase text-[11px] font-bold" title="Set automatically from payments and refunds">
                {reg.payment_status === 'fully_paid' ? 'Fully Paid' : reg.payment_status === 'downpayment' ? 'Downpayment' : 'Unpaid'}
              </div>
            </div>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Production Status
              </label>
              <select
                value={framingStatus}
                onChange={(e) => setFramingStatus(e.target.value as FramingStatus)}
                className="w-full p-2 bg-panel border border-line uppercase text-[11px]"
              >
                <option value="none">Not Started</option>
                <option value="pending_framing">Pending</option>
                <option value="in_production">In Production</option>
                <option value="framed">Framed</option>
                <option value="ready_for_pickup">Ready for Pickup</option>
                {reg.framing_status === 'released' && <option value="released">Released</option>}
              </select>
            </div>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Photo Status
              </label>
              <select
                value={photoStatus}
                onChange={(e) => setPhotoStatus(e.target.value as PhotoStatus)}
                className="w-full p-2 bg-panel border border-line uppercase text-[11px]"
              >
                <option value="pending_shoot">Pending Shoot</option>
                <option value="shot_raw">Raw Stored</option>
                <option value="client_selected">Selected</option>
                <option value="ready_to_print">Ready to Print</option>
              </select>
            </div>
          </div>}

          {/* Notes */}
          <div>
            <label htmlFor="edit-student-notes" className="block font-black uppercase text-ink mb-1">
              {cashierCatalog ? 'Notes / Special Instructions' : 'Admin Notes / Special Instructions'}
            </label>
            <input
              type="text"
              id="edit-student-notes" value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. VIP express shoot, custom frame sizing requested"
              className="w-full p-2 bg-panel border border-line"
            />
          </div>

          {/* Something new to make on an order already marked ready: the server moves it back to In production. */}
          {(packageChanged || addOns.some((item) => !savedAddOns.some((saved) => (saved.id ?? saved.name) === (item.id ?? item.name))))
            && (['completed', 'ready_for_pickup'].includes(reg.status) || ['framed', 'ready_for_pickup'].includes(reg.framing_status ?? '')) && (
            <p role="status" className="p-2.5 border-2 border-amber-500 bg-amber-50 text-amber-900 font-sans text-[11px]">
              <b>This order is marked ready for pickup.</b> Saving moves it back to <b>In production</b> so the new item gets made:
              it leaves the cashier&apos;s Ready for Pickup list (and the pickup notice resets) until you mark it ready again in Production &amp; Pickup.
            </p>
          )}

          {!cashierCatalog && <CashierEditHistory registrationId={reg.id} />}
          {optionsProblem && <p role="alert" className="font-bold text-red-600">{optionsProblem}</p>}
          {saveError && <p role="alert" className="font-bold text-red-600">{saveError}</p>}
          <div className="flex gap-3 pt-3 border-t-2 border-line">
            <button
              type="button"
              onClick={requestClose}
              disabled={isSubmitting}
              className="flex-1 py-2.5 font-bold uppercase tracking-wider bg-panel text-ink border-2 border-line shadow-lux hover:bg-neutral-100 transition-colors btn-tactile cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !!optionsProblem}
              className="flex-1 py-2.5 font-bold uppercase tracking-wider bg-obsidian text-gold border-2 border-line shadow-lux hover:bg-neutral-800 disabled:opacity-50 transition-all btn-tactile cursor-pointer"
            >
              {isSubmitting ? 'Saving Changes...' : cashierCatalog ? 'Save Changes' : 'Save Student Record'}
            </button>
          </div>
        </form>
      </Modal>
      <ConfirmModal isOpen={confirmDiscard} title="Discard unsaved changes?"
        message="Your changes to this registration will be lost." confirmText="Discard Changes"
        cancelText="Keep Editing" onClose={() => setConfirmDiscard(false)} onConfirm={onClose} />
    </>
  );
};
