import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Undo2, X } from 'lucide-react';
import type { PaymentRecord, RefundRecord, Registration } from '../../../types';
import { formatClientName, formatCurrency } from '../../../utils/formatters';
import { randomId } from '../../../utils/randomId';

const errorText = (err: unknown) => (err && typeof err === 'object' && 'response' in err
  ? (err as { response?: { message?: string } }).response?.message : undefined)
  || (err instanceof Error ? err.message : 'Something went wrong. Please try again.');

const shell = (title: string, icon: React.ReactNode, onClose: () => void, children: React.ReactNode) => createPortal(
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian/80 modal-overlay">
    <div role="dialog" aria-modal="true" aria-label={title}
      className="w-full max-w-md bg-canvas border-2 border-line shadow-lux p-6 space-y-4 font-mono text-xs max-h-[92vh] overflow-y-auto">
      <div className="flex items-center justify-between pb-3 border-b-2 border-line">
        <h3 className="text-sm font-black uppercase tracking-wider text-ink flex items-center gap-2">{icon} {title}</h3>
        <button type="button" onClick={onClose} aria-label="Close"
          className="w-8 h-8 flex items-center justify-center bg-panel border border-line hover:bg-gold hover:text-on-gold cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>,
  document.body,
);

interface VoidPaymentModalProps {
  payment: PaymentRecord;
  registration: Registration;
  onClose: () => void;
  onVoid: (paymentId: string, reason: string) => Promise<void>;
}

/** Void: the payment was recorded by mistake (the money was not really received). Permanent. */
export const VoidPaymentModal: React.FC<VoidPaymentModalProps> = ({ payment, registration, onClose, onVoid }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await onVoid(payment.id, reason.trim());
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };
  return shell('Void Payment', <Ban className="w-4 h-4 text-red-600" />, onClose, <>
    <div className="p-3 bg-panel border border-line space-y-1">
      <div className="font-black uppercase text-ink">{formatClientName(registration)} · JO {registration.job_order_no}</div>
      <div>Receipt <strong>{payment.receipt_no || '—'}</strong> · {formatCurrency(payment.amount, { exact: true })} · {payment.payment_method?.toUpperCase()}</div>
    </div>
    <div className="p-3 border-2 border-red-600 bg-red-50 text-red-900 space-y-1 leading-relaxed">
      <p className="font-black uppercase">Void only a payment recorded by mistake</p>
      <p>Use Void when the money was never really received (wrong amount, wrong client, test entry). The receipt stays on record marked VOIDED, and the balance goes back up. <strong>A void can&apos;t be undone.</strong></p>
      <p>If the client paid and is now getting money back, use <strong>Refund</strong> instead.</p>
    </div>
    <label className="block">
      <span className="block font-black uppercase text-ink mb-1">Reason <span className="text-red-600">*</span></span>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
        placeholder="e.g. Wrong amount entered; correct payment is OR-000045"
        className="w-full p-2 bg-panel border border-line text-ink font-sans" />
    </label>
    {error && <p role="alert" className="p-2 border border-red-600 text-red-700 font-bold">{error}</p>}
    <div className="flex gap-3 pt-2 border-t-2 border-line">
      <button type="button" onClick={onClose} className="flex-1 py-2.5 font-bold uppercase bg-panel border-2 border-line btn-tactile cursor-pointer">Cancel</button>
      <button type="button" onClick={() => void submit()} disabled={saving || reason.trim().length < 3}
        className="flex-1 py-2.5 font-black uppercase bg-red-600 text-white border-2 border-red-600 btn-tactile cursor-pointer disabled:opacity-40">
        {saving ? 'Voiding…' : 'Void Payment'}
      </button>
    </div>
  </>);
};

interface RefundModalProps {
  registration: Registration;
  /** Most that can be refunded now. */
  refundable: number;
  onClose: () => void;
  onRefund: (refund: { registrationId: string; amount: number; method: RefundRecord['method']; reason: string; clientKey: string }) => Promise<RefundRecord>;
  /** Called with the saved refund instead of onClose (to open the refund slip). */
  onRecorded?: (refund: RefundRecord) => void;
}

/** Refund: money given back today. The original payment stays as it was. */
export const RefundModal: React.FC<RefundModalProps> = ({ registration, refundable, onClose, onRefund, onRecorded }) => {
  const cancelled = registration.status === 'cancelled';
  const [amount, setAmount] = useState(String(refundable));
  const [method, setMethod] = useState<RefundRecord['method']>('cash');
  const [reason, setReason] = useState(cancelled ? 'Cancelled job order' : 'Overpaid after a price change');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // One key per refund attempt: retrying after a network error can't refund twice.
  const clientKey = useRef(randomId());
  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= 0.01 && Math.round(value * 100) <= Math.round(refundable * 100)
    && reason.trim().length >= 3;
  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await onRefund({ registrationId: registration.id, amount: Math.round(value * 100) / 100, method, reason: reason.trim(), clientKey: clientKey.current });
      if (onRecorded) onRecorded(saved);
      else onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };
  return shell('Record Refund', <Undo2 className="w-4 h-4 text-gold" />, onClose, <>
    <div className="p-3 bg-panel border border-line space-y-1">
      <div className="font-black uppercase text-ink">{formatClientName(registration)} · JO {registration.job_order_no}</div>
      <div>Job order total {formatCurrency(registration.total_amount, { exact: true })} · paid (net) {formatCurrency(registration.paid_amount, { exact: true })}</div>
      <div className="font-bold text-ink">
        {cancelled ? 'Cancelled: up to' : 'Paid more than the total: up to'} {formatCurrency(refundable, { exact: true })} can be refunded.
      </div>
    </div>
    <p className="text-neutral-600 leading-relaxed">
      The refund is recorded today with its own number (RF-…), and today&apos;s collections go down by this amount.
      The original receipt is not changed. A refund slip opens next: the client signs the studio copy when they get the money.
    </p>
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="block font-black uppercase text-ink mb-1">Amount (₱)</span>
        <input type="number" min={0.01} step={0.01} max={refundable} value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-full p-2 bg-panel border border-line text-ink font-bold" />
      </label>
      <label className="block">
        <span className="block font-black uppercase text-ink mb-1">Given back by</span>
        <select value={method} onChange={(e) => setMethod(e.target.value as RefundRecord['method'])}
          className="w-full p-2 bg-panel border border-line text-ink font-bold uppercase">
          <option value="cash">Cash</option>
          <option value="gcash">GCash</option>
          <option value="maya">Maya</option>
          <option value="card">Card</option>
        </select>
      </label>
    </div>
    <label className="block">
      <span className="block font-black uppercase text-ink mb-1">Reason <span className="text-red-600">*</span></span>
      <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
        className="w-full p-2 bg-panel border border-line text-ink font-sans" />
    </label>
    {error && <p role="alert" className="p-2 border border-red-600 text-red-700 font-bold">{error}</p>}
    <div className="flex gap-3 pt-2 border-t-2 border-line">
      <button type="button" onClick={onClose} className="flex-1 py-2.5 font-bold uppercase bg-panel border-2 border-line btn-tactile cursor-pointer">Cancel</button>
      <button type="button" onClick={() => void submit()} disabled={saving || !valid}
        className="flex-1 py-2.5 font-black uppercase bg-obsidian text-gold border-2 border-line btn-tactile cursor-pointer disabled:opacity-40">
        {saving ? 'Saving…' : `Refund ${valid ? formatCurrency(value, { exact: true }) : ''}`}
      </button>
    </div>
  </>);
};
