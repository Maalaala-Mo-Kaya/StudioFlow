import type { jsPDF } from 'jspdf';
import { discountCents } from '../../utils/revenue';
import type { PaymentRecord, RefundRecord, Registration } from '../../types';
import { STUDIO_INFO } from '../../constants/studio';
import { pb } from '../../db/pocketbase';
import { formatJobOrderNo, formatQueueNumber } from '../../utils/formatters';
import {
  jobOrderAdjustments, lessDiscountLabel, orderDiscountCell, orderExtras, orderMuaExtras, orderPartsLine, receiptRevenueLine,
  isCounted, isComplimentarySettlement, jobOrderMarks, paymentAdditions, paymentDiscount, soldPackagePrice, loadReceiptData, loadRefundSignature, methodLabel, paymentTypeLabel, peso, receiptDate, receiptLabel, refundAcknowledgment, refundFigures, signatureUrl, statusLabel,
  visiblePayments, profileCells, profileLine,
  type ReceiptData, type ReceiptPaper, type RefundSlipData,
} from './receiptData';
import { RECEIPT_HEIGHT_IN } from './PaymentReceiptSheet';

// Vector PDFs that match the printed JobOrderSheet / PaymentReceiptSheet. Units are inches.
// The built-in PDF fonts have no peso sign, so amounts print as "PHP 1,500.00".

type RGB = [number, number, number];
const INK: RGB = [10, 10, 10];
const RED: RGB = [200, 16, 46];
const GREEN: RGB = [15, 107, 58];
const GREY: RGB = [102, 102, 102];
const PT = 1 / 72;

interface TextOptions { size: number; bold?: boolean; italic?: boolean; mono?: boolean; color?: RGB; align?: 'left' | 'right' | 'center'; width?: number }

const php = (amount: number | undefined | null) => 'PHP ' + peso(amount, false);

function put(doc: jsPDF, value: string, x: number, y: number, o: TextOptions) {
  const style = o.bold && o.italic ? 'bolditalic' : o.bold ? 'bold' : o.italic ? 'italic' : 'normal';
  doc.setFont(o.mono ? 'courier' : 'helvetica', style);
  doc.setFontSize(o.size);
  doc.setTextColor(...(o.color ?? INK));
  let text = value;
  if (o.width && doc.getTextWidth(text) > o.width) {
    while (text.length > 1 && doc.getTextWidth(text + '…') > o.width) text = text.slice(0, -1);
    text += '…';
  }
  doc.text(text, x, y, { align: o.align ?? 'left' });
}

/** Outline only: no solid fills, to save ink. */
function box(doc: jsPDF, x: number, y: number, w: number, h: number, line = 0.75) {
  doc.setLineWidth(line * PT);
  doc.setDrawColor(...INK);
  doc.rect(x, y, w, h);
}

function rule(doc: jsPDF, x1: number, y1: number, x2: number, y2: number, width = 0.75, dashed = false) {
  doc.setLineWidth(width * PT);
  doc.setDrawColor(...(dashed ? [150, 150, 150] as RGB : INK));
  doc.setLineDashPattern(dashed ? [0.06, 0.05] : [], 0);
  doc.line(x1, y1, x2, y2);
  doc.setLineDashPattern([], 0);
}

function badge(doc: jsPDF, label: string, x: number, y: number, align: 'right' | 'center') {
  doc.setFont('courier', 'bold');
  doc.setFontSize(6.5);
  const w = doc.getTextWidth(label) + 0.16;
  const left = align === 'right' ? x - w : x - w / 2;
  box(doc, left, y, w, 0.15, 0.6);
  put(doc, label, left + w / 2, y + 0.108, { size: 6.5, bold: true, mono: true, align: 'center' });
}

function signLine(doc: jsPDF, label: string, x: number, y: number, w: number) {
  rule(doc, x, y, x + w, y, 0.6);
  put(doc, label, x + w / 2, y + 0.1, { size: 5.5, bold: true, mono: true, color: GREY, align: 'center' });
}

