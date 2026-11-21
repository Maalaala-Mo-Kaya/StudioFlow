import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Registration } from '../../../types';
import { PAYMENT_METHOD_OPTIONS } from '../../../constants/studio';
import { formatClientName, formatCurrency, formatJobOrderNo, formatQueueNumber } from '../../../utils/formatters';
import { canUseCollectionMode, type CollectionMode } from '../useCashierState';
import { pb } from '../../../db/pocketbase';
import { useToast } from '../../../context/ToastContext';
import { workflowApi, workflowError } from '../../../hooks/useWorkflowData';
import { discountCents } from '../../../utils/revenue';

interface PaymentModalProps {
  registration: Registration;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  isProcessing: boolean;
  paymentType: CollectionMode;
  onPaymentTypeChange: (type: CollectionMode) => void;
  amountPaid: string;
  onAmountPaidChange: (amount: string) => void;
  paymentMethod: 'cash' | 'gcash' | 'maya' | 'card';
  onPaymentMethodChange: (method: 'cash' | 'gcash' | 'maya' | 'card') => void;
  cashierName: string;
  onCashierNameChange: (name: string) => void;
  remarks: string;
  onRemarksChange: (remarks: string) => void;
  cashReceived: string;
  onCashReceivedChange: (amount: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  registration: selectedReg,
  onClose,
  onSubmit,
  isProcessing,
  paymentType,
  onPaymentTypeChange,
  amountPaid,
  onAmountPaidChange,
  paymentMethod,
  onPaymentMethodChange,
  cashierName,
  onCashierNameChange,
  remarks,
  onRemarksChange,
  cashReceived,
  onCashReceivedChange,
}) => {
  const { toast } = useToast();
  const [savingDiscount, setSavingDiscount] = React.useState(false);
  const [percentage, setPercentage] = React.useState(String(Math.round(selectedReg.revenue_discount?.percentage ?? 0)));
  const [reason, setReason] = React.useState(selectedReg.revenue_discount?.reason ?? '');
  const currentCreditCents = discountCents(selectedReg);
  const originalBilledCents = Math.round(selectedReg.total_amount * 100) + currentCreditCents;
  const eligibleBaseCents = Math.max(0, (selectedReg.revenue_terms?.studio ?? Math.round(selectedReg.total_amount * 100))
    + (selectedReg.revenue_discount?.studio ?? 0));
  const percentageNumber = /^\d+$/.test(percentage) ? Number(percentage) : 0;
  const previewCreditCents = Math.min(Math.round(eligibleBaseCents * percentageNumber / 100),
    Math.max(0, originalBilledCents - Math.round(selectedReg.paid_amount * 100)));
  const previewBalanceCents = Math.max(0, originalBilledCents - Math.round(selectedReg.paid_amount * 100) - previewCreditCents);
  const formattedCredit = previewCreditCents > 0 ? `-${formatCurrency(previewCreditCents / 100)}` : formatCurrency(0);
  const noEligibleCharges = eligibleBaseCents === 0;
  React.useEffect(() => {
    if (paymentType === 'full') onAmountPaidChange(String(previewBalanceCents / 100));
    if (paymentType === 'initial') onAmountPaidChange(String(Math.min(previewBalanceCents, Math.round(originalBilledCents / 200) * 100) / 100));
  }, [paymentType, previewBalanceCents, originalBilledCents, onAmountPaidChange]);
  async function saveDiscount() {
    setSavingDiscount(true);
    try {
      await pb.send(`${workflowApi}/registrations/${selectedReg.id}/discount`, {
        method: 'POST', body: { percentage: Number(percentage), reason },
      });
      toast.success('Discount updated.');
      onClose();
    } catch (error) {
      toast.error(workflowError(error));
    } finally {
      setSavingDiscount(false);
    }
  }
  const toCentavos = (amount: number) => Math.round(amount * 100);
  const totalCentavos = toCentavos(selectedReg.total_amount || 0);
  const balanceCentavos = toCentavos(selectedReg.balance || 0);
  const allowDecimal = paymentType !== 'initial' && !!selectedReg.revenue_discount && balanceCentavos % 100 !== 0;
  const discountSettlement = allowDecimal && toCentavos(Number(amountPaid)) === balanceCentavos;
  const moneyPattern = discountSettlement ? /^\d+(\.\d{1,2})?$/ : /^\d+$/;
  const amount = Number(amountPaid);
  const amountCentavos = toCentavos(amount);
  const amountError = !amountPaid ? 'Payment amount is required.'
    : !moneyPattern.test(amountPaid) || !Number.isFinite(amount) ? 'Enter a valid payment amount.'
    : amountCentavos < (discountSettlement ? 1 : 100) ? 'Enter a positive payment amount.'
    : amountCentavos > balanceCentavos ? 'Payment cannot exceed the remaining balance.'
    : '';
  const projectedBalance = Math.max(0, balanceCentavos - (amountError ? 0 : amountCentavos));
  const modeDisabled = (mode: CollectionMode) => isProcessing || !canUseCollectionMode(selectedReg, mode);
  const isCash = paymentMethod === 'cash';
  const cashCentavos = toCentavos(Number(cashReceived));
  const cashError = !isCash || amountError ? ''
    : !cashReceived ? 'Enter the cash handed over by the client.'
    : !moneyPattern.test(cashReceived) ? 'Enter a valid cash amount.'
    : cashCentavos < amountCentavos ? 'Cash received is less than the payment amount.'
    : '';
  const changeCentavos = isCash && !amountError && !cashError ? cashCentavos - amountCentavos : 0;
  const canSubmit = !savingDiscount && !modeDisabled(paymentType) && !amountError && !cashError && cashierName.trim().length > 0;

  const selectMode = (mode: CollectionMode) => {
    if (modeDisabled(mode) || mode === paymentType) return;
    onPaymentTypeChange(mode);
    if (mode === 'full') onAmountPaidChange(String(balanceCentavos / 100));
    if (mode === 'initial') onAmountPaidChange(String(Math.min(balanceCentavos, Math.round(totalCentavos / 200) * 100) / 100));
    if (mode === 'additional') onAmountPaidChange('');
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-obsidian/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="animate-modal bg-panel max-w-lg sm:max-w-xl lg:max-w-2xl w-full p-6 sm:p-8 border-2 border-line shadow-lux-gold max-h-[92dvh] overflow-y-auto transition-all">
        <div className="flex justify-between items-start pb-4 border-b-2 border-line mb-5">
          <div>
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-gold-soft">
              POS // PAYMENT VERIFICATION
            </span>
            <h3 className="text-xl font-black text-ink uppercase mt-0.5">
              {formatClientName(selectedReg)}
            </h3>
            <p className="text-xs text-neutral-500 font-mono font-bold mt-0.5">
              Job Order <span className="text-red-600">{formatJobOrderNo(selectedReg.job_order_no)}</span> •
              Queue {formatQueueNumber(selectedReg.queue_number)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 bg-obsidian text-gold flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!['cancelled', 'released'].includes(selectedReg.status) && (
          <fieldset disabled={savingDiscount || isProcessing} className="mb-4 space-y-2 border border-line p-3">
            <legend className="px-1 font-bold">Discount credit</legend>
            <div className="space-y-1 text-sm">
              <p>Eligible charges {formatCurrency(eligibleBaseCents / 100)}</p>
              <p>Discount amount <strong>{formattedCredit}</strong></p>
              <p>Amount due after discount <strong>{formatCurrency(previewBalanceCents / 100)}</strong></p>
            </div>
            {noEligibleCharges && percentageNumber > 0 &&
              <p className="text-xs font-bold text-amber-300">No classified Studio charges are available for this order. Reconcile its revenue classification before applying a percentage discount.</p>}
            <label className="block text-sm">Discount percentage (0 removes the credit)
              <span className="mt-1 flex w-full items-center border border-line bg-panel">
                <input type="number" min="0" max="100" step="1" inputMode="numeric" className="min-w-0 flex-1 bg-transparent p-2 outline-none"
                  value={percentage} onChange={(event) => setPercentage(event.target.value)} />
                <span className="px-3 font-black text-gold-soft">%</span>
              </span>
            </label>
            <label className="block text-sm">Reason
              <input className="block w-full border border-line bg-panel p-2" maxLength={500}
                value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button type="button" className="bg-obsidian px-3 py-2 font-bold text-gold"
              disabled={!/^\d+$/.test(percentage) || Number(percentage) > 100 || (Number(percentage) > 0 && (reason.trim().length < 3 || noEligibleCharges))}
              onClick={() => void saveDiscount()}>Save discount</button>
          </fieldset>
        )}
        {selectedReg.balance > 0 && <form onSubmit={onSubmit} className="space-y-4">
          {/* Breakdown Box */}
          <div className="bg-obsidian text-white p-4 border border-line text-xs space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-neutral-400 uppercase">Package:</span>
              <span className="font-bold text-gold">
                {selectedReg.expand?.package?.name || 'Pictorial Package'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-400 uppercase">Original Job Amount:</span>
              <span className="font-black text-white">
                {formatCurrency(originalBilledCents / 100)}
              </span>
            </div>
            {percentageNumber > 0 && <div className="flex justify-between">
              <span className="text-neutral-400 uppercase">Discount ({percentageNumber}%):</span>
              <span className="font-black text-amber-300">{formattedCredit}</span>
            </div>}
            <div className="flex justify-between">
              <span className="text-neutral-400 uppercase">Previously Paid:</span>
              <span className="font-bold text-emerald-400">
                {formatCurrency(selectedReg.paid_amount)}
              </span>
            </div>
            <div className="flex justify-between border-t border-neutral-800 pt-2">
              <span className="text-gold uppercase font-black">Amount Due:</span>
              <span className="font-black text-gold text-base">
                {formatCurrency(previewBalanceCents / 100)}
              </span>
            </div>
          </div>

          {/* Payment Mode Toggle */}
          <div>
            <label className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
              Collection Mode
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                ['full', 'Full Settlement'],
                ['initial', '50% Downpayment'],
                ['additional', 'Additional Payment'],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => selectMode(mode)}
                  disabled={modeDisabled(mode)}
                  aria-pressed={paymentType === mode && canUseCollectionMode(selectedReg, mode)}
                  className={`btn-tactile min-h-[42px] py-2 px-3 text-xs font-black uppercase tracking-wider border-2 cursor-pointer disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-500 ${
                    paymentType === mode
                      ? 'bg-obsidian text-gold border-line'
                      : 'bg-panel text-neutral-700 border-neutral-300 enabled:hover:border-line'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label htmlFor="pos-payment-amount" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
              Payment Amount (₱)
            </label>
            <input
              id="pos-payment-amount"
              type="number"
              inputMode={allowDecimal ? 'decimal' : 'numeric'}
              min={allowDecimal ? '0.01' : '1'}
              max={(balanceCentavos / 100).toFixed(2)}
              step={allowDecimal ? '0.01' : '1'}
              value={amountPaid}
              placeholder={paymentType === 'additional' ? 'Payment amount is required.' : undefined}
              readOnly={paymentType !== 'additional' || modeDisabled('additional')}
              onKeyDown={(e) => {
                if (['-', '+', ',', 'e', 'E'].includes(e.key) || (!allowDecimal && e.key === '.')) e.preventDefault();
              }}
              onChange={(e) => {
                if ((allowDecimal ? /^\d*(\.\d{0,2})?$/ : /^\d*$/).test(e.target.value)) onAmountPaidChange(e.target.value);
              }}
              className="w-full min-h-[48px] font-mono text-xl font-black px-4 py-2 border-2 border-line bg-gold-wash text-ink read-only:cursor-not-allowed read-only:opacity-80"
            />
            {amountError && <span className="mt-1 block text-[11px] font-bold text-red-600">{amountError}</span>}
            <span className="font-mono text-[11px] font-bold text-neutral-600 mt-1 block">
              Remaining Balance After Payment:{' '}
              <strong className="text-red-600">
                {formatCurrency(projectedBalance / 100, { exact: true })}
              </strong>
            </span>
          </div>

          {/* Payment Method & Cashier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
                Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => onPaymentMethodChange(e.target.value as 'cash' | 'gcash' | 'maya' | 'card')}
                className="w-full min-h-[44px] text-xs font-bold px-3 py-2 border border-neutral-400 bg-panel"
              >
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
                Prepared By (Cashier)
              </label>
              <input
                type="text"
                value={cashierName}
                onChange={(e) => onCashierNameChange(e.target.value)}
                className="w-full min-h-[44px] text-xs font-bold px-3 py-2 border border-neutral-400"
              />
            </div>
          </div>

          {isCash && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-2 border-line bg-gold-wash p-3">
              <div>
                <label htmlFor="pos-cash-received" className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
                  Cash Received (₱)
                </label>
                <div className="flex gap-2">
                  <input
                    id="pos-cash-received"
                    type="number"
                    inputMode={allowDecimal ? 'decimal' : 'numeric'}
                    min="0"
                    step={allowDecimal ? '0.01' : '1'}
                    value={cashReceived}
                    placeholder="e.g. 2000"
                    onKeyDown={(e) => {
                      if (['-', '+', ',', 'e', 'E'].includes(e.key) || (!allowDecimal && e.key === '.')) e.preventDefault();
                    }}
                    onChange={(e) => {
                      if ((allowDecimal ? /^\d*(\.\d{0,2})?$/ : /^\d*$/).test(e.target.value)) onCashReceivedChange(e.target.value);
                    }}
                    className="min-w-0 flex-1 min-h-[44px] font-mono text-lg font-black px-3 py-1.5 border-2 border-line bg-panel text-ink"
                  />
                  <button
                    type="button"
                    disabled={Boolean(amountError)}
                    onClick={() => onCashReceivedChange(String(amountCentavos / 100))}
                    className="btn-tactile shrink-0 px-3 bg-obsidian text-gold text-[10px] font-black uppercase tracking-wider cursor-pointer disabled:opacity-40"
                  >
                    Exact
                  </button>
                </div>
                {cashError && <span className="mt-1 block text-[11px] font-bold text-red-600">{cashError}</span>}
              </div>
              <div className="flex flex-col justify-center sm:items-end">
                <span className="text-[11px] font-black text-ink uppercase tracking-wider">Change</span>
                <span className="font-mono text-2xl font-black text-emerald-700" aria-live="polite">
                  {formatCurrency(changeCentavos / 100, { exact: true })}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-black text-ink uppercase tracking-wider mb-1.5">
              Reference / Remarks
            </label>
            <input
              type="text"
              placeholder="Optional GCash ref # or cashier note"
              value={remarks}
              onChange={(e) => onRemarksChange(e.target.value)}
              className="w-full min-h-[44px] text-xs px-3 py-2 border border-neutral-400"
            />
          </div>

          {/* Submit Buttons */}
          <div className="pt-4 border-t border-neutral-200 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="btn-tactile w-1/3 min-h-[46px] py-2.5 border border-line text-ink font-bold text-xs uppercase hover:bg-neutral-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-tactile w-2/3 min-h-[46px] py-2.5 bg-obsidian text-gold border border-line font-black text-xs uppercase tracking-widest cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? 'Processing...' : 'Confirm & Print Receipt'}
            </button>
          </div>
        </form>}
      </div>
    </div>,
    document.body
  );
};
