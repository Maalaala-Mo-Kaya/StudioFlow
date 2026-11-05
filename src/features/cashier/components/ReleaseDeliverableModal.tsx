import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Registration } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';

interface ReleaseDeliverableModalProps {
  registration: Registration;
  onClose: () => void;
  onConfirmRelease: (id: string, claimedBy: string) => Promise<void>;
  onOpenPaymentModal: (reg: Registration) => void;
}

export const ReleaseDeliverableModal: React.FC<ReleaseDeliverableModalProps> = ({
  registration,
  onClose,
  onConfirmRelease,
  onOpenPaymentModal,
}) => {
  const [claimedBy, setClaimedBy] = useState(
    `${registration.given_name} ${registration.family_name}`
  );
  const [inspected, setInspected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasOutstandingBalance = (registration.balance || 0) > 0;

  const handleConfirm = async () => {
    if (hasOutstandingBalance) return;
    if (!claimedBy.trim() || !inspected) return;

    setIsSubmitting(true);
    try {
      await onConfirmRelease(registration.id, claimedBy.trim());
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A0A0A]/80 backdrop-blur-xs animate-modal">
      <div className="w-full max-w-lg sm:max-w-xl lg:max-w-2xl bg-[#F8F7F4] border-2 border-[#0A0A0A] shadow-[8px_8px_0px_#0A0A0A] p-6 space-y-5 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-[#0A0A0A]">
          <div>
            <h3 className="font-mono text-sm font-black uppercase tracking-wider text-[#0A0A0A]">
              Release Deliverable Gate
            </h3>
            <p className="font-mono text-xs text-[#666666]">
              Job Order: {registration.job_order_no}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center font-mono font-bold text-sm bg-white border border-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Participant & Package Summary */}
        <div className="p-3 bg-white border border-[#0A0A0A] text-xs font-mono space-y-1">
          <div className="font-black text-sm uppercase text-[#0A0A0A]">
            {registration.family_name}, {registration.given_name}
          </div>
          <div className="text-neutral-600">
            {registration.expand?.organization?.name || 'School'} • {registration.expand?.course?.code || 'Course'}
          </div>
          <div className="pt-2 flex justify-between border-t border-neutral-200">
            <span>Package: {registration.expand?.package?.name || 'Package'}</span>
            <span className="font-black text-[#0A0A0A]">{formatCurrency(registration.total_amount)}</span>
          </div>
        </div>

        {/* Balance Verification Block (T048 / AC022 Enforcement) */}
        {hasOutstandingBalance ? (
          <div className="p-4 bg-red-50 border-2 border-red-600 text-xs font-mono space-y-2">
            <div className="flex items-center gap-2 font-black text-red-700 uppercase tracking-wide">
              <span>⛔ RELEASE BLOCKED</span>
              <span>•</span>
              <span>UNPAID BALANCE</span>
            </div>
            <p className="text-red-800 leading-relaxed">
              Deliverables <strong className="underline">cannot be released</strong> while an outstanding balance remains. Please settle the remaining payment first.
            </p>
            <div className="flex justify-between items-center pt-2 border-t border-red-200">
              <span className="font-bold text-neutral-700">Remaining Balance:</span>
              <span className="text-base font-black text-red-700">
                {formatCurrency(registration.balance)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPaymentModal(registration);
              }}
              className="w-full mt-2 py-2 font-mono text-xs font-bold uppercase bg-red-600 text-white border-2 border-[#0A0A0A] shadow-[3px_3px_0px_#0A0A0A] hover:bg-red-700 transition-colors btn-tactile cursor-pointer"
            >
              Collect Remaining Balance ({formatCurrency(registration.balance)})
            </button>
          </div>
        ) : (
          <div className="p-3 bg-emerald-50 border-2 border-emerald-600 text-xs font-mono space-y-1">
            <div className="font-black text-emerald-800 uppercase tracking-wide flex items-center gap-2">
              <span>✓ FULLY SETTLED</span>
              <span>•</span>
              <span>AUTHORIZED FOR RELEASE</span>
            </div>
            <p className="text-emerald-900">
              Total of {formatCurrency(registration.total_amount)} has been settled in full.
            </p>
          </div>
        )}

        {/* Claim Verification Form */}
        {!hasOutstandingBalance && (
          <div className="space-y-4 font-mono text-xs">
            <div>
              <label className="block font-bold uppercase text-[#0A0A0A] mb-1">
                Claimed By / Representative Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={claimedBy}
                onChange={(e) => setClaimedBy(e.target.value)}
                placeholder="Full name of person receiving package"
                className="w-full p-2.5 bg-white border border-[#0A0A0A] text-[#0A0A0A] font-mono text-xs focus:outline-hidden focus:border-[#C9A227]"
              />
            </div>

            <div className="p-3 bg-white border border-[#0A0A0A] space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inspected}
                  onChange={(e) => setInspected(e.target.checked)}
                  className="mt-0.5 accent-[#C9A227] w-4 h-4 rounded-none"
                />
                <span className="text-neutral-700 leading-snug">
                  I confirm that all framed portraits, soft copies, and prints have been inspected for quality and delivered to the recipient.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-3 border-t-2 border-[#0A0A0A]">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 font-mono text-xs font-bold uppercase tracking-wider bg-white text-[#0A0A0A] border-2 border-[#0A0A0A] shadow-[3px_3px_0px_#0A0A0A] hover:bg-neutral-100 transition-colors btn-tactile cursor-pointer"
          >
            Cancel
          </button>
          {!hasOutstandingBalance && (
            <button
              type="button"
              disabled={!claimedBy.trim() || !inspected || isSubmitting}
              onClick={handleConfirm}
              className="flex-1 py-2.5 font-mono text-xs font-bold uppercase tracking-wider bg-[#0A0A0A] text-[#C9A227] border-2 border-[#0A0A0A] shadow-[3px_3px_0px_#0A0A0A] hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all btn-tactile cursor-pointer"
            >
              {isSubmitting ? 'Recording Release...' : 'Confirm Release'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