async function imageData(registration: Registration): Promise<string | null> {
  const url = signatureUrl(registration);
  if (!url) return null;
  if (url.startsWith('data:image')) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawSignature(doc: jsPDF, data: string | null, cx: number, bottom: number) {
  if (!data) {
    put(doc, 'Signed digitally on file', cx, bottom - 0.05, { size: 6, italic: true, color: GREY, align: 'center' });
    return;
  }
  try {
    const props = doc.getImageProperties(data);
    const h = 0.3;
    const w = Math.min(1.6, (props.width / props.height) * h);
    doc.addImage(data, props.fileType, cx - w / 2, bottom - h - 0.02, w, h);
  } catch {
    put(doc, 'Signed digitally on file', cx, bottom - 0.05, { size: 6, italic: true, color: GREY, align: 'center' });
  }
}

function drawJobOrderHalf(doc: jsPDF, data: ReceiptData, copy: 'customer' | 'studio', top: number, cashierName: string, signature: string | null) {
  const { registration: reg, payments } = data;
  const isCustomer = copy === 'customer';
  const complimentary = isComplimentarySettlement(reg);
  const x = 0.32;
  const w = 8.5 - 2 * x;
  const right = x + w;
  let y = top + 0.26;

  // Header
  put(doc, STUDIO_INFO.name.toUpperCase(), x, y + 0.17, { size: 15, bold: true });
  put(doc, STUDIO_INFO.tagline, x, y + 0.3, { size: 7, italic: true, color: [68, 68, 68] });
  put(doc, STUDIO_INFO.address, x, y + 0.41, { size: 6.5, color: [68, 68, 68] });
  put(doc, `${STUDIO_INFO.hours} · Tel. ${STUDIO_INFO.phone}`, x, y + 0.51, { size: 6.5, bold: true, color: [51, 51, 51] });
  badge(doc, complimentary ? 'COMPLIMENTARY SETTLEMENT RECEIPT' : isCustomer ? 'CUSTOMER CLAIM STUB' : 'STUDIO ACCOUNTING COPY', right, y, 'right');
  put(doc, formatJobOrderNo(reg.job_order_no).replace('№', 'No.'), right, y + 0.42, { size: 16, bold: true, mono: true, color: RED, align: 'right' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(16);
  const joWidth = doc.getTextWidth(formatJobOrderNo(reg.job_order_no).replace('№', 'No.'));
  put(doc, 'JOB ORDER', right - joWidth - 0.08, y + 0.4, { size: 6, bold: true, align: 'right' });
  put(doc, `QUEUE ${formatQueueNumber(reg.queue_number)} · ${receiptDate(reg.created)}`, right, y + 0.55, { size: 7, bold: true, mono: true, color: [51, 51, 51], align: 'right' });
  y += 0.62;
  rule(doc, x, y, right, y, 1.5);

  // Client grid
  y += 0.06;
  const col = w / 4;
  const rowH = 0.27;
  const pkg = reg.package_snapshot || reg.expand?.package;
  // Add-ons, then other fees: listed one per line below the client grid (the client shows them at each station).
  const extras = orderExtras(reg);
  const discountCell = orderDiscountCell(reg, false);
  const cells: Array<[string, string, number, boolean?]> = [
    ['CLIENT NAME', `${reg.family_name}, ${reg.given_name}${reg.middle_name ? ' ' + reg.middle_name : ''}`.toUpperCase(), 2, true],
    ['MOBILE', reg.mobile_number || '—', 1],
    ['EMAIL', reg.email || '—', 1],
    ...profileCells(reg).map(([label, value, span]): [string, string, number] => [label.toUpperCase(), value, span]),
    ['PACKAGE', pkg ? `${pkg.code} · ${pkg.name} — ${php(soldPackagePrice(reg))}` : '—', discountCell ? 2 : 4],
    // The discount beside the package (not an item the client bought): amount and reason.
    ...(discountCell ? [[discountCell.label.toUpperCase(), discountCell.value, 2] as [string, string, number]] : []),
  ];
  let cx = x;
  let cy = y;
  for (const [label, value, span, strong] of cells) {
    const cw = col * span;
    box(doc, cx, cy, cw, rowH);
    put(doc, label, cx + 0.06, cy + 0.09, { size: 5, bold: true, mono: true, color: GREY });
    put(doc, value, cx + 0.06, cy + 0.215, { size: strong ? 10 : 8.5, bold: true, width: cw - 0.12 });
    cx += cw;
    if (cx >= right - 0.001) { cx = x; cy += rowH; }
  }
  // Totals box height (worked out first: the add-ons layout depends on the space left under it).
  const cancelled = reg.status === 'cancelled';
  const credit = cancelled ? 0 : discountCents(reg) / 100;
  // The lines above the balance, stacked so none overlap (a discounted order with a refund has five).
  // (Plain "-": the built-in PDF fonts have no minus sign.)
  const totalRows: [string, string, number, RGB?][] = [['ORIGINAL BILLED', php(reg.total_amount + discountCents(reg) / 100), 8]];
  // As on any invoice: original − discount = amount due; payments then come off that.
  if (credit > 0) totalRows.push([lessDiscountLabel(reg).toUpperCase(), '-' + php(credit), 7], ['AMOUNT DUE', php(reg.total_amount), 7]);
  // paid_amount is net of refunds; show the refund on its own line so the figures add up.
  if ((reg.refunded_amount ?? 0) > 0) {
    totalRows.push(['LESS REFUNDS', '-' + php(reg.refunded_amount), 7], ['NET PAID', php(reg.paid_amount), 7, GREEN]);
  } else {
    totalRows.push(['PAYMENTS RECEIVED', php(reg.paid_amount), 8, GREEN]);
  }
  // Two lines keep the original spacing; more are stacked closer, and the box grows if still needed.
  const step = totalRows.length <= 2 ? 0.15 : 0.095;
  const balanceY = 0.15 + (totalRows.length - 1) * step + (totalRows.length <= 2 ? 0.18 : 0.125);
  const grow = Math.max(0, balanceY - 0.48);
  // A cancelled order has one more line (money held by the studio), so its box is taller.
  const extra = (cancelled ? 0.2 : 0) + grow;
  // The payment table beside it: rows, then what changed between payments (so its balance column adds up).
  const { rows, hidden } = visiblePayments(payments);
  const adjustments = jobOrderAdjustments(data, false);
  const tableH = 0.15 + Math.max(1, rows.length) * 0.17 + (hidden > 0 ? 0.11 : 0) + adjustments.length * 0.1 + 0.13;
  // Height of the payments + totals band: the taller of the two.
  const band = Math.max(1.02 + extra, tableH + 0.04);

  // The studio copy sits at the bottom of the page: keep 1 in blank so printer margins never cut the last lines.
  const footerY = top + 5.5 - (isCustomer ? 0.24 : 1.0);
  // The customer copy's terms at a font size: their lines, split into two columns.
  const termsColW = (w - 0.2) / 2;
  const termsAt = (size: number) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    const lines = data.terms.flatMap((clause, index) =>
      (doc.splitTextToSize(`${index + 1}. ${clause}`, termsColW) as string[]).map((text, i) => (i ? '   ' + text : text)));
    return { lines, perColumn: Math.ceil(lines.length / 2), lineH: size * 1.22 * PT };
  };

  // Add-ons: numbered, name and price on every line (never cut off mid-list).
  // MUA charges get their own section below the Studio ones: the studio collects them and pays the MUA team.
  // Many items: the first layout that leaves room for everything below (tighter lines, then three columns).
  const muaExtras = orderMuaExtras(reg);
  const layouts = [
    { cols: 2, lineH: 0.13, size: 8, signGap: 0.34, partsOnTitle: false, gap: 0.2, bare: false },
    { cols: 2, lineH: 0.115, size: 7.5, signGap: 0.32, partsOnTitle: true, gap: 0.2, bare: false },
    // Three columns: prices without "PHP" (the titles say it), so the names keep their room.
    { cols: 3, lineH: 0.115, size: 7, signGap: 0.3, partsOnTitle: true, gap: 0.15, bare: true },
  ];
  type Layout = typeof layouts[number];
  const rowsIn = (count: number, cols: number) => Math.max(1, Math.ceil(count / cols));
  const boxHeight = (l: Layout) => 0.12 + rowsIn(extras.length, l.cols) * l.lineH
    + (muaExtras.length ? 0.14 + rowsIn(muaExtras.length, l.cols) * l.lineH + (l.partsOnTitle ? 0.03 : 0.12) : 0);
  const minimumTerms = isCustomer ? termsAt(5.6) : null;
  // Under the add-ons: payments and totals, sign-offs, then the terms (customer) or one line (studio).
  const fits = (l: Layout) => cy + boxHeight(l) + 0.07 + band + l.signGap + 0.2
    + (minimumTerms ? 0.21 + (minimumTerms.perColumn - 1) * minimumTerms.lineH : 0.2)
    <= footerY - (isCustomer ? 0.14 : 0.1);
  const layout = layouts.find(fits) ?? layouts[layouts.length - 1];
  const addOnsH = boxHeight(layout);
  box(doc, x, cy, w, addOnsH);
  const columnW = (w - 0.12 - layout.gap * (layout.cols - 1)) / layout.cols;
  const amountsIn = layout.bare ? ' · AMOUNTS IN PHP' : '';
  const drawItems = (items: [string, number][], itemsTop: number) => items.forEach(([label, amount], index) => {
    const colX = x + 0.06 + (index % layout.cols) * (columnW + layout.gap);
    const lineY = itemsTop + Math.floor(index / layout.cols) * layout.lineH;
    const price = layout.bare ? peso(amount, false) : php(amount);
    doc.setFont('courier', 'bold');
    doc.setFontSize(layout.size);
    const room = columnW - doc.getTextWidth(price) - 0.08;
    // A long name gets a smaller font before it is ever cut off.
    const name = `${index + 1}. ${label}`;
    let nameSize = layout.size;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(nameSize);
    while (nameSize > 5.6 && doc.getTextWidth(name) > room) doc.setFontSize(nameSize -= 0.2);
    put(doc, name, colX, lineY, { size: nameSize, bold: true, width: room });
    put(doc, price, colX + columnW, lineY, { size: layout.size, bold: true, mono: true, align: 'right' });
  });
  put(doc, `${muaExtras.length ? 'STUDIO ADD-ONS' : 'ADD-ONS'}${extras.length ? ` (${extras.length})` : ''}${amountsIn}`, x + 0.06, cy + 0.09, { size: 5, bold: true, mono: true, color: GREY });
  if (!extras.length) put(doc, 'None', x + 0.06, cy + 0.2, { size: 8.5, bold: true });
  drawItems(extras, cy + 0.2);
  if (muaExtras.length) {
    const my = cy + 0.12 + rowsIn(extras.length, layout.cols) * layout.lineH;
    rule(doc, x + 0.06, my, right - 0.06, my, 0.5, true);
    put(doc, `MUA SERVICES (${muaExtras.length}) · PAID TO THE MUA TEAM${amountsIn}`, x + 0.06, my + 0.09, { size: 5, bold: true, mono: true, color: GREY });
    drawItems(muaExtras, my + 0.2);
    // The Studio / MUA line: under the MUA lines, or on the section's title line when space is short.
    const partsY = layout.partsOnTitle ? my + 0.095 : my + 0.2 + (rowsIn(muaExtras.length, layout.cols) - 1) * layout.lineH + 0.12;
    put(doc, orderPartsLine(reg, false), right - 0.06, partsY, { size: 6.5, bold: true, mono: true, align: 'right' });
  }
  y = cy + addOnsH + 0.07;

  // Payment table
  const totalsW = 2.05;
  const tableW = w - totalsW - 0.08;
  const columns: Array<[string, number, 'left' | 'right']> = isCustomer
    ? [['DATE', 0.85, 'left'], ['RECEIPT NO.', 0.95, 'left'], ['PAYMENT', 1.3, 'left'], ['METHOD', 0.75, 'left'], ['AMOUNT', 0.95, 'right'], ['BALANCE', 0, 'right']]
    : [['DATE', 0.8, 'left'], ['RECEIPT NO.', 0.85, 'left'], ['PAYMENT', 1.2, 'left'], ['METHOD', 0.55, 'left'], ['CASHIER / REF', 0.85, 'left'], ['AMOUNT', 0.75, 'right'], ['BALANCE', 0, 'right']];
  const fixed = columns.reduce((sum, [, cw]) => sum + cw, 0);
  columns[columns.length - 1][1] = tableW - fixed;
  rule(doc, x, y + 0.15, x + tableW, y + 0.15, 1.5);
  let tx = x;
  for (const [label, cw, align] of columns) {
    put(doc, label, align === 'right' ? tx + cw - 0.05 : tx + 0.05, y + 0.105, { size: 5.5, bold: true, mono: true, color: [51, 51, 51], align });
    tx += cw;
  }
  let ty = y + 0.15;
  if (!rows.length) {
    box(doc, x, ty, tableW, 0.17);
    put(doc, complimentary ? 'Settled with discount credit' : 'No payment recorded yet', x + tableW / 2, ty + 0.115, { size: 6.5, italic: true, color: GREY, align: 'center' });
    ty += 0.17;
  }
  for (const payment of rows) {
    const status = statusLabel(payment);
    const values = [
      receiptDate(payment.created), receiptLabel(payment), paymentTypeLabel(payment) + (status ? ` (${status})` : ''),
      methodLabel(payment.payment_method),
      ...(isCustomer ? [] : [[payment.cashier_name, payment.remarks].filter(Boolean).join(' · ') || '—']),
      php(payment.amount), php(payment.balance_after),
    ];
    tx = x;
    columns.forEach(([, cw, align], index) => {
      box(doc, tx, ty, cw, 0.17);
      put(doc, values[index], align === 'right' ? tx + cw - 0.05 : tx + 0.05, ty + 0.115, {
        size: 7.5, bold: index === 1 || align === 'right', mono: index === 1 || align === 'right',
        color: status ? GREY : INK, align, width: cw - 0.1,
      });
      tx += cw;
    });
    if (status) rule(doc, x + 0.03, ty + 0.085, x + tableW - 0.03, ty + 0.085, 0.5);
    ty += 0.17;
  }
  if (hidden > 0) {
    put(doc, `+ ${hidden} more payment${hidden === 1 ? '' : 's'} on file (older or voided)`, x + 0.05, ty + 0.11, { size: 6, italic: true, color: GREY });
    ty += 0.11;
  }
  for (const note of adjustments) {
    put(doc, note, x + 0.05, ty + 0.1, { size: 5.8, bold: true, color: [51, 51, 51], width: tableW - 0.1 });
    ty += 0.1;
  }
  // Studio / MUA split: under the payment table (it used to sit on the Add-ons box's bottom border).
  put(doc, receiptRevenueLine(data, undefined, false), x + 0.05, ty + 0.11, { size: 5.5, color: GREY, width: tableW - 0.1 });

  // Totals
  const bx = right - totalsW;
  const settled = reg.balance <= 0 && reg.paid_amount + credit > 0;
  box(doc, bx, y, totalsW, 0.92 + extra, 1.5);
  const line = (label: string, value: string, ly: number, size: number, color: RGB = INK) => {
    put(doc, label, bx + 0.07, ly, { size: 5.5, bold: true, color: [85, 85, 85] });
    put(doc, value, right - 0.07, ly, { size, bold: true, mono: true, color, align: 'right' });
  };
  totalRows.forEach(([label, value, size, color], i) => line(label, value, y + 0.15 + i * step, size, color));
  line('BALANCE', php(reg.balance), y + balanceY, 10, reg.balance > 0 ? RED : INK);
  // A cancelled order owes nothing; show what the studio still holds (refundable up to this).
  if (cancelled) {
    put(doc, '(cancelled, not owed)', bx + 0.07, y + 0.555 + grow, { size: 5.5, italic: true, color: GREY });
    line('HELD BY STUDIO', php(Math.max(0, reg.paid_amount)), y + 0.665 + grow, 8);
  }
  const marks = jobOrderMarks(reg);
  box(doc, bx + 0.07, y + 0.54 + extra, totalsW - 0.14, 0.16, settled || marks.settlement ? 1.5 : 0.75);
  put(doc, (marks.settlement ?? (settled ? 'FULLY SETTLED' : reg.paid_amount + credit > 0 ? 'PARTIAL' : 'UNPAID')).toUpperCase(), bx + totalsW / 2, y + 0.655 + extra, {
    size: 7.5, bold: true, align: 'center',
  });
  const latest = [...payments].reverse().find(isCounted);
  const refundNumbers = data.refunds.map((refund) => refund.refund_no).filter(Boolean);
  if (refundNumbers.length) {
    put(doc, `Refunds: ${refundNumbers.join(', ')}`, bx + 0.07, y + 0.83 + extra, { size: 5.5, bold: true, color: [68, 68, 68], width: totalsW - 0.14 });
  } else if (latest?.payment_method === 'cash' && (latest.cash_tendered ?? 0) > 0) {
    put(doc, `${receiptLabel(latest)}: cash ${php(latest.cash_tendered)} · change ${php(latest.change_amount)}`, bx + 0.07, y + 0.83 + extra, {
      size: 5.5, color: [68, 68, 68], width: totalsW - 0.14,
    });
  }

  // Sign-offs
  y += band;
  const signs = isCustomer ? 2 : 3;
  const gap = 0.3;
  const sw = (w - gap * (signs - 1)) / signs;
  const lineY = y + layout.signGap;
  put(doc, (reg.prepared_by || cashierName).toUpperCase(), x + sw / 2, lineY - 0.05, { size: 8, bold: true, mono: true, align: 'center', width: sw });
  signLine(doc, "PREPARED BY", x, lineY, sw);
  drawSignature(doc, signature, x + sw + gap + sw / 2, lineY);
  signLine(doc, "CUSTOMER'S SIGNATURE", x + sw + gap, lineY, sw);
  if (!isCustomer) {
    const claimed = reg.claimed_by ? `${reg.claimed_by}${reg.released_at ? ' · ' + receiptDate(reg.released_at) : ''}`.toUpperCase() : '';
    put(doc, claimed, x + 2 * (sw + gap) + sw / 2, lineY - 0.05, { size: 7, bold: true, mono: true, align: 'center', width: sw });
    signLine(doc, 'CLAIMED BY / DATE', x + 2 * (sw + gap), lineY, sw);
  }

  // Terms
  y = lineY + 0.2;
  rule(doc, x, y, right, y, 1.5);
  if (isCustomer) {
    put(doc, 'TERMS & CONDITIONS', x, y + 0.11, { size: 6, bold: true, mono: true });
    // Still short of space: shrink the terms until the last line clears the footer rule.
    const firstY = y + 0.21;
    const lastY = footerY - 0.14;
    let size = 6.2;
    let terms = termsAt(size);
    while (size > 4.4 && firstY + (terms.perColumn - 1) * terms.lineH > lastY) terms = termsAt(size -= 0.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(34, 34, 34);
    terms.lines.forEach((text, index) => {
      const column = index < terms.perColumn ? 0 : 1;
      doc.text(text, x + column * (termsColW + 0.2), firstY + (index % terms.perColumn) * terms.lineH);
    });
    rule(doc, x, footerY - 0.1, right, footerY - 0.1, 0.4);
    put(doc, 'DO NOT LOSE THIS CLAIM STUB — present it to claim your pictures.', x, footerY, { size: 6, bold: true, mono: true });
    put(doc, `Inquiries: ${STUDIO_INFO.phone} · ${STUDIO_INFO.facebook}`, right, footerY, { size: 6, bold: true, mono: true, align: 'right' });
  } else {
    put(doc, 'The client agreed to the Terms & Conditions printed on the customer claim stub, as shown by the signature above.', x, y + 0.14, { size: 7, bold: true });
    // A very full order may use part of the blank bottom inch, never the last 0.4 in.
    const studioFooterY = Math.min(top + 5.1, Math.max(footerY, y + 0.34));
    rule(doc, x, studioFooterY - 0.1, right, studioFooterY - 0.1, 0.4);
    put(doc, `File with job order ${formatJobOrderNo(reg.job_order_no).replace('№', 'No.')}`, x, studioFooterY, { size: 6, bold: true, mono: true });
    put(doc, `Record ID ${reg.id}`, right, studioFooterY, { size: 6, bold: true, mono: true, align: 'right' });
  }

  // CANCELLED / REFUNDED stamp across the half, like VOIDED on a receipt.
  if (marks.stamp) {
    doc.saveGraphicsState();
    if (pdf) doc.setGState(new pdf.GState({ opacity: 0.25 }));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(40);
    doc.setTextColor(...RED);
    const width = doc.getTextWidth(marks.stamp);
    const angle = 18 * Math.PI / 180;
    // Centre the rotated text on the half sheet.
    const cx = 4.25 - (width / 2) * Math.cos(angle);
    const cy = top + 2.75 + (width / 2) * Math.sin(angle);
    doc.text(marks.stamp, cx, cy, { angle: 18 });
    doc.restoreGraphicsState();
  }
}

/** Compact receipt: 4.25 × 4.25 in, matching PaymentReceiptSheet. */
function drawReceiptSlip(doc: jsPDF, data: ReceiptData, payment: PaymentRecord, copy: 'customer' | 'studio', left: number) {
  const reg = data.registration;
  const isCustomer = copy === 'customer';
  const H = RECEIPT_HEIGHT_IN;
  const x = left + 0.26;
  const w = 4.25 - 0.52;
  const right = x + w;
  const mid = x + w / 2;
  let y = 0.2;
  const status = statusLabel(payment);
  const after = payment.balance_after ?? 0;

  // Header: studio name left, copy label right.
  put(doc, STUDIO_INFO.name.toUpperCase(), x, y + 0.14, { size: 11.5, bold: true });
  put(doc, `${STUDIO_INFO.shortAddress} · Tel. ${STUDIO_INFO.phone}`, x, y + 0.26, { size: 5.5, color: [68, 68, 68], width: w - 1.05 });
  box(doc, right - 1.0, y + 0.02, 1.0, 0.25, 0.6);
  put(doc, 'OFFICIAL RECEIPT', right - 0.5, y + 0.12, { size: 5.5, bold: true, mono: true, align: 'center' });
  put(doc, isCustomer ? 'CUSTOMER COPY' : 'STUDIO COPY', right - 0.5, y + 0.22, { size: 5.5, bold: true, mono: true, align: 'center' });
  y += 0.31;
  rule(doc, x, y, right, y, 1.5);

  y += 0.1;
  put(doc, 'RECEIPT NO.', x, y, { size: 5, bold: true, mono: true, color: GREY });
  put(doc, receiptLabel(payment), x, y + 0.17, { size: 12, bold: true, mono: true, color: RED });
  put(doc, receiptDate(payment.created, true), right, y + 0.15, { size: 6.5, bold: true, mono: true, align: 'right' });

  y += 0.24;
  box(doc, x, y, w, 0.44);
  put(doc, `JOB ORDER ${formatJobOrderNo(reg.job_order_no).replace('№', 'No.')}`, x + 0.06, y + 0.11, { size: 6.5, bold: true, mono: true });
  put(doc, `QUEUE ${formatQueueNumber(reg.queue_number)}`, right - 0.06, y + 0.11, { size: 6.5, bold: true, mono: true, align: 'right' });
  put(doc, `${reg.family_name}, ${reg.given_name}${reg.middle_name ? ' ' + reg.middle_name[0] + '.' : ''}`.toUpperCase(), x + 0.06, y + 0.26, { size: 9, bold: true, width: w - 0.12 });
  put(doc, profileLine(reg), x + 0.06, y + 0.37, {
    size: 5.8, color: [68, 68, 68], width: w - 0.12,
  });

  const row = (label: string, value: string, ry: number, size = 7.5, color: RGB = INK) => {
    put(doc, label, x, ry, { size: 5.5, bold: true, mono: true, color: [85, 85, 85] });
    put(doc, value, right, ry, { size, bold: true, mono: true, color, align: 'right', width: w - 1.25 });
  };
  y += 0.58;
  row('PAYMENT FOR', paymentTypeLabel(payment), y);
  // Items added since the previous payment (at most two lines, as on the printed sheet).
  const additions = paymentAdditions(data, payment, false);
  if (additions.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const lines: string[] = doc.splitTextToSize(`Added · ${additions.join(', ')}`, w);
    if (lines.length > 2) lines.splice(2, lines.length, lines[1].replace(/.{0,3}$/, '…'));
    for (const line of lines) put(doc, line, x, y += 6 * PT + 0.01, { size: 6, color: GREY });
  }
  row('METHOD', methodLabel(payment.payment_method) + (payment.remarks ? ` · ${payment.remarks}` : ''), y += 0.14);
  // Only the discount given with this payment (later receipts don't repeat it). The saved balance before
  // the payment already has it taken off, so show the balance before the discount: previous − discount − paid = balance.
  const discount = paymentDiscount(payment, data.payments);
  row('PREVIOUS BALANCE', php((payment.balance_before ?? 0) + (discount?.amount ?? 0)), y += 0.14);
  if (discount) {
    row(discount.amount > 0 ? `LESS DISCOUNT (${discount.rate.toUpperCase()})` : 'DISCOUNT REDUCED',
      discount.amount > 0 ? '-' + php(discount.amount) : '+' + php(-discount.amount), y += 0.13);
    doc.setFont('helvetica', 'normal');
    const reason = `Reason · ${discount.reason}`;
    let size = 6;
    doc.setFontSize(size);
    let lines: string[] = doc.splitTextToSize(reason, w);
    while (lines.length * (size * PT + 0.01) > 0.38 && size > 3.5) {
      doc.setFontSize(size -= 0.5);
      lines = doc.splitTextToSize(reason, w);
    }
    for (const line of lines) put(doc, line, x, y += size * PT + 0.01, { size, color: GREY });
  }

  y += 0.07;
  rule(doc, x, y, right, y, 1.5);
  put(doc, 'AMOUNT PAID', x, y + 0.17, { size: 7, bold: true, mono: true });
  put(doc, php(payment.amount), right, y + 0.19, { size: 12, bold: true, mono: true, align: 'right' });
  y += 0.26;
  rule(doc, x, y, right, y, 1.5);

  y += 0.13;
  if (payment.payment_method === 'cash' && (payment.cash_tendered ?? 0) > 0) {
    row('CASH / CHANGE', `${php(payment.cash_tendered)} / ${php(payment.change_amount)}`, y);
    y += 0.15;
  }
  row('BALANCE AT ISSUE', php(after), y, 9, after > 0 ? RED : INK);

  y += 0.08;
  box(doc, x, y, w, 0.17, after <= 0 ? 2 : 1);
  put(doc, after <= 0 ? 'FULLY SETTLED' : 'BALANCE DUE BEFORE RELEASE', mid, y + 0.118, { size: 7.5, bold: true, align: 'center' });
  const parts = orderPartsLine(reg, false);
  if (parts) {
    // Orders with MUA charges: both copies show the Studio / MUA parts of the order and of this payment.
    put(doc, `Job order: ${parts}`, x, y + 0.28, { size: 5.5, bold: true, width: w });
    // How this payment was booked: for the studio's records only.
    if (!isCustomer && !status && y + 0.38 < H - 0.5) {
      put(doc, `This payment: ${receiptRevenueLine(data, payment, false)}`, x, y + 0.38, { size: 5.5, color: GREY, width: w });
    }
  } else if (!isCustomer && !status) {
    put(doc, `Allocation movement: ${receiptRevenueLine(data, payment, false)}`, x, y + 0.28, { size: 5.5, color: GREY, width: w });
  }

  const lineY = H - 0.36;
  if (isCustomer) {
    put(doc, (payment.cashier_name || '').toUpperCase(), mid, lineY - 0.04, { size: 7, bold: true, mono: true, align: 'center', width: w });
    signLine(doc, 'RECEIVED BY (CASHIER)', x, lineY, w);
  } else {
    const sw = (w - 0.25) / 2;
    put(doc, (payment.cashier_name || '').toUpperCase(), x + sw / 2, lineY - 0.04, { size: 6.5, bold: true, mono: true, align: 'center', width: sw });
    signLine(doc, 'RECEIVED BY (CASHIER)', x, lineY, sw);
    signLine(doc, "CUSTOMER'S SIGNATURE", x + sw + 0.25, lineY, sw);
  }
  put(doc, isCustomer ? 'Keep this receipt with your Job Order claim stub.' : `File with job order ${formatJobOrderNo(reg.job_order_no).replace('№', 'No.')}.`,
    mid, H - 0.14, { size: 5.5, bold: true, mono: true, align: 'center' });

  if (status) {
    doc.saveGraphicsState();
    if (pdf) doc.setGState(new pdf.GState({ opacity: 0.3 }));
    put(doc, status, mid, H / 2 + 0.2, { size: 38, bold: true, color: RED, align: 'center' });
    doc.restoreGraphicsState();
  }
}

/** Refund slip half (4.25 in wide), matching RefundSlipSheet. */
function drawRefundSlip(doc: jsPDF, data: RefundSlipData, refund: RefundRecord, copy: 'customer' | 'studio', left: number, signature: string | null, top = 0) {
  const reg = data.registration;
  const isCustomer = copy === 'customer';
  const H = top + RECEIPT_HEIGHT_IN; // bottom of this strip
  const x = left + 0.26;
  const w = 4.25 - 0.52;
  const right = x + w;
  const mid = x + w / 2;
  const figures = refundFigures(data, refund);
  let y = top + 0.2;

  put(doc, STUDIO_INFO.name.toUpperCase(), x, y + 0.14, { size: 11.5, bold: true });
  put(doc, `${STUDIO_INFO.shortAddress} · Tel. ${STUDIO_INFO.phone}`, x, y + 0.26, { size: 5.5, color: [68, 68, 68], width: w - 1.05 });
  box(doc, right - 1.0, y + 0.02, 1.0, 0.25, 0.6);
  put(doc, 'REFUND SLIP', right - 0.5, y + 0.12, { size: 5.5, bold: true, mono: true, align: 'center' });
  put(doc, isCustomer ? 'CUSTOMER COPY' : 'STUDIO COPY', right - 0.5, y + 0.22, { size: 5.5, bold: true, mono: true, align: 'center' });
  y += 0.31;
  rule(doc, x, y, right, y, 1.5);

  y += 0.1;
  put(doc, 'REFUND NO.', x, y, { size: 5, bold: true, mono: true, color: GREY });
  put(doc, refund.refund_no, x, y + 0.17, { size: 12, bold: true, mono: true, color: RED });
  put(doc, receiptDate(refund.created, true), right, y + 0.15, { size: 6.5, bold: true, mono: true, align: 'right' });

  y += 0.24;
  box(doc, x, y, w, 0.44);
  put(doc, `JOB ORDER ${formatJobOrderNo(reg.job_order_no).replace('№', 'No.')}`, x + 0.06, y + 0.11, { size: 6.5, bold: true, mono: true });
  put(doc, `${reg.family_name}, ${reg.given_name}${reg.middle_name ? ' ' + reg.middle_name[0] + '.' : ''}`.toUpperCase(), x + 0.06, y + 0.26, { size: 9, bold: true, width: w - 0.12 });
  put(doc, profileLine(reg), x + 0.06, y + 0.37, { size: 5.8, color: [68, 68, 68], width: w - 0.12 });

  const row = (label: string, value: string, ry: number, size = 7.5) => {
    put(doc, label, x, ry, { size: 5.5, bold: true, mono: true, color: [85, 85, 85] });
    put(doc, value, right, ry, { size, bold: true, mono: true, align: 'right', width: w - 1.3 });
  };
  y += 0.57;
  row('REASON', refund.reason, y);
  row('RECEIPTS', figures.receipts.join(', ') || '-', y += 0.14);
  row('HELD BEFORE REFUND', php(figures.heldBefore), y += 0.14);

  y += 0.07;
  rule(doc, x, y, right, y, 1.5);
  put(doc, `AMOUNT REFUNDED · ${methodLabel(refund.method).toUpperCase()}`, x, y + 0.17, { size: 6.5, bold: true, mono: true });
  put(doc, php(refund.amount), right, y + 0.19, { size: 12, bold: true, mono: true, align: 'right' });
  y += 0.26;
  rule(doc, x, y, right, y, 1.5);
  row('STILL HELD BY STUDIO', php(figures.heldAfter), y += 0.14, 9);

  y += 0.07;
  doc.setFont('helvetica', isCustomer ? 'normal' : 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(34, 34, 34);
  const text = isCustomer
    ? 'The money above was given back to you. Your official receipts stay on file; this slip shows the amount returned.'
    : refundAcknowledgment(data, refund, false);
  const lines = doc.splitTextToSize(text, w - 0.1) as string[];
  const lineH = 6.5 * 1.25 * PT;
  if (!isCustomer) box(doc, x, y, w, lines.length * lineH + 0.07, 0.75);
  lines.forEach((line, index) => doc.text(line, x + 0.05, y + 0.1 + index * lineH));

  const lineY = H - 0.36;
  if (isCustomer) {
    put(doc, (refund.refunded_by || '').toUpperCase(), mid, lineY - 0.04, { size: 7, bold: true, mono: true, align: 'center', width: w });
    signLine(doc, 'RELEASED BY (STUDIO)', x, lineY, w);
  } else {
    const sw = (w - 0.25) / 2;
    put(doc, (refund.refunded_by || '').toUpperCase(), x + sw / 2, lineY - 0.04, { size: 6.5, bold: true, mono: true, align: 'center', width: sw });
    signLine(doc, 'RELEASED BY (STUDIO)', x, lineY, sw);
    if (signature) drawSignature(doc, signature, x + sw + 0.25 + sw / 2, lineY);
    signLine(doc, signature && refund.signed_at ? `SIGNED ON SCREEN · ${receiptDate(refund.signed_at).toUpperCase()}` : 'RECEIVED BY · CLIENT SIGNATURE / DATE',
      x + sw + 0.25, lineY, sw);
  }
  put(doc, isCustomer ? 'Keep this slip with your receipts.' : `Client signs. File with job order ${formatJobOrderNo(reg.job_order_no).replace('№', 'No.')}.`,
    mid, H - 0.14, { size: 5.5, bold: true, mono: true, align: 'center' });
}

let pdf: typeof import('jspdf') | null = null;

async function newDoc(format: [number, number]) {
  pdf ??= await import('jspdf');
  return new pdf.jsPDF({ orientation: format[0] > format[1] ? 'landscape' : 'portrait', unit: 'in', format });
}

/**
 * Letter sheet: customer claim stub (top) and studio copy (bottom).
 * With `withRefundSlips`, every refund slip follows on letter pages, 3 strips per page, with saved signatures.
 */
export async function downloadJobOrderPdf(data: ReceiptData, cashierName: string, withRefundSlips = false) {
  const doc = await buildJobOrderPdf(data, cashierName, withRefundSlips);
  const suffix = withRefundSlips && data.refunds.length ? '_with_refund_slips' : '';
  doc.save(`JobOrder_${data.registration.job_order_no || data.registration.id}${suffix}.pdf`);
}

async function buildJobOrderPdf(data: ReceiptData, cashierName: string, withRefundSlips = false) {
  const doc = await newDoc([8.5, 11]);
  const signature = await imageData(data.registration);
  drawJobOrderHalf(doc, data, 'customer', 0, cashierName, signature);
  rule(doc, 0.2, 5.5, 8.3, 5.5, 0.6, true);
  put(doc, '- - cut here - -', 4.25, 5.47, { size: 5.5, mono: true, color: [140, 140, 140], align: 'center' });
  drawJobOrderHalf(doc, data, 'studio', 5.5, cashierName, signature);
  const slips = withRefundSlips ? data.refunds : [];
  const signatures = await Promise.all(slips.map(loadRefundSignature));
  slips.forEach((refund, index) => {
    const slot = index % 3;
    if (slot === 0) doc.addPage([8.5, 11], 'portrait');
    const top = slot * RECEIPT_HEIGHT_IN;
    drawRefundSlip(doc, data, refund, 'customer', 0, null, top);
    rule(doc, 4.25, top + 0.15, 4.25, top + RECEIPT_HEIGHT_IN - 0.1, 0.6, true);
    drawRefundSlip(doc, data, refund, 'studio', 4.25, signatures[index], top);
    if (slot < 2 && index < slips.length - 1) rule(doc, 0.2, top + RECEIPT_HEIGHT_IN, 8.3, top + RECEIPT_HEIGHT_IN, 0.6, true);
  });
  return doc;
}

/** Receipt strip (8.5 × 4.25 in): customer copy (left) and studio copy (right), on a letter sheet or a leftover piece. */
export async function downloadReceiptPdf(data: ReceiptData, payment: PaymentRecord, paper: ReceiptPaper = 'letter') {
  const doc = await buildReceiptPdf(data, payment, paper);
  doc.save(`Receipt_${receiptLabel(payment)}_JO${data.registration.job_order_no || data.registration.id}.pdf`);
}

async function buildReceiptPdf(data: ReceiptData, payment: PaymentRecord, paper: ReceiptPaper) {
  const doc = await newDoc(paper === 'letter' ? [8.5, 11] : [8.5, 5.5]);
  drawReceiptSlip(doc, data, payment, 'customer', 0);
  rule(doc, 4.25, 0.15, 4.25, RECEIPT_HEIGHT_IN - 0.1, 0.6, true);
  drawReceiptSlip(doc, data, payment, 'studio', 4.25);
  if (paper === 'letter') {
    // Receipt on the top 4.25 in only; the rest of the sheet is cut off and reused.
    rule(doc, 0.2, RECEIPT_HEIGHT_IN, 8.3, RECEIPT_HEIGHT_IN, 0.6, true);
    put(doc, '- - cut here: keep the rest of the sheet for the next receipts - -', 4.25, RECEIPT_HEIGHT_IN - 0.03, { size: 5.5, mono: true, color: [140, 140, 140], align: 'center' });
  }
  return doc;
}

/** Refund slip strip: customer copy (left) and studio copy for the client to sign (right). */
export async function downloadRefundSlipPdf(data: RefundSlipData, refund: RefundRecord, paper: ReceiptPaper = 'letter', signature: string | null = null) {
  const doc = await buildRefundSlipPdf(data, refund, paper, signature);
  doc.save(`RefundSlip_${refund.refund_no}_JO${data.registration.job_order_no || data.registration.id}.pdf`);
}

async function buildRefundSlipPdf(data: RefundSlipData, refund: RefundRecord, paper: ReceiptPaper, signature: string | null) {
  const doc = await newDoc(paper === 'letter' ? [8.5, 11] : [8.5, 5.5]);
  drawRefundSlip(doc, data, refund, 'customer', 0, null);
  rule(doc, 4.25, 0.15, 4.25, RECEIPT_HEIGHT_IN - 0.1, 0.6, true);
  drawRefundSlip(doc, data, refund, 'studio', 4.25, signature);
  if (paper === 'letter') {
    rule(doc, 0.2, RECEIPT_HEIGHT_IN, 8.3, RECEIPT_HEIGHT_IN, 0.6, true);
    put(doc, '- - cut here: keep the rest of the sheet for the next receipts - -', 4.25, RECEIPT_HEIGHT_IN - 0.03, { size: 5.5, mono: true, color: [140, 140, 140], align: 'center' });
  }
  return doc;
}

/** Admin directory shortcut: the job order sheet, followed by its refund slips when money was given back. */
export async function downloadJobOrderPdfFor(registration: Registration, cashierName = 'Cashier Staff') {
  await downloadJobOrderPdf(await loadReceiptData(registration.id), cashierName, true);
}

/**
 * Saves PDF copies of a job order's paperwork into the client's folder (<folder>\RECEIPTS on the
 * photo drive): JO-<no>.pdf, one OR-….pdf per payment and one RF-….pdf per refund, all redrawn
 * from the current records (voided receipts and cancel / refund stamps included).
 * Returns false when there is nothing to save yet (no payment or complimentary settlement).
 * The database stays the official record; these copies are for staff browsing the drive.
 */
export async function saveClientDocuments(registrationId: string): Promise<boolean> {
  const data = await loadReceiptData(registrationId);
  const reg = data.registration;
  if (!reg.job_order_no || (!data.payments.length && !isComplimentarySettlement(reg))) return false;
  const files: Array<[name: string, doc: jsPDF]> = [
    [`JO-${reg.job_order_no}.pdf`, await buildJobOrderPdf(data, reg.prepared_by || 'Cashier Staff')],
  ];
  for (const payment of data.payments) {
    if (payment.receipt_no) files.push([`${payment.receipt_no}.pdf`, await buildReceiptPdf(data, payment, 'half')]);
  }
  for (const refund of data.refunds) {
    if (refund.refund_no) files.push([`${refund.refund_no}.pdf`, await buildRefundSlipPdf(data, refund, 'half', await loadRefundSignature(refund))]);
  }
  const form = new FormData();
  for (const [name, doc] of files) form.append('files', doc.output('blob'), name);
  try {
    await pb.send(`/api/studioflow/registrations/${registrationId}/documents`, { method: 'POST', body: form, requestKey: null });
  } catch (error) {
    // 409: no folder yet (a job order paid before folders were made at payment always has one).
    if ((error as { status?: number })?.status === 409) return false;
    throw error;
  }
  return true;
}
