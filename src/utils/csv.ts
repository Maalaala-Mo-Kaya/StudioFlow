import type { PaymentRecord, RefundRecord, Registration } from '../types';
import { clientDetail, clientGroup } from './clientInfo';
import { buildAudit } from '../features/admin/auditData';

export interface ParsedRosterRow {
  full_name: string;
  student_id: string;
  section: string;
  email: string;
  mobile_number: string;
}

/**
 * Parses raw CSV/text lines into structured student roster items.
 * Expected format: `Full Name, Student ID, Section, Email, Mobile`
 */
export function parseRosterCsv(csvText: string): ParsedRosterRow[] {
  if (!csvText.trim()) return [];
  return csvText
    .trim()
    .split('\n')
    .map((line) => line.split(',').map((cell) => cell.trim()))
    .filter((parts) => parts.length >= 1 && Boolean(parts[0]))
    .map((parts) => ({
      full_name: parts[0],
      student_id: parts[1] || '',
      section: parts[2] || '',
      email: parts[3] || '',
      mobile_number: parts[4] || '',
    }));
}

/** One CSV cell: quoted, with inner quotes doubled, so commas and quotes in names stay in their column. */
const cell = (value: string | number | undefined | null) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const money = (value: number) => value.toFixed(2);
const manilaDateTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});
const when = (value: string) => {
  const date = new Date(value.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? manilaDateTime.format(date).replace(',', '') : '';
};

/**
 * Downloads every job order as CSV, with Paid and Balance worked out from the payment
 * records (same rules as the Audit Export) and a totals row at the end.
 */
export function buildRegistrationsCsv(registrations: Registration[], payments: PaymentRecord[], refunds: RefundRecord[] = []) {
  const audit = buildAudit(registrations, payments, refunds);
  const hasChoices = registrations.some((reg) => reg.package_snapshot?.configuration?.summary);
  const headers = [
    'Job Order No', 'Queue No', 'Family Name', 'Given Name', 'School / Client', 'Course / Session', 'Section', 'Mobile',
    'Package', 'Job Order Total', 'Counted In Gross', 'Paid', 'Refunded', 'Net Paid', 'Balance', 'Status', 'Payment Status', 'Prepared By',
    'Date Registered (PH time)', 'Note', 'Studio revenue', 'Other Payment - MUA', 'Unallocated cash', 'Discount credit', 'Operational collected',
    ...(hasChoices ? ['Package choices'] : []),
  ];
  const rows = audit.orders.map(({ registration: r, total, billed, paid, refunded, net, balance, cancelled, overpaid, revenue, discountCredit, operationalCollected }) => [
    cell(r.job_order_no), cell(r.queue_number || ''), cell(r.family_name), cell(r.given_name),
    cell(clientGroup(r, true)), cell(clientDetail(r, true)), cell(r.section), cell(r.mobile_number),
    cell(r.package_snapshot?.code || r.expand?.package?.code), money(total), money(billed), money(paid), money(refunded), money(net), money(balance),
    cell(r.status), cell(r.payment_status), cell(r.prepared_by), cell(when(r.created)),
    cell([cancelled && 'Cancelled: only money still held counts', overpaid > 0 && `Refund due ${money(overpaid)}`].filter(Boolean).join('; ')),
    money(revenue.studio), money(revenue.mua), money(revenue.unallocated), money(discountCredit), money(operationalCollected),
    ...(hasChoices ? [cell(r.package_snapshot?.configuration?.summary)] : []),
  ]);
  const { totals } = audit;
  const totalRow = [
    cell('TOTAL'), '', '', '', '', '', '', '', cell(`${totals.activeOrders} active, ${totals.cancelledOrders} cancelled`),
    '', money(totals.gross), money(totals.paidOnOrders), money(totals.refundedOnOrders),
    money(totals.paidOnOrders - totals.refundedOnOrders), money(totals.outstanding), '', '', '', '', '',
    money(totals.revenue.studio), money(totals.revenue.mua), money(totals.revenue.unallocated), money(totals.discountCredits), money(totals.analyticsCollected),
    ...(hasChoices ? [''] : []),
  ];
  return [headers.map(cell).join(','), ...rows.map((row) => row.join(',')), totalRow.join(',')].join('\r\n');
}

export function exportRegistrationsToCsv(registrations: Registration[], payments: PaymentRecord[], refunds: RefundRecord[] = []): void {
  const csvContent = buildRegistrationsCsv(registrations, payments, refunds);
  // The byte-order mark lets Excel read ₱ and accented names correctly.
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `StudioFlow_Report_${manilaDateTime.format(new Date()).slice(0, 10)}.csv`);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
