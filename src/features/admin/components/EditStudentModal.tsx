import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
} from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { getRegistrationAddOns, sumAddOnAmounts } from '../../../utils/registrationAddOns';
import { isWalkIn } from '../../../utils/clientInfo';
import { useStudioSettings } from '../../../hooks/useStudioSettings';
import { MAKEUP_LOOKS, MAKEUP_LOOK_NOTE_MAX } from '../../../constants/makeupLook';

export type RegistrationEdits = Omit<Partial<Registration>, 'add_ons'> & {
  mua_correction?: 'required' | 'waived';
  /** Add-on choices only: the server prices them from the catalog (ones already on the order keep their price). */
  add_ons?: Array<{ id?: string; code?: string; name?: string }>;
};

interface EditStudentModalProps {
  registration: Registration;
  organizations: Organization[];
  courses: Course[];
  packages: Package[];
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
  addOnCatalog = [],
  onClose,
  onSave,
}) => {
  const [givenName, setGivenName] = useState(reg.given_name || '');
  const [familyName, setFamilyName] = useState(reg.family_name || '');
  const [middleName, setMiddleName] = useState(reg.middle_name || '');
  const [studentId, setStudentId] = useState(reg.student_id || '');
  const [section, setSection] = useState(reg.section || '');
  const [mobileNumber, setMobileNumber] = useState(reg.mobile_number || '');
  const [email, setEmail] = useState(reg.email || '');
  const [organizationId, setOrganizationId] = useState(reg.organization || '');
  const [courseId, setCourseId] = useState(reg.course || '');
  const [packageId, setPackageId] = useState(reg.package || '');
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
  // Released orders are closed; cancelled ones owe nothing (Restore first).
  const canEditAddOns = !isCancelled && reg.status !== 'released';
  const addAddOn = () => {
    const item = addOnCatalog.find((entry) => entry.id === addOnToAdd);
    if (!item) return;
    setAddOns((current) => [...current, { id: item.id, code: item.code, name: item.name, amount: item.amount }]);
    setAddOnToAdd('');
  };

  const cents = (value: number | undefined) => Math.round((value || 0) * 100);
  const selectedPkg = packages.find((p) => p.id === packageId);
  const packageChanged = Boolean(selectedPkg) && packageId !== reg.package;
  const priceChanged = packageChanged || addOnsChanged;
  // Same rule as the server: a new package is priced from the catalog; otherwise only the add-ons are swapped.
  const totalCents = packageChanged && selectedPkg
    ? cents(selectedPkg.amount) + cents(sumAddOnAmounts(addOns)) + cents(reg.other_fees)
    : cents(reg.total_amount) - cents(sumAddOnAmounts(savedAddOns)) + cents(sumAddOnAmounts(addOns));
  const currentTotal = totalCents / 100;
  const paid = reg.paid_amount || 0;
  const currentBalance = !priceChanged ? reg.balance : isCancelled ? 0 : Math.max(0, currentTotal - paid);
  // A lower price can leave the client paid beyond the new total: that money is owed back.
  const refundDue = priceChanged && !isCancelled ? Math.max(0, paid - currentTotal) : 0;
  const beforePhotography = ['pending_payment', 'paid'].includes(reg.status);
  const canCorrectMua = beforePhotography && !reg.makeup_state;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(reg.id, {
        given_name: givenName.trim(),
        family_name: familyName.trim(),
        middle_name: middleName.trim(),
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
          course: courseId,
        }),
        package: packageId,
        ...(addOnsChanged ? { add_ons: addOns.map((item) => (item.id ? { id: item.id } : { code: item.code, name: item.name })) } : {}),
        pictorial_date: pictorialDate ? `${pictorialDate} 00:00:00.000Z` : '',
        status,
        framing_status: framingStatus,
        photo_status: photoStatus,
        notes: notes.trim(),
        makeup_look: makeupLook,
        makeup_look_note: makeupLookNote.trim(),
        mua_correction: canCorrectMua && muaCorrection ? muaCorrection : undefined,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-obsidian/80 backdrop-blur-xs animate-modal">
      <div className="w-full max-w-2xl lg:max-w-4xl bg-canvas border-2 border-line shadow-lux p-6 sm:p-8 max-h-[90vh] overflow-y-auto space-y-6 font-mono text-xs transition-all">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-line">
          <div>
            <h3 className="font-mono text-sm font-black uppercase tracking-wider text-ink">
              Edit {walkIn ? 'Walk-in Client' : 'Student'} Record // JO № {reg.job_order_no}
            </h3>
            <p className="text-[11px] text-neutral-500">
              Update participant details, academic affiliations, package selection, and status.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center font-bold text-sm bg-panel border border-line hover:bg-gold hover:text-on-gold transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Family Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="w-full p-2 bg-panel border border-line uppercase"
              />
            </div>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Given Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                className="w-full p-2 bg-panel border border-line uppercase"
              />
            </div>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Middle Name
              </label>
              <input
                type="text"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className="w-full p-2 bg-panel border border-line uppercase"
              />
            </div>
          </div>

          {/* Row 2: Identifiers & Contact */}
          <div className={`grid grid-cols-1 gap-3 ${walkIn ? 'sm:grid-cols-2' : 'sm:grid-cols-4'}`}>
            {!walkIn && <>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Student ID
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              />
            </div>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Section
              </label>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full p-2 bg-panel border border-line uppercase"
              />
            </div>
            </>}
            <div>
              <label htmlFor="edit-student-mobile" className="block font-black uppercase text-ink mb-1">
                Mobile Number <span className="font-normal text-neutral-500">(Optional)</span>
              </label>
              <input
                id="edit-student-mobile"
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              />
            </div>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
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
                <label htmlFor="edit-walkin-date" className="block font-black uppercase text-ink mb-1">Event Date</label>
                <input id="edit-walkin-date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
                  className="w-full p-2 bg-panel border border-line" />
              </div>
              <div>
                <label htmlFor="edit-walkin-venue" className="block font-black uppercase text-ink mb-1">Venue</label>
                <input id="edit-walkin-venue" value={eventVenue} maxLength={200} onChange={(e) => setEventVenue(e.target.value)}
                  className="w-full p-2 bg-panel border border-line" />
              </div>
            </div>
          )}

          {/* Row 3: School, Course & Schedule */}
          <div className={`grid grid-cols-1 gap-3 ${walkIn ? '' : 'sm:grid-cols-3'}`}>
            {!walkIn && <>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                School / Organization
              </label>
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.code ? `${org.code} - ${org.name}` : org.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-black uppercase text-ink mb-1">
                Degree Program / Course
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full p-2 bg-panel border border-line"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} - ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>
            </>}
            <div>
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
            </div>
          </div>

          {/* Row 4: Package Selection & Amounts */}
          <div className="p-3 bg-panel border border-line space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div>
                <label className="block font-black uppercase text-ink mb-1">
                  Assigned Package
                </label>
                <select
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  className="w-full p-2 bg-canvas border border-line font-bold"
                >
                  {packages.map((pkg) => (
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
                            <button type="button" onClick={() => setAddOns((current) => current.filter((_, i) => i !== index))}
                              aria-label={`Remove ${item.name}`}
                              className="btn-tactile px-2 py-0.5 border border-red-600 text-red-700 bg-canvas text-[10px] font-black uppercase cursor-pointer">
                              Remove
                            </button>
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
                        <option key={item.id} value={item.id}>
                          {item.code ? `${item.code} - ` : ''}{item.name} ({formatCurrency(item.amount, { exact: true })}){item.requires_mua ? ' · makeup / grooming' : ''}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={addAddOn} disabled={!addOnToAdd}
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
            </div>
            {beforePhotography && (
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
            {(reg.makeup_service || reg.makeup_look || muaCorrection === 'required') && (
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          </div>

          {/* Notes */}
          <div>
            <label className="block font-black uppercase text-ink mb-1">
              Admin Notes / Special Instructions
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. VIP express shoot, custom frame sizing requested"
              className="w-full p-2 bg-panel border border-line"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-3 border-t-2 border-line">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 font-bold uppercase tracking-wider bg-panel text-ink border-2 border-line shadow-lux hover:bg-neutral-100 transition-colors btn-tactile cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 font-bold uppercase tracking-wider bg-obsidian text-gold border-2 border-line shadow-lux hover:bg-neutral-800 disabled:opacity-50 transition-all btn-tactile cursor-pointer"
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Student Record'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
