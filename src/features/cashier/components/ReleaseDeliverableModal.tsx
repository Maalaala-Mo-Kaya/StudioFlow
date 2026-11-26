import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Registration } from '../../../types';
import { formatCurrency } from '../../../utils/formatters';
import { releaseBlocker } from '../../../utils/releaseReadiness';
import { clientSummary } from '../../../utils/clientInfo';

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
  const notReadyReason = releaseBlocker(registration);
  const canRelease = !hasOutstandingBalance && !notReadyReason;

  const handleConfirm = async () => {
    if (!canRelease) return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/80 modal-overlay">
      <div className="w-full max-w-lg sm:max-w-xl lg:max-w-2xl bg-canvas border-2 border-line shadow-lux p-6 space-y-5 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-line">
          <div>
            <h3 className="font-mono text-sm font-black uppercase tracking-wider text-ink">
              Release Deliverable Gate
            </h3>
            <p className="font-mono text-xs text-neutral-500">
              Job Order: {registration.job_order_no}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center font-mono font-bold text-sm bg-panel border border-line hover:bg-gold hover:text-on-gold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Participant & Package Summary */}
        <div className="p-3 bg-panel border border-line text-xs font-mono space-y-1">
          <div className="font-black text-sm uppercase text-ink">
            {registration.family_name}, {registration.given_name}
          </div>
          <div className="text-neutral-600">
            {clientSummary(registration, true).replace(' · ', ' • ') || 'School • Course'}
          </div>
          <div className="pt-2 flex justify-between border-t border-neutral-200">
            <span>Package: {registration.expand?.package?.name || 'Package'}</span>
            <span className="font-black text-ink">{formatCurrency(registration.total_amount)}</span>
          </div>
        </div>

        {/* Production Readiness Block: the server enforces the same gate */}
        {notReadyReason && (
          <div className="p-4 bg-amber-50 border-2 border-amber-500 text-xs font-mono space-y-1.5">
            <div className="font-black text-amber-800 uppercase tracking-wide">
              ⏳ Not Ready for Release
            </div>
            <p className="text-amber-900 leading-relaxed">{notReadyReason}</p>
          </div>
        )}

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
              className="w-full mt-2 py-2 font-mono text-xs font-bold uppercase bg-red-600 text-white border-2 border-line shadow-lux hover:bg-red-700 transition-colors btn-tactile cursor-pointer"
            >
              Collect Remaining Balance ({formatCurrency(registration.balance)})
            </button>
          </div>
        ) : (
          <div className="p-3 bg-emerald-50 border-2 border-emerald-600 text-xs font-mono space-y-1">
            <div className="font-black text-emerald-800 uppercase tracking-wide flex items-center gap-2">
              <span>✓ FULLY SETTLED</span>
              {!notReadyReason && (
                <>
                  <span>•</span>
                  <span>AUTHORIZED FOR RELEASE</span>
                </>
              )}
            </div>
            <p className="text-emerald-900">
              Total of {formatCurrency(registration.total_amount)} has been settled in full.
            </p>
          </div>
        )}

        {/* Claim Verification Form */}
        {canRelease && (
          <div className="space-y-4 font-mono text-xs">
            <div>
              <label className="block font-bold uppercase text-ink mb-1">
                Claimed By / Representative Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={claimedBy}
                onChange={(e) => setClaimedBy(e.target.value)}
                placeholder="Full name of person receiving package"
                className="w-full p-2.5 bg-panel border border-line text-ink font-mono text-xs focus:outline-hidden focus:border-gold"
              />
            </div>

            <div className="p-3 bg-panel border border-line space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inspected}
                  onChange={(e) => setInspected(e.target.checked)}
                  className="mt-0.5 accent-gold w-4 h-4 rounded-none"
                />
                <span className="text-neutral-700 leading-snug">
                  I confirm that all framed portraits, soft copies, and prints have been inspected for quality and delivered to the recipient.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-3 border-t-2 border-line">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 font-mono text-xs font-bold uppercase tracking-wider bg-panel text-ink border-2 border-line shadow-lux hover:bg-neutral-100 transition-colors btn-tactile cursor-pointer"
          >
            Cancel
          </button>
          {canRelease && (
            <button
              type="button"
              disabled={!claimedBy.trim() || !inspected || isSubmitting}
              onClick={handleConfirm}
              className="flex-1 py-2.5 font-mono text-xs font-bold uppercase tracking-wider bg-obsidian text-gold border-2 border-line shadow-lux hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all btn-tactile cursor-pointer"
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
