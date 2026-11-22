import { pb } from '../../db/pocketbase';
import { PAYMENT_METHOD_OPTIONS, RECEIPT_TERMS_CLAUSES, STUDIO_INFO } from '../../constants/studio';
import { formatJobOrderNo } from '../../utils/formatters';
import { getRegistrationAddOns, sumAddOnAmounts } from '../../utils/registrationAddOns';
import type { PaymentRecord, RefundRecord, Registration, StudioSettings } from '../../types';
import { eventDateLabel, isWalkIn } from '../../utils/clientInfo';
import { discountCents, revenueMovements, revenueTerms } from '../../utils/revenue';

export interface ReceiptData {
  registration: Registration;
  /** Every payment on the job order, oldest first (voided and refunded included). */
  payments: PaymentRecord[];
  /** Terms printed on the customer claim stub (walk-in clients have their own). */
  terms: readonly string[];
  /** Every refund on the job order, oldest first. */
  refunds: RefundRecord[];
}

/**
 * The mark on a job order once money was given back or the order was cancelled:
 * a stamp across the sheet (like VOIDED on a receipt) and the settlement label in the totals box.
 * A partial refund (e.g. an overpayment given back) leaves the order valid: no stamp.
 */
export function isComplimentarySettlement(reg: Registration): boolean {
  return reg.status !== 'cancelled' && reg.total_amount === 0 && reg.paid_amount === 0
    && reg.balance === 0 && discountCents(reg) > 0;
}

export function jobOrderMarks(reg: Registration): { stamp: string; settlement: string | null } {
  const refunded = (reg.refunded_amount ?? 0) > 0;
  const fullyRefunded = refunded && (reg.paid_amount ?? 0) <= 0;
  if (reg.status === 'cancelled') {
    return { stamp: fullyRefunded ? 'CANCELLED · REFUNDED' : 'CANCELLED', settlement: fullyRefunded ? 'Cancelled · Refunded' : 'Cancelled' };
  }
  if (isComplimentarySettlement(reg)) return { stamp: '', settlement: 'Complimentary Settlement' };
  return fullyRefunded ? { stamp: 'REFUNDED', settlement: 'Refunded' } : { stamp: '', settlement: null };
}

export type PrintMode = 'joborder' | 'receipt';

/**
 * Paper for a payment receipt. `letter`: a full letter sheet, printed on the top half only;
 * the blank bottom half is cut off and kept. `half`: one of those kept half sheets (8.5 × 5.5 in).
 */
export type ReceiptPaper = 'letter' | 'half';

export async function loadReceiptData(registrationId: string): Promise<ReceiptData> {
  const [registration, payments, refunds] = await Promise.all([
    pb.collection('registrations').getOne<Registration>(registrationId, {
      expand: 'organization,level,course,package,session_type', requestKey: null, cache: 'no-store',
    }),
    pb.collection('payments').getFullList<PaymentRecord>({
      filter: pb.filter('registration = {:id}', { id: registrationId }),
      sort: 'created,id', requestKey: null, cache: 'no-store',
    }),
    pb.collection('refunds').getFullList<RefundRecord>({
      filter: pb.filter('registration = {:id}', { id: registrationId }),
      sort: 'created,id', requestKey: null, cache: 'no-store',
    }).catch(() => [] as RefundRecord[]),
  ]);
  let terms: readonly string[] = RECEIPT_TERMS_CLAUSES;
  if (isWalkIn(registration)) {
    const settings = await pb.collection('studio_settings')
      .getFirstListItem<StudioSettings>("key = 'main'", { requestKey: null, cache: 'no-store' }).catch(() => null);
    if (settings?.walkin_terms?.length) terms = settings.walkin_terms;
  }
  return { registration, payments, terms, refunds };
}

/**
 * The client-details row on the job order (4 columns): school / department / course acronym,
 * or for walk-ins: session / organization / event date / venue.
 */
export function profileCells(reg: Registration): Array<[label: string, value: string, span: 1 | 2]> {
  if (isWalkIn(reg)) {
    const onLocation = Boolean(reg.event_venue || reg.event_date);
    return [
      ['Session', reg.expand?.session_type?.name || '—', 1],
      ['Organization / Company', reg.client_org || '—', 1],
      ['Event Date', onLocation ? eventDateLabel(reg) || '—' : 'In studio', 1],
      ['Venue', reg.event_venue || 'Studio', 1],
    ];
  }
  const course = reg.expand?.course?.code || reg.expand?.course?.name || reg.course || '—';
  return [
    ['School / Organization', reg.expand?.organization?.name || '—', 2],
    ['Department', reg.department || reg.expand?.level?.name || '—', 1],
    ['Course / Section', course + (reg.section ? ' · ' + reg.section : ''), 1],
  ];
}

