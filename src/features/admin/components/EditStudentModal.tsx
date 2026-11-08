import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  Registration,
  Organization,
  Course,
  Package,
  RegistrationStatus,
  PaymentStatus,
  FramingStatus,
  PhotoStatus,
} from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { getRegistrationAddOns, sumAddOnAmounts } from '../../../utils/registrationAddOns';

interface EditStudentModalProps {
  registration: Registration;
  organizations: Organization[];
  courses: Course[];
  packages: Package[];
  onClose: () => void;
  onSave: (id: string, data: Partial<Registration>) => Promise<void>;
}

export const EditStudentModal: React.FC<EditStudentModalProps> = ({
  registration: reg,
  organizations,
  courses,
  packages,
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
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(reg.payment_status);
  const [framingStatus, setFramingStatus] = useState<FramingStatus>(
    reg.framing_status || 'none'
  );
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>(
    reg.photo_status || 'pending_shoot'
  );
  const [notes, setNotes] = useState(reg.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addOns = getRegistrationAddOns(reg.add_ons);
  const selectedPkg = packages.find((p) => p.id === packageId);
  const packageChanged = selectedPkg && packageId !== reg.package;
  const currentTotal = packageChanged ? selectedPkg.amount + sumAddOnAmounts(addOns) + (reg.other_fees || 0) : reg.total_amount;
  const currentBalance = packageChanged ? Math.max(0, currentTotal - (reg.paid_amount || 0)) : reg.balance;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(reg.id, {
        given_name: givenName.trim(),
        family_name: familyName.trim(),
        middle_name: middleName.trim(),
        student_id: studentId.trim(),
        section: section.trim(),
        mobile_number: mobileNumber.trim(),
        email: email.trim(),
        organization: organizationId,
        course: courseId,
        package: packageId,
        pictorial_date: pictorialDate ? `${pictorialDate} 00:00:00.000Z` : '',
        status,
        payment_status: paymentStatus,
        framing_status: framingStatus,
        photo_status: photoStatus,
        notes: notes.trim(),
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#0A0A0A]/80 backdrop-blur-xs animate-modal">
      <div className="w-full max-w-2xl lg:max-w-4xl bg-[#F8F7F4] border-2 border-[#0A0A0A] shadow-[8px_8px_0px_#0A0A0A] p-6 sm:p-8 max-h-[90vh] overflow-y-auto space-y-6 font-mono text-xs transition-all">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#0A0A0A]">
          <div>
            <h3 className="font-mono text-sm font-black uppercase tracking-wider text-[#0A0A0A]">
              Edit Student Record // JO № {reg.job_order_no}
            </h3>
            <p className="text-[11px] text-neutral-500">
              Update participant details, academic affiliations, package selection, and status.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center font-bold text-sm bg-white border border-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Family Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A] uppercase"
              />
            </div>
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Given Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={givenName}
                onChange={(e) => setGivenName(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A] uppercase"
              />
            </div>
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Middle Name
              </label>
              <input
                type="text"
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A] uppercase"
              />
            </div>
          </div>

          {/* Row 2: Identifiers & Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Student ID
              </label>
              <input
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A]"
              />
            </div>
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Section
              </label>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A] uppercase"
              />
            </div>
            <div>
              <label htmlFor="edit-student-mobile" className="block font-black uppercase text-[#0A0A0A] mb-1">
                Mobile Number <span className="font-normal text-neutral-500">(Optional)</span>
              </label>
              <input
                id="edit-student-mobile"
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A]"
              />
            </div>
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A]"
              />
            </div>
          </div>

          {/* Row 3: School, Course & Schedule */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                School / Organization
              </label>
              <select
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A]"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.code ? `${org.code} - ${org.name}` : org.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Degree Program / Course
              </label>
              <select
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A]"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} - ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-student-pictorial-date" className="block font-black uppercase text-[#0A0A0A] mb-1">
                Scheduled Pictorial Date
              </label>
              <input
                id="edit-student-pictorial-date"
                type="date"
                value={pictorialDate}
                onChange={(e) => setPictorialDate(e.target.value)}
                className="w-full p-2 bg-white border border-[#0A0A0A]"
              />
            </div>
          </div>

          {/* Row 4: Package Selection & Amounts */}
          <div className="p-3 bg-white border border-[#0A0A0A] space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
              <div>
                <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                  Assigned Package
                </label>
                <select
                  value={packageId}
                  onChange={(e) => setPackageId(e.target.value)}
                  className="w-full p-2 bg-[#F8F7F4] border border-[#0A0A0A] font-bold"
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
                <span className="text-base font-black text-[#0A0A0A]">{formatCurrency(currentTotal)}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-neutral-500 uppercase block">Remaining Balance</span>
                <span className={`text-base font-black ${currentBalance > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                  {formatCurrency(currentBalance)}
                </span>
              </div>
            </div>
            {addOns.length > 0 && (
              <div className="space-y-1 border-t border-neutral-200 pt-2">
                <h4 className="font-black uppercase">Selected Add-ons</h4>
                <ul className="space-y-1">
                  {addOns.map((item, index) => (
                    <li key={item.id ?? index} className="flex justify-between gap-3">
                      <span>{item.name}</span>
                      <span className="shrink-0">{formatCurrency(item.amount, { exact: true })}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Row 5: Operational & Floor Statuses */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Queue Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RegistrationStatus)}
                className="w-full p-2 bg-white border border-[#0A0A0A] uppercase text-[11px]"
              >
                <option value="pending_payment">Pending Payment</option>
                <option value="paid">Paid (In Queue)</option>
                <option value="shooting">Shooting (On Set)</option>
                <option value="done_shooting">Done Shooting</option>
                <option value="completed">Completed</option>
                <option value="ready_for_pickup">Ready for Pickup</option>
                <option value="released">Released</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Payment Status
              </label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                className="w-full p-2 bg-white border border-[#0A0A0A] uppercase text-[11px]"
              >
                <option value="unpaid">Unpaid</option>
                <option value="downpayment">Downpayment</option>
                <option value="fully_paid">Fully Paid</option>
              </select>
            </div>
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Framing Status
              </label>
              <select
                value={framingStatus}
                onChange={(e) => setFramingStatus(e.target.value as FramingStatus)}
                className="w-full p-2 bg-white border border-[#0A0A0A] uppercase text-[11px]"
              >
                <option value="none">None</option>
                <option value="pending_framing">Pending</option>
                <option value="in_production">In Production</option>
                <option value="framed">Framed</option>
                <option value="ready_for_pickup">Ready</option>
                <option value="released">Released</option>
              </select>
            </div>
            <div>
              <label className="block font-black uppercase text-[#0A0A0A] mb-1">
                Photo Status
              </label>
              <select
                value={photoStatus}
                onChange={(e) => setPhotoStatus(e.target.value as PhotoStatus)}
                className="w-full p-2 bg-white border border-[#0A0A0A] uppercase text-[11px]"
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
            <label className="block font-black uppercase text-[#0A0A0A] mb-1">
              Admin Notes / Special Instructions
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. VIP express shoot, custom frame sizing requested"
              className="w-full p-2 bg-white border border-[#0A0A0A]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-3 border-t-2 border-[#0A0A0A]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 font-bold uppercase tracking-wider bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] shadow-[3px_3px_0px_#0A0A0A] hover:bg-neutral-100 transition-colors btn-tactile cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 font-bold uppercase tracking-wider bg-[#0A0A0A] text-[#C9A227] border-2 border-[#0A0A0A] shadow-[3px_3px_0px_#0A0A0A] hover:bg-neutral-800 disabled:opacity-50 transition-all btn-tactile cursor-pointer"
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
