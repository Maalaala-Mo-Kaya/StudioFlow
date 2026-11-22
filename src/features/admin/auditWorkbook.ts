import ExcelJS, { type Worksheet } from 'exceljs';
import type { PaymentRecord } from '../../types';
import { STUDIO_INFO } from '../../constants/studio';
import { clientDetail, clientGroup } from '../../utils/clientInfo';
import { downloadBlob } from '../../utils/downloadBlob';
import { discountRate } from '../../utils/revenue';
import type { AuditData, AuditGroup } from './auditData';

/**
 * Printable audit report (Excel): Summary, Job Orders, Payments, Refunds and Discounts sheets.
 * Every total is an Excel formula over the rows below it, so a printed copy can be checked by hand.
 * No solid fills, to save ink.
 */

const MANILA = 'Asia/Manila';
const dateTime = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA, year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA, year: 'numeric', month: 'short', day: 'numeric' });
const fileDate = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA });
const PESO = '"₱"#,##0.00;-"₱"#,##0.00';
// Excel paper size 1 = Letter (8.5 × 11 in); exceljs only names some sizes.
const LETTER = 1 as unknown as NonNullable<Worksheet['pageSetup']['paperSize']>;
const thin = { style: 'thin' as const };
const box = { top: thin, left: thin, bottom: thin, right: thin };

const PAYMENT_TYPES: Record<PaymentRecord['payment_type'], string> = {
  initial: 'Downpayment', full: 'Full payment', additional: 'Additional payment', balance_settlement: 'Balance settlement',
};
const ORDER_STATUS: Record<string, string> = {
  pending_payment: 'Pending payment', paid: 'Paid (in queue)', shooting: 'Shooting', done_shooting: 'Done shooting',
  completed: 'Completed', ready_for_pickup: 'Ready for pickup', released: 'Released', cancelled: 'Cancelled',
};

const toDate = (value: string) => new Date(value.replace(' ', 'T'));
const when = (value = '') => {
  const date = toDate(value);
  return Number.isFinite(date.getTime()) ? dateTime.format(date) : '';
};
const clientName = (reg?: { family_name: string; given_name: string; middle_name?: string }) =>
  reg ? [`${reg.family_name},`, reg.given_name, reg.middle_name].filter(Boolean).join(' ') : '(job order removed)';

export interface AuditPeriod {
  /** "Today", "This Month" or "All Time". */
  label: string;
  since?: string;
}

function periodText(period: AuditPeriod, now: Date) {
  if (!period.since) return `All Time (everything up to ${dateTime.format(now)})`;
  return `${period.label}: ${dateOnly.format(toDate(period.since))} to ${dateTime.format(now)} (Philippine time)`;
}

function setupPrint(sheet: Worksheet, title: string, headerRow: number) {
  sheet.pageSetup = {
    orientation: 'landscape', paperSize: LETTER, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    printTitlesRow: headerRow ? `${headerRow}:${headerRow}` : undefined,
  };
  sheet.headerFooter.oddFooter = `&L${STUDIO_INFO.name} · ${title}&RPage &P of &N`;
}

function headerRowStyle(sheet: Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.eachCell((cell) => { cell.border = { bottom: { style: 'medium' } }; });
}

function totalRowStyle(sheet: Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true };
  row.eachCell((cell) => { cell.border = { top: { style: 'medium' }, bottom: { style: 'double' } }; });
}

