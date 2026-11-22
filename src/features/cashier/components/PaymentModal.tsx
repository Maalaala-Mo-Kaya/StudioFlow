import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Registration } from '../../../types';
import { PAYMENT_METHOD_OPTIONS } from '../../../constants/studio';
import { formatClientName, formatCurrency, formatJobOrderNo, formatQueueNumber } from '../../../utils/formatters';
import { canUseCollectionMode, type CollectionMode } from '../useCashierState';
import { discountCents, revenueTerms, toCentavos } from '../../../utils/revenue';

export interface CashierPaymentIntent {
  balanceDue: number;
  /** A percentage, or a fixed peso `amount` off the Studio charges; reason only to correct the reason. */
  discount?: { percentage?: number; amount?: number; reason: string };
  amount?: number;
}

interface PaymentModalProps {
  registration: Registration;
  onClose: () => void;
  onSubmit: (intent: CashierPaymentIntent) => void;
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
  const savedDiscount = selectedReg.revenue_discount;
  const currentCredit = discountCents(selectedReg);
  const originalBilledCents = toCentavos(selectedReg.total_amount) + currentCredit;
  const originalPercentage = savedDiscount?.percentage ?? (currentCredit ? currentCredit * 100 / originalBilledCents : 0);
  const savedPercentage = Number(originalPercentage.toFixed(2));
  const savedFixed = Boolean(savedDiscount?.fixed);
  const savedFixedPesos = savedFixed ? String((savedDiscount?.studio ?? 0) / 100) : '';
  const [percentage, setPercentage] = React.useState(String(savedPercentage));
  const [fixedInput, setFixedInput] = React.useState(savedFixedPesos);
  // A discount is a percentage of the Studio charges, or a fixed peso amount off them.
  const [kind, setKind] = React.useState<'percent' | 'amount'>(savedFixed ? 'amount' : 'percent');
  const [reason, setReason] = React.useState(savedDiscount?.reason ?? '');
  // The discount box opens only when needed: on for an order that has a discount, off otherwise.
  const [discountOn, setDiscountOn] = React.useState(currentCredit > 0);
  const toggleDiscount = (on: boolean) => {
    setDiscountOn(on);
    // Off removes an existing discount on confirm (0%); on, or off with none, keeps what is saved.
    const removing = !on && currentCredit > 0;
    setKind(removing ? 'percent' : savedFixed ? 'amount' : 'percent');
    setPercentage(String(removing ? 0 : savedPercentage));
    setFixedInput(savedFixedPesos);
    setReason(savedDiscount?.reason ?? '');
  };
  const terms = revenueTerms(selectedReg);
  const eligibleBaseCents = terms.studio + (savedDiscount?.studio ?? 0);
  const paidCents = toCentavos(selectedReg.paid_amount);
  const reasonText = reason.trim().replace(/\s+/g, ' ');
  // Percent
  const percentageNumber = Number(percentage);
  const validPercentage = percentage === String(savedPercentage) || (/^\d+$/.test(percentage) && percentageNumber <= 100);
  const replacingRate = kind === 'percent' && validPercentage && (percentageNumber !== savedPercentage || savedFixed);
  const removingCredit = replacingRate && percentageNumber === 0;
  const studioCredit = Math.round(eligibleBaseCents * percentageNumber / 100);
  // Fixed amount (whole pesos)
  const fixedCents = /^\d+$/.test(fixedInput) ? Number(fixedInput) * 100 : NaN;
  const replacingFixed = kind === 'amount' && Number.isFinite(fixedCents) && fixedCents >= 100
    && (!savedFixed || fixedCents !== (savedDiscount?.studio ?? 0));
  const rateChanged = replacingRate || replacingFixed;
  const discountChanged = rateChanged || (currentCredit > 0 && reasonText !== savedDiscount?.reason);
  const previewCredit = removingCredit ? 0
    : replacingRate ? studioCredit + (savedDiscount?.mua ?? 0)
    : replacingFixed ? fixedCents + (savedDiscount?.mua ?? 0)
    : currentCredit;
  // Charges with no revenue type (neither Studio nor MUA): a percentage can't be worked out on them.
  const unclassified = [
    ...(selectedReg.package_snapshot && !['studio', 'mua'].includes(selectedReg.package_snapshot.revenue_category ?? '') ? [selectedReg.package_snapshot.name || 'the package'] : []),
    ...(Array.isArray(selectedReg.add_ons) ? selectedReg.add_ons : [])
      .filter((item) => item && !['studio', 'mua'].includes(item.revenue_category ?? '')).map((item) => item.name),
  ];
  const overpaid = discountChanged && previewCredit > originalBilledCents - paidCents;
  const percentError = kind !== 'percent' ? ''
    : !validPercentage ? 'Enter a whole percentage from 0 to 100.'
    : replacingRate && percentageNumber > 0 && terms.unallocated > 0
      ? `${formatCurrency(terms.unallocated / 100, { exact: true })} of this order${unclassified.length ? ` (${unclassified.join(', ')})` : ''} has no revenue type yet, so a percentage can't be worked out. Use a fixed amount instead, or ask an admin to classify it (Clients Directory → Edit → Revenue review).`
    : replacingRate && percentageNumber > 0 && studioCredit <= 0 ? 'This order has no Studio charges to discount.'
    : overpaid ? 'This discount would leave the order overpaid.' : '';
  const amountDiscountError = kind !== 'amount' || !discountOn ? ''
    : !fixedInput ? 'Enter the discount amount in whole pesos.'
    : !Number.isFinite(fixedCents) || fixedCents < 100 ? 'Enter a whole peso amount of at least ₱1.'
    : fixedCents > eligibleBaseCents ? `The discount can't be more than the Studio charges (${formatCurrency(eligibleBaseCents / 100, { exact: true })}).`
    : overpaid ? 'This discount would leave the order overpaid.' : '';
  const discountError = percentError || amountDiscountError;
  const reasonError = discountChanged && !removingCredit && reasonText.length < 3
    ? 'Enter a discount reason (at least 3 characters).' : '';
  const rateLabel = kind === 'amount' && (replacingFixed || (savedFixed && !rateChanged)) ? 'Fixed amount'
    : `${replacingRate ? percentageNumber : savedPercentage}%`;
  const totalCentavos = originalBilledCents - previewCredit;
  const balanceCentavos = Math.max(0, totalCentavos - paidCents);
  const formattedCredit = previewCredit > 0 ? `-${formatCurrency(previewCredit / 100, { exact: true })}` : formatCurrency(0);
  const needsPayment = balanceCentavos > 0;
  const noPayment = !needsPayment && discountChanged && previewCredit > 0;
  const complimentary = noPayment && totalCentavos === 0 && paidCents === 0;
  const modeAllowed = (mode: CollectionMode) => canUseCollectionMode({ ...selectedReg, balance: balanceCentavos / 100 }, mode);
  const modeDisabled = (mode: CollectionMode) => isProcessing || !modeAllowed(mode);