/** One line under the client name on a receipt. */
export function profileLine(reg: Registration): string {
  if (isWalkIn(reg)) {
    return [reg.expand?.session_type?.name, eventDateLabel(reg), reg.event_venue || reg.client_org].filter(Boolean).join(' · ') || 'Walk-in';
  }
  return [reg.expand?.organization?.name, reg.expand?.course?.code || reg.expand?.course?.name || reg.course]
    .filter(Boolean).join(' · ') || '—';
}

/**
 * The package price this job order was sold at. The server prices a job order as
 * package + add-ons + other fees, so this stays right after the catalog price changes
 * (the package record itself only knows today's price).
 */
export function soldPackagePrice(reg: Registration): number {
  const cents = (value: number | undefined) => Math.round((value || 0) * 100);
  return (cents(reg.total_amount) + discountCents(reg) - Math.round(sumAddOnAmounts(getRegistrationAddOns(reg.add_ons)) * 100) - cents(reg.other_fees)) / 100;
}

export function orderExtras(reg: Registration): [string, number][] {
  const addOns = getRegistrationAddOns(reg.add_ons);
  const credit = discountCents(reg) / 100;
  const percentage = reg.revenue_discount?.percentage ?? (credit ? credit * 100 / (reg.total_amount + credit) : 0);
  return [
    ...addOns.map((item): [string, number] => [item.name + (item.revenue_category === 'mua' ? ' (MUA)' : ''), item.amount]),
    ...(reg.other_fees ? [['Other fees', reg.other_fees] as [string, number]] : []),
    ...(credit && reg.status !== 'cancelled' ? [[`Discount credit (${Number(percentage.toFixed(2))}%) · ${reg.revenue_discount?.reason}`, -credit] as [string, number]] : []),
  ];
}

export function paymentDiscount(payment: PaymentRecord) {
  const snapshot = payment.discount_snapshot;
  if (!snapshot) return null;
  const amount = (snapshot.studio + snapshot.mua) / 100;
  if (!amount) return null;
  return { amount, percentage: snapshot.percentage, reason: snapshot.reason };
}

export function receiptRevenueLine(data: ReceiptData, payment?: PaymentRecord, currency = true) {
  const reg = data.registration;
  const split = payment
    ? revenueMovements(reg, data.payments, data.refunds).movements.get('p:' + payment.id)
    : revenueTerms(reg);
  if (!split) return '';
  const format = (value: number) => (currency ? '' : 'PHP ') + peso(value / 100, currency);
  return [
    `Studio ${format(split.studio)}`, `MUA ${format(split.mua)}`,
    ...(split.unallocated ? [`Unallocated ${format(split.unallocated)}`] : []),
  ].join(' / ');
}

export const isCounted = (payment: PaymentRecord) => (payment.status || 'completed') === 'completed';

/**
 * Start on the letter-size job order for ordinary first payments and the
 * payment receipt for later payments or a payment with a discount snapshot.
 */
export function printModeFor(payment: PaymentRecord | undefined, payments: PaymentRecord[]): PrintMode {
  if (!payment) return 'joborder';
  if (paymentDiscount(payment)) return 'receipt';
  const index = payments.findIndex((item) => item.id === payment.id);
  return payments.slice(0, Math.max(0, index)).some(isCounted) ? 'receipt' : 'joborder';
}

/**
 * Payment rows that fit on a half-sheet table. When there are too many, voided/refunded
 * rows go first, then the oldest; `hidden` is how many were left out.
 */
export function visiblePayments(payments: PaymentRecord[], max = 4): { rows: PaymentRecord[]; hidden: number } {
  let rows = payments;
  while (rows.length > max) {
    const drop = rows.findIndex((payment) => !isCounted(payment));
    rows = rows.filter((_, index) => index !== (drop === -1 ? 0 : drop));
  }
  return { rows, hidden: payments.length - rows.length };
}

/** Peso amount with centavos, e.g. ₱1,500.00. `currency: false` drops the sign (for the PDF font). */
export function peso(amount: number | undefined | null, currency = true): string {
  const text = Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `₱${text}` : text;
}

const parseDate = (value: string) => new Date(value.includes('T') ? value : value.replace(' ', 'T'));

