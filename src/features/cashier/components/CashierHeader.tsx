import React from 'react';
import { RotateCw } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';

interface CashierHeaderProps {
  hasLoaded: boolean;
  loading: boolean;
  totalCollectedToday: number;
  /** Counted (not voided) payments since Manila midnight. */
  paymentsToday: number;
  /** Refunds given today and their total (already taken off the total). */
  refundsToday?: number;
  refundedToday?: number;
  /** When the most recent counted payment was made ('' when there are none). */
  lastPaymentAt: string;
  onRefresh: () => void;
}

const MANILA = 'Asia/Manila';
const timeOnly = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA, hour: 'numeric', minute: '2-digit' });
const dateAndTime = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const manilaDay = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA });

/** "10:55 PM" when it was today (studio time), otherwise "Nov 19, 10:55 PM". */
function lastPaymentLabel(value: string): string {
  const date = new Date(value.replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return '';
  return manilaDay.format(date) === manilaDay.format(new Date()) ? timeOnly.format(date) : dateAndTime.format(date);
}

export const CashierHeader: React.FC<CashierHeaderProps> = ({
  hasLoaded,
  loading,
  totalCollectedToday,
  paymentsToday,
  refundsToday = 0,
  refundedToday = 0,
  lastPaymentAt,
  onRefresh,
}) => {
  const last = lastPaymentAt ? lastPaymentLabel(lastPaymentAt) : '';
  const refundNote = refundsToday
    ? ` · ${refundsToday} refund${refundsToday === 1 ? '' : 's'} −${formatCurrency(refundedToday, { exact: true })}`
    : '';
  const summary = (paymentsToday
    ? `${paymentsToday} payment${paymentsToday === 1 ? '' : 's'} today${last ? ` · last ${last}` : ''}`
    : `No payments yet today${last ? ` · last payment ${last}` : ''}`) + refundNote;

  return (
    <div className="animate-enter bg-obsidian text-white p-5 sm:p-6 mb-6 border-2 border-line shadow-lux-gold flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <span className="font-mono text-[10px] font-black uppercase tracking-widest bg-gold text-on-gold px-2 py-0.5 inline-block mb-1.5">
          POS Station
        </span>
        <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-white">
          Cashier &amp; <span className="text-gold">Receipt Desk</span>
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Verify client job orders, collect payments, and dispatch clients to the shooting queue.
        </p>
      </div>

      <div className="flex items-center gap-3 self-start md:self-auto">
        <div
          className="bg-obsidian-2 border border-gold px-4 py-2.5 text-right"
          title="Payments received since midnight (Philippine time), minus refunds given today; voided payments are not counted. Starts again at ₱0 every midnight."
        >
          <span className="block font-mono text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Collected Today
          </span>
          <span className="font-mono text-lg sm:text-xl font-black text-gold">
            {hasLoaded ? formatCurrency(totalCollectedToday) : '—'}
          </span>
          <span className="block font-mono text-[10px] text-neutral-400 mt-0.5">{hasLoaded ? summary : loading ? 'Loading payments…' : 'Payments unavailable'}</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh cashier records"
          className="btn-tactile min-h-[48px] flex items-center gap-2 px-4 py-2.5 bg-obsidian-2 hover:bg-neutral-800 border border-neutral-700 text-white text-xs font-black uppercase tracking-widest cursor-pointer"
        >
          <RotateCw className="w-4 h-4 text-gold" />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>
    </div>
  );
};