  const paymentValue = paymentType === 'full' ? String(balanceCentavos / 100)
    : paymentType === 'initial' ? String(Math.min(balanceCentavos, Math.round(totalCentavos / 200) * 100) / 100)
      : amountPaid;
  const amount = Number(paymentValue);
  const amountCentavos = toCentavos(amount);
  const allowDecimal = paymentType !== 'initial' && previewCredit > 0 && balanceCentavos % 100 !== 0;
  const moneyPattern = allowDecimal && amountCentavos === balanceCentavos ? /^\d+(\.\d{1,2})?$/ : /^\d+$/;
  const amountError = !paymentValue ? 'Payment amount is required.'
    : !moneyPattern.test(paymentValue) || !Number.isFinite(amount) ? 'Enter a valid payment amount.'
    : amountCentavos <= 0 ? 'Enter a positive payment amount.'
    : amountCentavos > balanceCentavos ? 'Payment cannot exceed the remaining balance.' : '';
  const projectedBalance = Math.max(0, balanceCentavos - (amountError ? 0 : amountCentavos));
  const isCash = paymentMethod === 'cash';
  const cashCentavos = toCentavos(Number(cashReceived));
  const cashError = !isCash || amountError ? ''
    : !cashReceived ? 'Enter the cash handed over by the client.'
    : !moneyPattern.test(cashReceived) || !Number.isSafeInteger(cashCentavos) ? 'Enter a valid cash amount.'
    : cashCentavos < amountCentavos ? 'Cash received is less than the payment amount.' : '';
  const changeCentavos = isCash && !amountError && !cashError ? cashCentavos - amountCentavos : 0;
  const canSubmit = !isProcessing && !discountError && !reasonError && (noPayment
    || (needsPayment && modeAllowed(paymentType) && !amountError && !cashError && cashierName.trim().length > 0));