/** Studio time (Asia/Manila) regardless of the station's clock settings. */
export function receiptDate(value: string, withTime = false): string {
  const date = parseDate(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

export function methodLabel(method: string): string {
  return PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ?? method;
}

export function paymentTypeLabel(payment: PaymentRecord): string {
  if (payment.payment_type === 'initial') return 'Downpayment (50%)';
  if (payment.payment_type === 'full') return 'Full Payment';
  return payment.balance_after === 0 && (payment.balance_before ?? 0) > 0 ? 'Final Settlement' : 'Additional Payment';
}

/** Official numbers print as-is; older random receipt ids are shortened for paper. */
export function receiptLabel(payment: PaymentRecord): string {
  const value = payment.receipt_no || payment.id;
  return /^OR-\d+$/.test(value) || value.length <= 14 ? value : value.slice(0, 12);
}

export function statusLabel(payment: PaymentRecord): string {
  const status = payment.status || 'completed';
  return status === 'completed' ? '' : status.toUpperCase();
}

const PAPER_KEY = 'studioflow-receipt-paper';

/** The receipt paper chosen on this device (payment receipts and refund slips share it). */
export function savedReceiptPaper(): ReceiptPaper {
  try {
    return localStorage.getItem(PAPER_KEY) === 'half' ? 'half' : 'letter';
  } catch {
    return 'letter';
  }
}

export function saveReceiptPaper(value: ReceiptPaper) {
  try { localStorage.setItem(PAPER_KEY, value); } catch { /* per-device convenience only */ }
}

/** @page size and loading hint for a receipt strip (payment receipt or refund slip). */
export function stripPaper(paper: ReceiptPaper): { page: string; hint: string } {
  return paper === 'letter'
    ? { page: 'letter portrait', hint: 'Load LETTER bond paper. It prints on the top third only (3 fit on one sheet). Cut along the dashed line and keep the rest for later receipts (choose "Leftover piece").' }
    : { page: '8.5in 5.5in', hint: 'Load the leftover piece of a sheet (at least 4 in tall works best), long side in the printer guide. In the print window choose Paper size "Statement" (5.5 × 8.5 in), landscape.' };
}

export type RefundSlipData = ReceiptData;
export const loadRefundSlipData = loadReceiptData;

/** The client's saved refund signature as a data URL (it is a protected file), or null when not signed. */
export async function loadRefundSignature(refund: RefundRecord): Promise<string | null> {
  if (!refund.signature) return null;
  try {
    const token = await pb.files.getToken({ requestKey: null });
    const res = await fetch(pb.files.getURL(refund, refund.signature, { token }), { cache: 'no-store' });
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

/**
 * What a refund slip prints, as of the moment the refund was given (a reprint shows the same figures
 * even if the client paid again later): money held before, the refund, money still held after.
 */
export function refundFigures(data: RefundSlipData, refund: RefundRecord) {
  const cents = (value: number) => Math.round((Number(value) || 0) * 100);
  const before = (created: string) => created <= refund.created;
  const counted = data.payments.filter((payment) => isCounted(payment) && before(payment.created));
  const paid = counted.reduce((sum, payment) => sum + cents(payment.amount), 0);
  const index = data.refunds.findIndex((item) => item.id === refund.id);
  const earlier = data.refunds.slice(0, Math.max(0, index)).reduce((sum, item) => sum + cents(item.amount), 0);
  const heldBefore = paid - earlier;
  return {
    receipts: counted.map(receiptLabel),
    paid: paid / 100,
    refundedBefore: earlier / 100,
    heldBefore: heldBefore / 100,
    heldAfter: (heldBefore - cents(refund.amount)) / 100,
  };
}

/** The sentence the client signs on the studio copy. `currency: false` writes "PHP" (for the PDF font). */
export function refundAcknowledgment(data: RefundSlipData, refund: RefundRecord, currency = true): string {
  const amount = currency ? peso(refund.amount) : `PHP ${peso(refund.amount, false)}`;
  const jobOrder = formatJobOrderNo(data.registration.job_order_no);
  return `I received ${amount} (${methodLabel(refund.method)}) from ${STUDIO_INFO.name} as a refund for job order `
    + `${currency ? jobOrder : jobOrder.replace('№', 'No.')}. I have no further claim on this amount.`;
}

export function signatureUrl(registration: Registration): string | null {
  return registration.signatureDataUrl
    || (registration.signature ? pb.files.getURL(registration, registration.signature) : null);
}