export function buildAuditWorkbook(audit: AuditData, period: AuditPeriod, now = new Date()) {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.creator = STUDIO_INFO.name;
  const range = periodText(period, now);
  const isPeriod = Boolean(period.since);

  // Sheets in print order; the Summary is filled in last because it points at the other two.
  const summary = workbook.addWorksheet('Summary', { views: [{ showGridLines: false }] });

  // ---- Job Orders -------------------------------------------------------------------------
  const ordersSheet = workbook.addWorksheet('Job Orders', { views: [{ state: 'frozen', ySplit: 4 }] });
  ordersSheet.columns = [
    { key: 'jo', width: 10 }, { key: 'made', width: 19 }, { key: 'client', width: 28 }, { key: 'group', width: 26 },
    { key: 'detail', width: 18 }, { key: 'pkg', width: 12 }, { key: 'status', width: 16 },
    { key: 'total', width: 14, style: { numFmt: PESO } }, { key: 'billed', width: 14, style: { numFmt: PESO } },
    { key: 'paid', width: 14, style: { numFmt: PESO } }, { key: 'refunded', width: 14, style: { numFmt: PESO } },
    { key: 'balance', width: 14, style: { numFmt: PESO } }, { key: 'overpaid', width: 14, style: { numFmt: PESO } },
    { key: 'note', width: 34 },
    // Appended after Note so the formulas above (columns I–M) stay where they are.
    { key: 'discount', width: 14, style: { numFmt: PESO } }, { key: 'discountWhy', width: 34 },
  ];
  ordersSheet.getCell('A1').value = `${STUDIO_INFO.name} · Job Orders`;
  ordersSheet.getCell('A1').font = { bold: true, size: 14 };
  ordersSheet.getCell('A2').value = isPeriod ? `Job orders made in the period. ${range}` : `All job orders. ${range}`;
  ordersSheet.getRow(4).values = ['JO №', 'Date made', 'Client', 'School / Client', 'Course / Session', 'Package', 'Status',
    'Job order total', 'Counted in gross', 'Paid', 'Refunded', 'Balance', 'Refund due (overpaid)', 'Note',
    'Discount', 'Discount rate · reason'];
  headerRowStyle(ordersSheet, 4);
  const firstOrder = 5;
  for (const order of audit.orders) {
    const reg = order.registration;
    const notes = [
      order.cancelled && `Cancelled${reg.cancel_reason ? ` (${reg.cancel_reason})` : ''}: only money still held counts; nothing owed`,
      order.overpaid > 0 && 'Paid more than the total: give back the refund due',
    ].filter(Boolean).join('. ');
    ordersSheet.addRow({
      jo: reg.job_order_no || '', made: when(reg.created), client: clientName(reg), group: clientGroup(reg, true),
      detail: clientDetail(reg, true), pkg: reg.package_snapshot?.code || reg.expand?.package?.code || '', status: ORDER_STATUS[reg.status] ?? reg.status,
      total: order.total, billed: order.billed, paid: order.paid, refunded: order.refunded, balance: order.balance,
      overpaid: order.overpaid, note: notes,
      // The order's discount (all of it, whenever it was given); the Discounts sheet lists the period's credits.
      ...(reg.revenue_discount && !order.cancelled ? {
        discount: ((reg.revenue_discount.studio ?? 0) + (reg.revenue_discount.mua ?? 0)) / 100,
        discountWhy: [discountRate(reg.revenue_discount, reg.total_amount), reg.revenue_discount.reason]
          .filter(Boolean).join(' · '),
      } : {}),
    });
  }
  const lastOrder = firstOrder + audit.orders.length - 1;
  const ordersTotalRow = lastOrder + 2;
  const orderSum = (column: string) => (audit.orders.length ? `SUM(${column}${firstOrder}:${column}${lastOrder})` : '0');
  ordersSheet.getCell(`G${ordersTotalRow}`).value = `TOTAL (${audit.totals.activeOrders} active${audit.totals.cancelledOrders ? `, ${audit.totals.cancelledOrders} cancelled` : ''})`;
  ordersSheet.getCell(`I${ordersTotalRow}`).value = { formula: orderSum('I'), result: audit.totals.gross };
  ordersSheet.getCell(`J${ordersTotalRow}`).value = { formula: orderSum('J'), result: audit.totals.paidOnOrders };
  ordersSheet.getCell(`K${ordersTotalRow}`).value = { formula: orderSum('K'), result: audit.totals.refundedOnOrders };
  ordersSheet.getCell(`L${ordersTotalRow}`).value = { formula: orderSum('L'), result: audit.totals.outstanding };
  ordersSheet.getCell(`M${ordersTotalRow}`).value = { formula: orderSum('M'), result: audit.totals.overpaid };
  totalRowStyle(ordersSheet, ordersTotalRow);
  setupPrint(ordersSheet, 'Job Orders', 4);

  // ---- Payments ---------------------------------------------------------------------------
  const paymentsSheet = workbook.addWorksheet('Payments', { views: [{ state: 'frozen', ySplit: 4 }] });
  paymentsSheet.columns = [
    { key: 'receipt', width: 12 }, { key: 'date', width: 19 }, { key: 'jo', width: 10 }, { key: 'client', width: 28 },
    { key: 'group', width: 24 }, { key: 'type', width: 18 }, { key: 'method', width: 9 },
    { key: 'amount', width: 14, style: { numFmt: PESO } }, { key: 'status', width: 11 }, { key: 'counted', width: 9 },
    { key: 'earlier', width: 14 }, { key: 'cashier', width: 18 }, { key: 'remarks', width: 40 },
  ];
  paymentsSheet.getCell('A1').value = `${STUDIO_INFO.name} · Payments Received`;
  paymentsSheet.getCell('A1').font = { bold: true, size: 14 };
  paymentsSheet.getCell('A2').value = `Every receipt in the period, including voided ones (listed, not counted). ${range}`;
  paymentsSheet.getRow(4).values = ['Receipt №', 'Date & time', 'JO №', 'Client', 'School / Client', 'Type', 'Method',
    'Amount', 'Status', 'Counted', isPeriod ? 'For earlier job order' : '', 'Cashier', 'Remarks / void reason'];
  headerRowStyle(paymentsSheet, 4);
  const firstPayment = 5;
  for (const row of audit.payments) {
    const { payment, registration: reg } = row;
    const voidNote = payment.status === 'voided'
      ? `VOIDED${payment.voided_at ? ` ${when(payment.voided_at)}` : ''}${payment.voided_by ? ` by ${payment.voided_by}` : ''}${payment.void_reason ? `: ${payment.void_reason}` : ''}`
      : payment.status === 'refunded' ? 'Refunded (old method: removed from its original day)' : '';
    paymentsSheet.addRow({
      receipt: payment.receipt_no || '', date: when(payment.created), jo: reg?.job_order_no || '', client: clientName(reg),
      group: reg ? clientGroup(reg, true) : '', type: PAYMENT_TYPES[payment.payment_type] ?? payment.payment_type,
      method: (payment.payment_method || '').toUpperCase(), amount: payment.amount,
      status: (payment.status || 'completed').replace(/^\w/, (letter) => letter.toUpperCase()),
      counted: row.counted ? 'Yes' : 'No', earlier: isPeriod ? (row.earlierOrder ? 'Yes' : 'No') : '',
      cashier: payment.cashier_name || '', remarks: [payment.remarks, voidNote].filter(Boolean).join(' · '),
    });
  }
  const lastPayment = firstPayment + audit.payments.length - 1;
  const paymentsTotalRow = lastPayment + 2;
  const amounts = `H${firstPayment}:H${Math.max(firstPayment, lastPayment)}`;
  const countedCol = `J${firstPayment}:J${Math.max(firstPayment, lastPayment)}`;
  const earlierCol = `K${firstPayment}:K${Math.max(firstPayment, lastPayment)}`;
  const voidedTotal = audit.payments.filter((row) => !row.counted).reduce((sum, row) => sum + row.payment.amount, 0);
  paymentsSheet.getCell(`G${paymentsTotalRow}`).value = `COUNTED (${audit.totals.countedPayments})`;
  paymentsSheet.getCell(`H${paymentsTotalRow}`).value = audit.payments.length
    ? { formula: `SUMIF(${countedCol},"Yes",${amounts})`, result: audit.totals.collections } : 0;
  totalRowStyle(paymentsSheet, paymentsTotalRow);
  paymentsSheet.getCell(`G${paymentsTotalRow + 1}`).value = `Voided (${audit.totals.voidedPayments}), not counted`;
  paymentsSheet.getCell(`H${paymentsTotalRow + 1}`).value = audit.payments.length
    ? { formula: `SUMIF(${countedCol},"No",${amounts})`, result: voidedTotal } : 0;
  setupPrint(paymentsSheet, 'Payments', 4);

  // ---- Refunds ----------------------------------------------------------------------------
  const refundsSheet = workbook.addWorksheet('Refunds', { views: [{ state: 'frozen', ySplit: 4 }] });
  refundsSheet.columns = [
    { key: 'no', width: 12 }, { key: 'date', width: 19 }, { key: 'jo', width: 10 }, { key: 'client', width: 28 },
    { key: 'group', width: 24 }, { key: 'method', width: 9 }, { key: 'amount', width: 14, style: { numFmt: PESO } },
    { key: 'earlier', width: 14 }, { key: 'by', width: 18 }, { key: 'reason', width: 40 },
  ];
  refundsSheet.getCell('A1').value = `${STUDIO_INFO.name} · Refunds Given`;
  refundsSheet.getCell('A1').font = { bold: true, size: 14 };
  refundsSheet.getCell('A2').value = `Money given back to clients in the period, dated when it was given back. ${range}`;
  refundsSheet.getRow(4).values = ['Refund №', 'Date & time', 'JO №', 'Client', 'School / Client', 'Method', 'Amount',
    isPeriod ? 'For earlier job order' : '', 'Given by', 'Reason'];
  headerRowStyle(refundsSheet, 4);
  const firstRefund = 5;
  for (const row of audit.refunds) {
    const { refund, registration: reg } = row;
    refundsSheet.addRow({
      no: refund.refund_no || '', date: when(refund.created), jo: reg?.job_order_no || '', client: clientName(reg),
      group: reg ? clientGroup(reg, true) : '', method: (refund.method || '').toUpperCase(), amount: refund.amount,
      earlier: isPeriod ? (row.earlierOrder ? 'Yes' : 'No') : '', by: refund.refunded_by || '', reason: refund.reason || '',
    });
  }
  const lastRefund = firstRefund + audit.refunds.length - 1;
  const refundsTotalRow = lastRefund + 2;
  const refundAmounts = `G${firstRefund}:G${Math.max(firstRefund, lastRefund)}`;
  const refundEarlier = `H${firstRefund}:H${Math.max(firstRefund, lastRefund)}`;
  refundsSheet.getCell(`F${refundsTotalRow}`).value = `TOTAL (${audit.totals.refundCount})`;
  refundsSheet.getCell(`G${refundsTotalRow}`).value = audit.refunds.length
    ? { formula: `SUM(${refundAmounts})`, result: audit.totals.refunds } : 0;
  totalRowStyle(refundsSheet, refundsTotalRow);
  setupPrint(refundsSheet, 'Refunds', 4);

  // ---- Discounts --------------------------------------------------------------------------
  const discountsSheet = workbook.addWorksheet('Discounts', { views: [{ state: 'frozen', ySplit: 4 }] });
  discountsSheet.columns = [
    { key: 'date', width: 19 }, { key: 'jo', width: 10 }, { key: 'client', width: 28 }, { key: 'group', width: 24 },
    { key: 'pct', width: 13 }, { key: 'credit', width: 14, style: { numFmt: PESO } }, { key: 'earlier', width: 14 },
    { key: 'by', width: 18 }, { key: 'reason', width: 40 },
  ];
  discountsSheet.getCell('A1').value = `${STUDIO_INFO.name} · Discount Credits`;
  discountsSheet.getCell('A1').font = { bold: true, size: 14 };
  discountsSheet.getCell('A2').value = `Discounts granted in the period on active job orders: the credit counts as collected (up to what was unpaid when given). ${range}`;
  discountsSheet.getRow(4).values = ['Date granted', 'JO №', 'Client', 'School / Client', 'Rate', 'Credit',
    isPeriod ? 'For earlier job order' : '', 'Granted by', 'Reason'];
  headerRowStyle(discountsSheet, 4);
  const firstDiscount = 5;
  for (const row of audit.discounts) {
    const reg = row.registration;
    discountsSheet.addRow({
      date: row.at ? when(row.at) : '', jo: reg.job_order_no || '', client: clientName(reg), group: clientGroup(reg, true),
      pct: row.fixed ? 'Fixed amount' : `${row.percentage}%`, credit: row.credit, earlier: isPeriod ? (row.earlierOrder ? 'Yes' : 'No') : '',
      by: row.by, reason: row.reason,
    });
  }
  const lastDiscount = firstDiscount + audit.discounts.length - 1;
  const discountsTotalRow = lastDiscount + 2;
  discountsSheet.getCell(`E${discountsTotalRow}`).value = `TOTAL (${audit.discounts.length})`;
  discountsSheet.getCell(`F${discountsTotalRow}`).value = audit.discounts.length
    ? { formula: `SUM(F${firstDiscount}:F${lastDiscount})`, result: audit.totals.discountCredits } : 0;
  totalRowStyle(discountsSheet, discountsTotalRow);
  setupPrint(discountsSheet, 'Discounts', 4);

  // ---- Summary (first sheet) --------------------------------------------------------------
  const revenueSheet = workbook.addWorksheet('Revenue');
  revenueSheet.columns = [
    { width: 17 }, { width: 19 }, { width: 14 },
    ...Array.from({ length: 4 }, () => ({ width: 20, style: { numFmt: PESO } })),
    { width: 20 }, { width: 19 },
  ];
  revenueSheet.getCell('A1').value = 'Revenue allocation movements';
  revenueSheet.getCell('A2').value = 'Mixed partial and unverified cash stays unallocated. Settlement or refunds can move cash between categories.';
  revenueSheet.getRow(4).values = ['Document', 'Date', 'Job Order', 'Studio', 'Other Payment - MUA', 'Unallocated', 'Cash movement',
    'Assigned MUA ID', 'MUA completed at'];
  headerRowStyle(revenueSheet, 4);
  for (const { payment, registration, revenue, counted } of audit.payments) {
    if (counted) revenueSheet.addRow([payment.receipt_no || payment.id, when(payment.created), registration?.job_order_no,
      revenue.studio, revenue.mua, revenue.unallocated, payment.amount, registration?.makeup_artist, when(registration?.makeup_completed_at)]);
  }
  for (const { refund, registration, revenue } of audit.refunds) {
    revenueSheet.addRow([refund.refund_no || refund.id, when(refund.created), registration?.job_order_no,
      revenue.studio, revenue.mua, revenue.unallocated, -refund.amount, registration?.makeup_artist, when(registration?.makeup_completed_at)]);
  }
  const lastRevenue = revenueSheet.rowCount;
  setupPrint(revenueSheet, 'Revenue allocation', 4);
  summary.columns = [{ width: 46 }, { width: 18 }, { width: 62 }];
  summary.getCell('A1').value = `${STUDIO_INFO.name} · Audit Report`;
  summary.getCell('A1').font = { bold: true, size: 16 };
  summary.getCell('A2').value = `Period: ${range}`;
  summary.getCell('A3').value = `Printed / exported: ${dateTime.format(now)}`;

  const orders = `'Job Orders'`;
  type Line = [key: string, label: string, value: { formula: string; result: number }, how: string, bold?: boolean];
  const lines: Line[] = [
    ['received', 'Payments received', { formula: `Payments!H${paymentsTotalRow}`, result: audit.totals.collections },
      'Counted total on the Payments sheet (voided excluded)'],
    ['refunds', 'Refunds given', { formula: `Refunds!G${refundsTotalRow}`, result: audit.totals.refunds },
      'Total on the Refunds sheet (money given back in this period)'],
    ['discountCredits', 'DISCOUNT CREDITS', { formula: `Discounts!F${discountsTotalRow}`, result: audit.totals.discountCredits },
      'Total on the Discounts sheet: credits granted in this period on active orders'],
    ['analyticsCollected', 'OPERATIONAL COLLECTED', { formula: '', result: audit.totals.analyticsCollected }, 'Net payments plus discount credits'],
    ['net', 'NET COLLECTIONS (cash to account for)', { formula: '', result: audit.totals.netCollections },
      'Payments received − Refunds given', true],
    ...([
      ['studio', 'Studio revenue', 'D'],
      ['mua', 'Other Payment - MUA', 'E'],
      ['unallocated', 'Unallocated cash', 'F'],
    ] as const).map(([key, label, column]): Line => [
      key, label, { formula: lastRevenue >= 5 ? `SUM(Revenue!${column}5:${column}${lastRevenue})` : '0', result: audit.totals.revenue[key] },
      'Net allocation movements from the Revenue sheet',
    ]),
    ['gross', 'Gross invoiced (job orders made)', { formula: `${orders}!I${ordersTotalRow}`, result: audit.totals.gross },
      'Total of "Counted in gross" on the Job Orders sheet. A cancelled order counts only for money it still holds.', true],
    ['paid', '   Paid on these job orders', { formula: `${orders}!J${ordersTotalRow}`, result: audit.totals.paidOnOrders },
      'Every counted payment ever received for the job orders listed'],
    ['refunded', '   Refunded on these job orders', { formula: `${orders}!K${ordersTotalRow}`, result: audit.totals.refundedOnOrders },
      'Every refund ever given for the job orders listed'],
    ['outstanding', '   Outstanding balances', { formula: `${orders}!L${ordersTotalRow}`, result: audit.totals.outstanding },
      'Still unpaid on the active job orders listed', true],
  ];
  if (audit.totals.overpaid > 0) {
    lines.push(['overpaid', '   Refund due (overpaid)', { formula: `${orders}!M${ordersTotalRow}`, result: audit.totals.overpaid },
      'Total of "Refund due" on the Job Orders sheet: paid beyond a job order total, still to be given back', true]);
  }
  if (isPeriod) {
    lines.push(['earlierPaid', 'Payments for job orders made before this period', {
      formula: audit.payments.length ? `SUMIFS(Payments!${amounts},Payments!${countedCol},"Yes",Payments!${earlierCol},"Yes")` : '0',
      result: audit.totals.collectionsOnEarlierOrders,
    }, 'Balances paid now on older job orders (Payments sheet, "For earlier job order" = Yes)']);
    lines.push(['earlierRefunded', 'Refunds for job orders made before this period', {
      formula: audit.refunds.length ? `SUMIF(Refunds!${refundEarlier},"Yes",Refunds!${refundAmounts})` : '0',
      result: audit.totals.refundsOnEarlierOrders,
    }, 'Refunds given now on older job orders (Refunds sheet, "For earlier job order" = Yes)']);
  }
  let rowNumber = 5;
  summary.getRow(rowNumber).values = ['Figure', 'Amount', 'How it is computed'];
  headerRowStyle(summary, rowNumber);
  const cellOf: Record<string, string> = {};
  for (const [key, label, value, how, bold] of lines) {
    rowNumber += 1;
    cellOf[key] = `B${rowNumber}`;
    if (key === 'net') value.formula = `${cellOf.received}-${cellOf.refunds}`;
    const row = summary.getRow(rowNumber);
    if (key === 'analyticsCollected') value.formula = `${cellOf.received}-${cellOf.refunds}+${cellOf.discountCredits}`;
    row.values = [label, value.formula ? value : value.result, how];
    row.getCell(2).numFmt = PESO;
    row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    if (bold) row.font = { bold: true };
  }

  // Checks: each difference must be ₱0.00.
  rowNumber += 2;
  summary.getCell(`A${rowNumber}`).value = 'Checks (each difference must be ₱0.00)';
  summary.getCell(`A${rowNumber}`).font = { bold: true };
  const netOnOrders = `(${cellOf.paid}-${cellOf.refunded})`;
  const checks: Array<[string, string, boolean]> = [
    ['Net collections − Studio, MUA and unallocated',
      `${cellOf.net}-SUM(${cellOf.studio},${cellOf.mua},${cellOf.unallocated})`,
      Math.round((audit.totals.netCollections - audit.totals.revenue.studio - audit.totals.revenue.mua - audit.totals.revenue.unallocated) * 100) === 0],
    ['Gross − (Paid − Refunded on these job orders + Outstanding − Refund due)',
      `${cellOf.gross}-(${netOnOrders}+${cellOf.outstanding}${cellOf.overpaid ? `-${cellOf.overpaid}` : ''})`,
      audit.ordersBalanced],
    [isPeriod
      ? 'Net collections − (Paid − Refunded on these job orders + Payments − Refunds for earlier job orders)'
      : 'Net collections − (Paid − Refunded on these job orders)',
    isPeriod
      ? `${cellOf.net}-(${netOnOrders}+${cellOf.earlierPaid}-${cellOf.earlierRefunded})`
      : `${cellOf.net}-${netOnOrders}`,
    audit.paymentsBalanced],
    // The discount credits in Operational collected must be exactly the Discounts sheet's rows.
    ['Operational collected − (Net collections + Discount credits on the Discounts sheet)',
      `${cellOf.analyticsCollected}-(${cellOf.net}+Discounts!F${discountsTotalRow})`,
      Math.round((audit.totals.analyticsCollected - audit.totals.netCollections
        - audit.discounts.reduce((sum, row) => sum + row.credit, 0)) * 100) === 0],
  ];
  for (const [label, formula, ok] of checks) {
    rowNumber += 1;
    const row = summary.getRow(rowNumber);
    row.values = [label, { formula, result: 0 }, ''];
    row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    row.getCell(2).numFmt = PESO;
    row.getCell(3).value = { formula: `IF(ROUND(B${rowNumber},2)=0,"OK - balanced","CHECK - does not balance")`, result: ok ? 'OK - balanced' : 'CHECK - does not balance' };
    row.getCell(3).font = { bold: true };
  }

  // Breakdowns with totals that equal the figures above.
  const breakdown = (title: string, groups: AuditGroup[]) => {
    rowNumber += 2;
    summary.getCell(`A${rowNumber}`).value = title;
    summary.getCell(`A${rowNumber}`).font = { bold: true, size: 12 };
    rowNumber += 1;
    // Separate small table: Name | Orders | Billed | Collected | Still to settle | Held across columns A-F.
    summary.getRow(rowNumber).values = ['Name', 'Orders', 'Studio billed', 'Studio revenue', 'Studio still to settle', 'Held, not yet split'];
    summary.getCell(`F${rowNumber}`).note = 'Cash received but not yet counted as Studio or MUA: downpayments on orders that mix Studio and MUA charges (split when fully paid), or charges with no revenue type. The total equals Unallocated cash above.';
    headerRowStyle(summary, rowNumber);
    const first = rowNumber + 1;
    for (const group of groups.filter((item) => item.count || item.billed || item.collected || item.balance || item.held)) {
      rowNumber += 1;
      const row = summary.getRow(rowNumber);
      row.values = [`${group.code} · ${group.name}`, group.count, group.billed, group.collected, group.balance, group.held];
      [3, 4, 5, 6].forEach((column) => { row.getCell(column).numFmt = PESO; });
      row.eachCell((cell) => { cell.border = box; });
    }
    const last = rowNumber;
    rowNumber += 1;
    const total = summary.getRow(rowNumber);
    const listed = groups.filter((item) => item.count || item.billed || item.collected || item.balance || item.held);
    const sumOf = (column: string, result: number) => (last >= first ? { formula: `SUM(${column}${first}:${column}${last})`, result } : 0);
    const add = (value: (group: AuditGroup) => number) => Math.round(listed.reduce((sum, group) => sum + value(group), 0) * 100) / 100;
    total.values = ['TOTAL', sumOf('B', add((g) => g.count)), sumOf('C', add((g) => g.billed)), sumOf('D', add((g) => g.collected)), sumOf('E', add((g) => g.balance)), sumOf('F', add((g) => g.held))];
    [3, 4, 5, 6].forEach((column) => { total.getCell(column).numFmt = PESO; });
    totalRowStyle(summary, rowNumber);
  };
  summary.getColumn(4).width = 16;
  summary.getColumn(5).width = 20;
  summary.getColumn(6).width = 18;
  breakdown('Studio by School / Client', audit.bySchool);
  breakdown('Studio by Package', audit.byPackage);

  rowNumber += 2;
  summary.getCell(`A${rowNumber}`).value = 'Prepared by: ______________________________          Checked by: ______________________________';
  setupPrint(summary, 'Audit Summary', 0);
  summary.pageSetup.orientation = 'portrait';

  return workbook;
}

export async function downloadAuditWorkbook(audit: AuditData, period: AuditPeriod) {
  const now = new Date();
  const bytes = await buildAuditWorkbook(audit, period, now).xlsx.writeBuffer();
  const name = period.since ? period.label.replace(/\s+/g, '') : 'AllTime';
  downloadBlob(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `StudioFlow-Audit-${name}-${fileDate.format(now)}.xlsx`,
  );
}