  const selectMode = (mode: CollectionMode) => {
    if (modeDisabled(mode) || mode === paymentType) return;
    onPaymentTypeChange(mode);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-obsidian/80 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      {/* Two columns on wide screens (no scrolling); one scrolling column on phones and tablets. */}
      <div className="animate-modal bg-panel max-w-lg sm:max-w-xl lg:max-w-5xl w-full p-6 sm:p-8 lg:px-6 lg:py-4 border-2 border-line shadow-lux-gold max-h-[92dvh] lg:max-h-[97dvh] overflow-y-auto transition-all">
        <div className="flex justify-between items-start pb-4 border-b-2 border-line mb-5 lg:pb-2 lg:mb-3">
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
            aria-label="Close payment"
            className="w-8 h-8 bg-obsidian text-gold flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form noValidate onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit({
            balanceDue: balanceCentavos,
            discount: !discountChanged ? undefined
              : replacingFixed ? { amount: fixedCents / 100, reason: reasonText }
              : { percentage: replacingRate ? percentageNumber : undefined, reason: reasonText },
            amount: needsPayment ? amount : undefined,
          });
        }} className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
          <div className="space-y-4 lg:space-y-3 min-w-0">
          {!['cancelled', 'released'].includes(selectedReg.status) && (
            <fieldset disabled={isProcessing} className={`space-y-2 border p-3 ${discountOn || currentCredit > 0 ? 'border-gold' : 'border-line'}`}>
              <legend className="sr-only">Discount credit</legend>
              {/* Always visible: whether this order has a discount, and the switch to add or change one. */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-[11px] font-black uppercase tracking-wider text-ink">Discount</span>
                  <span className={`block text-xs font-bold ${previewCredit > 0 ? 'text-amber-600' : 'text-neutral-500'}`}>
                    {previewCredit > 0
                      ? `${rateLabel} · ${formattedCredit}${(reasonText || savedDiscount?.reason) ? ` · ${reasonText || savedDiscount?.reason}` : ''}`
                      : removingCredit ? 'Will be removed when you confirm' : 'No discount'}
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-[10px] font-black uppercase text-neutral-600">{discountOn ? 'On' : 'Off'}</span>
                  <button type="button" role="switch" aria-checked={discountOn} aria-label="Apply a discount"
                    onClick={() => toggleDiscount(!discountOn)}
                    className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors cursor-pointer ${discountOn ? 'bg-gold border-gold' : 'bg-canvas border-neutral-400'}`}>
                    <span className={`absolute top-0.5 size-4.5 rounded-full shadow transition-all ${discountOn ? 'left-[22px] bg-obsidian' : 'left-0.5 bg-neutral-400'}`} />
                  </button>
                </label>
              </div>
              {!discountOn && currentCredit > 0 && (
                <p className="text-xs font-bold text-red-600">The {savedFixed ? 'fixed' : `${savedPercentage}%`} discount ({formatCurrency(currentCredit / 100, { exact: true })}) will be removed when you confirm. Switch it back on to keep it.</p>
              )}
              {discountOn && (<>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>Studio charges {formatCurrency(eligibleBaseCents / 100, { exact: true })}</span>
                <span>Discount <strong>{formattedCredit}</strong></span>
              </div>
              <div role="radiogroup" aria-label="Discount type" className="grid grid-cols-2 gap-1.5">
                {([['percent', 'Percent (%)'], ['amount', 'Fixed amount (₱)']] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)}
                    className={`min-h-[36px] border text-[11px] font-black uppercase cursor-pointer ${kind === value ? 'bg-obsidian text-gold border-line' : 'bg-panel text-neutral-600 border-neutral-300 hover:border-line'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_1.3fr]">
                <div>
                  {kind === 'percent' ? (
                    <label className="block text-sm">Discount percentage
                      <span className="mt-1 flex w-full items-center border border-line bg-panel">
                        <input type="text" inputMode="numeric" maxLength={3} className="min-w-0 flex-1 bg-transparent p-2 outline-none"
                          aria-invalid={Boolean(percentError)} aria-describedby={percentError ? 'pos-percent-error' : undefined}
                          value={percentage}
                          // Whole numbers from 0 to 100 only: anything else is not typed in.
                          onChange={(event) => { const v = event.target.value; if (/^\d{0,3}$/.test(v) && (v === '' || Number(v) <= 100)) setPercentage(v); }} />
                        <span className="px-3 font-black text-gold-soft" aria-hidden="true">%</span>
                      </span>
                    </label>
                  ) : (
                    <label className="block text-sm">Discount amount
                      <span className="mt-1 flex w-full items-center border border-line bg-panel">
                        <span className="pl-3 font-black text-gold-soft" aria-hidden="true">₱</span>
                        <input type="text" inputMode="numeric" maxLength={7} placeholder="e.g. 200" className="min-w-0 flex-1 bg-transparent p-2 outline-none"
                          aria-invalid={Boolean(amountDiscountError)} aria-describedby={amountDiscountError ? 'pos-percent-error' : undefined}
                          value={fixedInput} onChange={(event) => { if (/^\d{0,7}$/.test(event.target.value)) setFixedInput(event.target.value); }} />
                      </span>
                    </label>
                  )}
                  {discountError && <p id="pos-percent-error" className="mt-1 text-xs font-bold text-red-600">{discountError}</p>}
                  {!discountError && currentCredit > 0 && <p className="mt-1 text-xs text-neutral-600">Switch the discount off to remove it.</p>}
                </div>
                <div>
                  <label className="block text-sm">Reason
                    <input className="mt-1 block w-full border border-line bg-panel p-2" maxLength={500} placeholder="e.g. Student council officer"
                      aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? 'pos-reason-error' : undefined}
                      value={reason} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  {reasonError && <p id="pos-reason-error" className="mt-1 text-xs font-bold text-red-600">{reasonError}</p>}
                </div>
              </div>
              </>)}
            </fieldset>
          )}
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
            {previewCredit > 0 && <div className="flex justify-between">
              <span className="text-neutral-400 uppercase">Discount ({rateLabel}):</span>
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
                {formatCurrency(balanceCentavos / 100, { exact: true })}
              </span>
            </div>
          </div>
          </div>

          <div className="space-y-4 lg:space-y-3 min-w-0">
          {!needsPayment && (
            <p className="p-3 border border-line bg-canvas text-xs font-bold text-neutral-700">
              {noPayment ? 'Nothing more to collect: confirming saves the discount and settles the order.' : 'Nothing to collect on this order.'}
            </p>
          )}
          {needsPayment && <fieldset disabled={isProcessing} className="min-w-0 space-y-4 lg:space-y-3">
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
                    aria-pressed={paymentType === mode && modeAllowed(mode)}
                    className={`btn-tactile min-h-[42px] lg:min-h-[38px] py-2 lg:py-1 px-3 text-xs font-black uppercase tracking-wider border-2 cursor-pointer disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-500 ${
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
                value={paymentValue}
                placeholder={paymentType === 'additional' ? 'Payment amount is required.' : undefined}
                readOnly={paymentType !== 'additional' || modeDisabled('additional')}
                onKeyDown={(e) => {
                  if (['-', '+', ',', 'e', 'E'].includes(e.key) || (!allowDecimal && e.key === '.')) e.preventDefault();
                }}
                onChange={(e) => {
                  if ((allowDecimal ? /^\d*(\.\d{0,2})?$/ : /^\d*$/).test(e.target.value)) onAmountPaidChange(e.target.value);
                }}
                className="w-full min-h-[48px] lg:min-h-[42px] font-mono text-xl font-black px-4 py-2 lg:py-1 border-2 border-line bg-gold-wash text-ink read-only:cursor-not-allowed read-only:opacity-80"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-2 border-line bg-gold-wash p-3 lg:p-2">
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

          </fieldset>}

          {/* Submit Buttons */}
          <div className="pt-4 lg:pt-3 border-t border-neutral-200 flex gap-3">
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
              {isProcessing ? 'Processing…' : complimentary ? 'Confirm Complimentary Settlement & Print' : 'Confirm & Print Receipt'}
            </button>
          </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
