import React from 'react';
import { paymentDiscount, receiptRevenueLine } from './receiptData';
import type { PaymentRecord } from '../../types';
import { STUDIO_INFO } from '../../constants/studio';
import { formatJobOrderNo, formatQueueNumber } from '../../utils/formatters';
import { methodLabel, paymentTypeLabel, peso, profileLine, receiptDate, receiptLabel, statusLabel, type ReceiptData, type ReceiptPaper } from './receiptData';

/** Height of the receipt strip: one third of a letter sheet (3.67 in), so 3 receipts fit on one sheet. */
export const RECEIPT_HEIGHT_IN = 11 / 3;

/** A receipt strip as printed: alone on a leftover piece, or on the top third of a letter sheet with a cut line. */
export const StripPage: React.FC<{ paper: ReceiptPaper; children: React.ReactNode }> = ({ paper, children }) => (paper === 'half' ? children : (
  <div className="theme-paper relative w-[8.5in] h-[11in] bg-white">
    {children}
    <div aria-hidden className="absolute left-0 right-0 top-[3.667in] border-t border-dashed border-[#9a9a9a]">
      <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-white px-2 font-mono text-[7px] uppercase tracking-[0.25em] text-[#8a8a8a]">
        ✂ cut here · keep the rest of the sheet for the next receipts
      </span>
    </div>
  </div>
));

/**
 * A short strip (8.5 × 3.67 in, one third of a letter sheet) cut lengthwise into two 4.25 × 3.67 in receipts:
 * customer copy on the left, studio copy on the right. Literal hex colors: this is paper.
 */
export const PaymentReceiptSheet: React.FC<{ data: ReceiptData; payment: PaymentRecord }> = ({ data, payment }) => (
  <div className="theme-paper relative flex w-[8.5in] h-[3.667in] bg-white text-[#0a0a0a] font-sans">
    <ReceiptSlip data={data} payment={payment} copy="customer" />
    <div aria-hidden className="absolute top-0 bottom-0 left-[4.25in] border-l border-dashed border-[#9a9a9a]">
      <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap bg-white px-2 font-mono text-[7px] uppercase tracking-[0.3em] text-[#8a8a8a]">
        ✂ cut here
      </span>
    </div>
    <ReceiptSlip data={data} payment={payment} copy="studio" />
  </div>
);

const ReceiptSlip: React.FC<{ data: ReceiptData; payment: PaymentRecord; copy: 'customer' | 'studio' }> = ({ data, payment, copy }) => {
  const reg = data.registration;
  const isCustomer = copy === 'customer';
  const status = statusLabel(payment);
  const after = payment.balance_after ?? 0;
  const isCash = payment.payment_method === 'cash' && (payment.cash_tendered ?? 0) > 0;
  const discount = paymentDiscount(payment);
  const method = methodLabel(payment.payment_method) + (payment.remarks ? ` · ${payment.remarks}` : '');

  return (
    <section
      aria-label={isCustomer ? 'Customer receipt' : 'Studio receipt copy'}
      className="relative flex h-[3.667in] w-[4.25in] flex-col overflow-hidden px-[0.26in] pt-[0.2in] pb-[0.16in] text-[10px] leading-tight"
    >
      {status && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="-rotate-[24deg] border-4 border-[#c8102e] px-3 text-[38px] font-black tracking-[0.2em] text-[#c8102e] opacity-30">{status}</span>
        </div>
      )}

      <header className="flex items-end justify-between gap-2 border-b-2 border-[#0a0a0a] pb-[3px]">
        <div className="min-w-0">
          <div className="text-[15px] font-black uppercase tracking-[0.06em] leading-none">{STUDIO_INFO.name}</div>
          <div className="mt-[2px] truncate text-[7px] text-[#444]">{STUDIO_INFO.shortAddress} · Tel. {STUDIO_INFO.phone}</div>
        </div>
        <div className="shrink-0 border border-[#0a0a0a] px-[5px] py-[1px] text-center font-mono text-[6.5px] font-bold uppercase leading-[1.2] tracking-[0.12em]">
          Official Receipt<br />{isCustomer ? 'Customer Copy' : 'Studio Copy'}
        </div>
      </header>

      <div className="mt-[5px] flex items-end justify-between gap-2">
        <div>
          <div className="font-mono text-[6.5px] font-bold uppercase tracking-wider text-[#666]">Receipt №</div>
          <div className="font-mono text-[16px] font-black leading-none text-[#c8102e]">{receiptLabel(payment)}</div>
        </div>
        <div className="text-right font-mono text-[8.5px] font-bold">{receiptDate(payment.created, true)}</div>
      </div>

      <div className="mt-[5px] border border-[#0a0a0a] px-[6px] py-[3px]">
        <div className="flex justify-between gap-2 font-mono text-[8px] font-bold">
          <span>JOB ORDER <span className="text-[#c8102e]">{formatJobOrderNo(reg.job_order_no)}</span></span>
          <span>QUEUE {formatQueueNumber(reg.queue_number)}</span>
        </div>
        <div className="mt-[1px] truncate text-[12px] font-black uppercase">
          {reg.family_name}, {reg.given_name}{reg.middle_name ? ` ${reg.middle_name[0]}.` : ''}
        </div>
        <div className="truncate text-[7.5px] text-[#444]">
          {profileLine(reg)}
        </div>
      </div>

      <div className="mt-[6px] space-y-[3px] font-mono">
        <Row label="Payment For" value={paymentTypeLabel(payment)} />
        <Row label="Method" value={method} />
        <Row label="Previous Balance" value={peso(payment.balance_before)} />
        {discount && <>
          <Row label={`Discount Credit (${Number(discount.percentage.toFixed(2))}%)`} value={peso(-discount.amount)} />
          <p className="break-words text-[8px] leading-[9px]">Reason · {discount.reason}</p>
        </>}
      </div>

      <div className="mt-[4px] flex items-baseline justify-between border-y-2 border-[#0a0a0a] py-[3px] font-mono">
        <span className="text-[8.5px] font-black uppercase tracking-wider">Amount Paid</span>
        <span className="text-[18px] font-black">{peso(payment.amount)}</span>
      </div>

      <div className="mt-[4px] space-y-[3px] font-mono">
        {!isCustomer && !status && <p className="text-[7px]">Allocation movement · {receiptRevenueLine(data, payment)}</p>}
        {isCash && <Row label="Cash / Change" value={`${peso(payment.cash_tendered)} / ${peso(payment.change_amount)}`} />}
        <Row label="Balance at Issue" value={peso(after)} strong tone={after > 0 ? '#c8102e' : undefined} />
      </div>

      <div className={`mt-[5px] border-2 border-[#0a0a0a] py-[2px] text-center text-[9.5px] font-black uppercase tracking-[0.16em] ${
        after <= 0 ? 'border-double border-4' : ''
      }`}>
        {after <= 0 ? '✓ Fully Settled' : 'Balance due before release'}
      </div>

      <div className={`mt-auto grid gap-3 ${isCustomer ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <Sign label="Received By (Cashier)">
          <span className="font-mono text-[9px] font-bold uppercase">{payment.cashier_name || ''}</span>
        </Sign>
        {!isCustomer && <Sign label="Customer's Signature" />}
      </div>
      <div className="mt-[3px] text-center font-mono text-[6.5px] font-bold text-[#333]">
        {isCustomer ? 'Keep this receipt with your Job Order claim stub.' : `File with job order ${formatJobOrderNo(reg.job_order_no)}.`}
      </div>
    </section>
  );
};

const Row: React.FC<{ label: string; value: string; strong?: boolean; tone?: string }> = ({ label, value, strong, tone }) => (
  <div className="flex items-baseline justify-between gap-3">
    <span className="shrink-0 text-[7.5px] font-bold uppercase tracking-wider text-[#555]">{label}</span>
    <span className={`min-w-0 truncate text-right ${strong ? 'text-[12px] font-black' : 'text-[9.5px] font-bold'}`} style={tone ? { color: tone } : undefined}>
      {value}
    </span>
  </div>
);

const Sign: React.FC<{ label: string; children?: React.ReactNode }> = ({ label, children }) => (
  <div className="text-center">
    <div className="flex h-[22px] items-end justify-center">{children}</div>
    <div className="border-t border-[#0a0a0a] pt-[1px] font-mono text-[6.5px] font-bold uppercase tracking-wider text-[#444]">{label}</div>
  </div>
);
