import React from 'react';
import { discountCents } from '../../utils/revenue';
import type { PaymentRecord } from '../../types';
import { STUDIO_INFO } from '../../constants/studio';
import { formatJobOrderNo, formatQueueNumber } from '../../utils/formatters';
import {
  orderExtras, receiptRevenueLine,
  isCounted, jobOrderMarks, methodLabel, soldPackagePrice, paymentTypeLabel, peso, receiptDate, receiptLabel, signatureUrl, statusLabel, visiblePayments, profileCells,
  type ReceiptData,
} from './receiptData';

/* Ink saver: outlines only, no solid fills. */
/** Rows that fit the payment table on a half sheet. Older rows are summarized. */
const MAX_ROWS = 4;

/**
 * One letter sheet (8.5 × 11 in) cut crosswise: customer claim stub on top,
 * studio accounting copy below. Literal hex colors: this is paper.
 */
export const JobOrderSheet: React.FC<{ data: ReceiptData; cashierName: string }> = ({ data, cashierName }) => (
  <div className="theme-paper relative w-[8.5in] h-[11in] bg-white text-[#0a0a0a] font-sans">
    <JobOrderHalf data={data} cashierName={cashierName} copy="customer" />
    <div aria-hidden className="absolute left-0 right-0 top-[5.5in] border-t border-dashed border-[#9a9a9a]">
      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white px-2 font-mono text-[7px] uppercase tracking-[0.3em] text-[#8a8a8a]">
        ✂ cut here
      </span>
    </div>
    <JobOrderHalf data={data} cashierName={cashierName} copy="studio" />
  </div>
);

const JobOrderHalf: React.FC<{ data: ReceiptData; cashierName: string; copy: 'customer' | 'studio' }> = ({ data, cashierName, copy }) => {
  const { registration: reg, payments } = data;
  const isCustomer = copy === 'customer';
  const pkg = reg.package_snapshot || reg.expand?.package;
  const extras = orderExtras(reg);
  const { rows, hidden } = visiblePayments(payments, MAX_ROWS);
  const latest = [...payments].reverse().find(isCounted);
  const credit = reg.status === 'cancelled' ? 0 : discountCents(reg) / 100;
  const settled = reg.balance <= 0 && reg.paid_amount + credit > 0;
  const marks = jobOrderMarks(reg);
  const cancelled = reg.status === 'cancelled';
  const refundNumbers = data.refunds.map((refund) => refund.refund_no).filter(Boolean);
  const signature = signatureUrl(reg);
  const name = [reg.family_name, ', ', reg.given_name, reg.middle_name ? ` ${reg.middle_name}` : ''].join('');

  return (
    <section
      aria-label={isCustomer ? 'Customer claim stub' : 'Studio accounting copy'}
      className={`relative h-[5.5in] w-[8.5in] overflow-hidden px-[0.32in] pt-[0.26in] ${isCustomer ? 'pb-[0.22in]' : 'pb-[1in]'} flex flex-col gap-[7px] text-[10px] leading-tight`}
    >
      {marks.stamp && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="-rotate-[18deg] whitespace-nowrap border-4 border-[#c8102e] px-4 text-[44px] font-black tracking-[0.18em] text-[#c8102e] opacity-25">{marks.stamp}</span>
        </div>
      )}
      {/* Header */}
      <header className="flex items-start justify-between gap-4 border-b-2 border-[#0a0a0a] pb-[5px]">
        <div className="min-w-0">
          <div className="text-[20px] font-black uppercase tracking-[0.08em] leading-none">{STUDIO_INFO.name}</div>
          <div className="mt-[2px] font-serif italic text-[9px] text-[#444]">{STUDIO_INFO.tagline}</div>
          <div className="text-[8.5px] text-[#444]">{STUDIO_INFO.address}</div>
          <div className="text-[8.5px] font-semibold text-[#333]">{STUDIO_INFO.hours} · Tel. {STUDIO_INFO.phone}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="inline-block border border-[#0a0a0a] px-2 py-[1px] font-mono text-[7.5px] font-bold uppercase tracking-[0.18em]">
            {isCustomer ? 'Customer Claim Stub' : 'Studio Accounting Copy'}
          </div>
          <div className="mt-[2px] flex items-baseline justify-end gap-2">
            <span className="text-[7px] font-black uppercase tracking-wider">Job Order</span>
            <span className="font-mono text-[22px] font-black leading-none text-[#c8102e]">{formatJobOrderNo(reg.job_order_no)}</span>
          </div>
          <div className="mt-[2px] font-mono text-[9px] font-bold text-[#333]">
            QUEUE {formatQueueNumber(reg.queue_number)} · {receiptDate(reg.created)}
          </div>
        </div>
      </header>

      {/* Client */}
      <div className="grid grid-cols-4 border-l border-t border-[#0a0a0a]">
        <Cell label="Client Name" span={2} strong>{name}</Cell>
        <Cell label="Mobile">{reg.mobile_number || '—'}</Cell>
        <Cell label="Email">{reg.email || '—'}</Cell>
        {profileCells(reg).map(([label, value, span]) => <Cell key={label} label={label} span={span}>{value}</Cell>)}
        <Cell label="Package" span={4}>
          {pkg ? `${pkg.code} · ${pkg.name} — ${peso(soldPackagePrice(reg))}` : '—'}
        </Cell>
        {/* Every add-on on its own line, never cut off: the client shows this to each station. */}
        <div className="col-span-4 min-w-0 border-b border-r border-[#0a0a0a] px-[5px] py-[2px]">
          <div className="font-mono text-[7px] font-bold uppercase tracking-wider text-[#666]">
            Add-ons{extras.length ? ` (${extras.length})` : ''}
          </div>
          {extras.length ? (
            <ol className="grid grid-cols-2 gap-x-[14px]">
              {extras.map(([label, amount], index) => (
                <li key={index} className="flex items-baseline justify-between gap-2 text-[10px] font-bold leading-snug">
                  <span className="min-w-0">{index + 1}. {label}</span>
                  <span className="shrink-0 font-mono">{peso(amount)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="text-[10px] font-bold">None</div>
          )}
        </div>
      </div>

      {/* Payments + totals */}
      <div className="flex gap-[6px]">
        <table className="flex-1 self-start border-collapse text-[9.5px]">
          <thead>
            <tr className="border-b-2 border-[#0a0a0a] text-left font-mono text-[7.5px] uppercase tracking-wider text-[#333]">
              <th className="px-[4px] py-[2px] font-bold">Date</th>
              <th className="px-[4px] py-[2px] font-bold">Receipt №</th>
              <th className="px-[4px] py-[2px] font-bold">Payment</th>
              <th className="px-[4px] py-[2px] font-bold">Method</th>
              {!isCustomer && <th className="px-[4px] py-[2px] font-bold">Cashier / Ref</th>}
              <th className="px-[4px] py-[2px] text-right font-bold">Amount</th>
              <th className="px-[4px] py-[2px] text-right font-bold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={isCustomer ? 6 : 7} className="border border-[#0a0a0a] px-[4px] py-[3px] text-center italic text-[#666]">No payment recorded yet</td></tr>
            )}
            {rows.map((payment) => <PaymentRow key={payment.id} payment={payment} studio={!isCustomer} />)}
            {hidden > 0 && (
              <tr><td colSpan={isCustomer ? 6 : 7} className="px-[4px] pt-[1px] text-[7px] italic text-[#666]">
                + {hidden} more payment{hidden === 1 ? '' : 's'} on file (older or voided)
              </td></tr>
            )}
          </tbody>
        </table>

        <div className="w-[2.2in] shrink-0 self-start border-2 border-[#0a0a0a] p-[6px] font-mono space-y-[2px]">
          <Line label="Original billed" value={peso(reg.total_amount + discountCents(reg) / 100)} />
          <p className="text-[7px] leading-tight">{receiptRevenueLine(data)}</p>
          {/* paid_amount is net of refunds; show the refund so the payment history still adds up. */}
          {(reg.refunded_amount ?? 0) > 0 && <Line label="Less refunds" value={`−${peso(reg.refunded_amount)}`} />}
          {refundNumbers.length > 0 && (
            <div className="text-right text-[7.5px] font-bold text-[#444]">{refundNumbers.join(', ')}</div>
          )}
          <Line label={(reg.refunded_amount ?? 0) > 0 ? 'Net Paid' : 'Payments received'} value={peso(reg.paid_amount)} tone="#0f6b3a" />
          {credit > 0 && <Line label="Total settled" value={peso(reg.paid_amount + credit)} />}
          <Line label={cancelled ? 'Balance (cancelled, not owed)' : 'Balance'} value={peso(reg.balance)} tone={reg.balance > 0 ? '#c8102e' : undefined} big />
          {/* A cancelled order owes nothing; show what the studio still holds (refundable up to this). */}
          {cancelled && <Line label="Held by studio" value={peso(Math.max(0, reg.paid_amount))} />}
          <div className={`mt-[4px] border text-center text-[10px] font-black uppercase tracking-[0.15em] py-[1px] ${
            settled || marks.settlement ? 'border-2 border-[#0a0a0a]' : 'border-[#0a0a0a]'
          }`}>
            {marks.settlement ?? (settled ? '✓ Fully Settled' : reg.paid_amount + credit > 0 ? 'Partial' : 'Unpaid')}
          </div>
          {latest?.payment_method === 'cash' && (latest.cash_tendered ?? 0) > 0 && (
            <div className="mt-[3px] text-[8px] text-[#444]">
              {receiptLabel(latest)}: cash {peso(latest.cash_tendered)} · change {peso(latest.change_amount)}
            </div>
          )}
        </div>
      </div>

      {/* Sign-offs */}
      <div className={`grid gap-4 ${isCustomer ? 'grid-cols-2' : 'grid-cols-3'}`}>
        <Sign label="Prepared By">
          <span className="font-mono text-[10px] font-bold uppercase">{reg.prepared_by || cashierName}</span>
        </Sign>
        <Sign label="Customer's Signature">
          {signature
            ? <img src={signature} alt="Customer signature" className="max-h-[30px] max-w-full object-contain" />
            : <span className="text-[7px] italic text-[#777]">Signed digitally on file</span>}
        </Sign>
        {!isCustomer && (
          <Sign label="Claimed By / Date">
            <span className="font-mono text-[8px] font-bold uppercase">
              {reg.claimed_by ? `${reg.claimed_by}${reg.released_at ? ` · ${receiptDate(reg.released_at)}` : ''}` : ''}
            </span>
          </Sign>
        )}
      </div>

      {/* Terms */}
      {isCustomer ? (
        <div className="mt-auto border-t-2 border-[#0a0a0a] pt-[3px] text-[7.2px] leading-[1.28] text-[#222]">
          <div className="font-mono text-[7.5px] font-black uppercase tracking-wider">Terms &amp; Conditions</div>
          <ol className="list-decimal pl-[10px] columns-2 gap-x-[14px]">
            {data.terms.map((clause, index) => <li key={index} className="break-inside-avoid">{clause}</li>)}
          </ol>
          <Footer>
            <span>DO NOT LOSE THIS CLAIM STUB — present it to claim your pictures.</span>
            <span>Inquiries: {STUDIO_INFO.phone} · {STUDIO_INFO.facebook}</span>
          </Footer>
        </div>
      ) : (
        <div className="mt-auto border-t-2 border-[#0a0a0a] pt-[3px]">
          <p className="text-[9.5px] font-semibold">
            The client agreed to the Terms &amp; Conditions printed on the customer claim stub, as shown by the signature above.
          </p>
          <Footer>
            <span>File with job order {formatJobOrderNo(reg.job_order_no)}</span>
            <span>Record ID {reg.id}</span>
          </Footer>
        </div>
      )}
    </section>
  );
};

const PaymentRow: React.FC<{ payment: PaymentRecord; studio: boolean }> = ({ payment, studio }) => {
  const status = statusLabel(payment);
  const cell = 'border border-[#0a0a0a] px-[5px] py-[3px] align-top';
  return (
    <tr className={status ? 'text-[#777] line-through' : ''}>
      <td className={`${cell} whitespace-nowrap`}>{receiptDate(payment.created)}</td>
      <td className={`${cell} whitespace-nowrap font-mono font-bold`}>{receiptLabel(payment)}</td>
      <td className={cell}>{paymentTypeLabel(payment)}{status && <span className="ml-1 font-black no-underline">({status})</span>}</td>
      <td className={cell}>{methodLabel(payment.payment_method)}</td>
      {studio && (
        <td className={`${cell} max-w-[1.25in] truncate`}>
          {[payment.cashier_name, payment.remarks].filter(Boolean).join(' · ') || '—'}
        </td>
      )}
      <td className={`${cell} whitespace-nowrap text-right font-mono font-bold`}>{peso(payment.amount)}</td>
      <td className={`${cell} whitespace-nowrap text-right font-mono`}>{peso(payment.balance_after)}</td>
    </tr>
  );
};

const Cell: React.FC<{ label: string; span?: number; strong?: boolean; children: React.ReactNode }> = ({ label, span = 1, strong, children }) => (
  <div className={`min-w-0 border-b border-r border-[#0a0a0a] px-[5px] py-[2px] ${span === 2 ? 'col-span-2' : span === 4 ? 'col-span-4' : ''}`}>
    <div className="font-mono text-[7px] font-bold uppercase tracking-wider text-[#666]">{label}</div>
    <div className={`truncate ${strong ? 'text-[13px] font-black uppercase' : 'text-[10px] font-bold'}`}>{children}</div>
  </div>
);

const Line: React.FC<{ label: string; value: string; tone?: string; big?: boolean }> = ({ label, value, tone, big }) => (
  <div className="flex items-baseline justify-between gap-2">
    <span className="text-[7.5px] font-bold uppercase tracking-wider text-[#555]">{label}</span>
    <span className={`font-black ${big ? 'text-[15px]' : 'text-[11px]'}`} style={tone ? { color: tone } : undefined}>{value}</span>
  </div>
);

const Sign: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="text-center">
    <div className="flex h-[30px] items-end justify-center">{children}</div>
    <div className="border-t border-[#0a0a0a] pt-[1px] font-mono text-[7.5px] font-bold uppercase tracking-wider text-[#444]">{label}</div>
  </div>
);

const Footer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mt-[3px] flex justify-between gap-2 border-t border-[#0a0a0a]/40 pt-[2px] font-mono text-[7.5px] font-bold">
    {children}
  </div>
);
