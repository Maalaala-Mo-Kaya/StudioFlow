import { ClientResponseError } from 'pocketbase';
import { pb } from '../../db/pocketbase';
import { PAYMENT_METHOD_OPTIONS, RECEIPT_TERMS_CLAUSES, STUDIO_INFO } from '../../constants/studio';
import { formatJobOrderNo } from '../../utils/formatters';
import { getRegistrationAddOns, sumAddOnAmounts } from '../../utils/registrationAddOns';
import type { PaymentRecord, RefundRecord, Registration, StudioSettings } from '../../types';
import { eventDateLabel, isWalkIn } from '../../utils/clientInfo';
import { discountCents, discountRate, revenueMovements, revenueTerms } from '../../utils/revenue';

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
    }).catch((error: unknown) => {
      if (error instanceof ClientResponseError && error.status === 404) return [];
      throw error;
    }),
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

/**
 * What the client bought besides the package: Studio add-ons and other fees (MUA charges: `orderMuaExtras`).
 * The discount is not a purchase: it prints in its own box beside the package (`orderDiscountCell`).
 */
export function orderExtras(reg: Registration): [string, number][] {
  const addOns = getRegistrationAddOns(reg.add_ons).filter((item) => item.revenue_category !== 'mua');
  return [
    ...addOns.map((item): [string, number] => [item.name, item.amount]),
    ...(reg.other_fees ? [['Other fees', reg.other_fees] as [string, number]] : []),
  ];
}

/** The job order's Discount box (beside the package): "Discount (10%)" / "−₱2,000.00 · reason"; null when none or cancelled. */
export function orderDiscountCell(reg: Registration, currency = true): { label: string; value: string } | null {
  const { amount, rate, reason } = orderDiscount(reg);
  if (amount <= 0) return null;
  return {
    label: rate === 'Fixed amount' ? 'Discount (fixed amount)' : `Discount (${rate})`,
    value: [`-${currency ? '' : 'PHP '}${peso(amount, currency)}`, reason].filter(Boolean).join(' · '),
  };
}

/** The totals line for the discount, short enough for the totals box: "Less discount (10%)" or "Less discount". */
export function lessDiscountLabel(reg: Registration): string {
  const { rate } = orderDiscount(reg);
  return rate && rate !== 'Fixed amount' ? `Less discount (${rate})` : 'Less discount';
}

/**
 * MUA charges on the order: makeup services and shared MUA items (the automatic Wardrobe add-on).
 * The studio collects them with the rest of the order and pays the MUA team, so receipts list them apart.
 */
export function orderMuaExtras(reg: Registration): [string, number][] {
  return getRegistrationAddOns(reg.add_ons)
    .filter((item) => item.revenue_category === 'mua')
    .map((item): [string, number] => [item.name, item.amount]);
}

/** The order's Studio and MUA parts at their sold prices, before any discount (pesos; they add up to the original billed). */
export function orderParts(reg: Registration): { studio: number; mua: number } {
  const packageMua = (reg.package_snapshot?.revenue_category || reg.expand?.package?.revenue_category) === 'mua'
    ? Math.round(soldPackagePrice(reg) * 100) : 0;
  const mua = packageMua + Math.round(orderMuaExtras(reg).reduce((sum, [, amount]) => sum + amount, 0) * 100);
  const original = Math.round((reg.total_amount || 0) * 100) + discountCents(reg);
  return { studio: (original - mua) / 100, mua: mua / 100 };
}

/** "Studio ₱19,200.00 · MUA services ₱400.00": the order's two parts, for the receipts ('' when it has no MUA charge). */
export function orderPartsLine(reg: Registration, currency = true): string {
  const { studio, mua } = orderParts(reg);
  if (mua <= 0) return '';
  const format = (value: number) => (currency ? '' : 'PHP ') + peso(value, currency);
  return `Studio ${format(studio)} · MUA services ${format(mua)} (paid to the MUA team)`;
}

/** The job order's discount credit as printed in its totals: percentage and amount (0 when none or cancelled). */
export function orderDiscount(reg: Registration): { amount: number; rate: string; reason: string } {
  const amount = reg.status === 'cancelled' ? 0 : discountCents(reg) / 100;
  return { amount, rate: discountRate(reg.revenue_discount, reg.total_amount), reason: reg.revenue_discount?.reason ?? '' };
}

const snapshotCents = (payment?: PaymentRecord) =>
  payment?.discount_snapshot ? payment.discount_snapshot.studio + payment.discount_snapshot.mua : 0;

/** The counted payment just before this one (null for the first). */
function previousPayment(payment: PaymentRecord, payments: PaymentRecord[]): PaymentRecord | null {
  const end = timeOf(payment.created);
  return payments
    .filter((p) => p.id !== payment.id && isCounted(p) && timeOf(p.created) < end)
    .reduce<PaymentRecord | null>((last, p) => (!last || timeOf(p.created) > timeOf(last.created) ? p : last), null);
}

/**
 * The discount given (or changed) since the previous payment, as printed on this payment's receipt.
 * Older payments may repeat an order's `discount_snapshot`. Show only the change on those receipts.
 * New collections only record a snapshot with the first payment. `amount` is the change in pesos.
 */
export function paymentDiscount(payment: PaymentRecord, payments: PaymentRecord[] = []) {
  const snapshot = payment.discount_snapshot;
  if (!snapshot) return null;
  const amount = (snapshotCents(payment) - snapshotCents(previousPayment(payment, payments) ?? undefined)) / 100;
  if (!amount) return null;
  return { amount, percentage: snapshot.percentage, rate: discountRate(snapshot), reason: snapshot.reason };
}

/**
 * What changed on the order between payments, for the job order's payment table, so its balance column adds up:
 * "Before OR-000024: + Hair Only ₱100.00 · − Discount ₱400.00 (Returning client)", and "Since OR-000024: …"
 * for changes after the last payment. Changes before the first payment are already in the order itself.
 */
export function jobOrderAdjustments(data: ReceiptData, currency = true): string[] {
  const counted = data.payments.filter(isCounted).sort((a, b) => timeOf(a.created) - timeOf(b.created));
  const money = (value: number) => (currency ? '' : 'PHP ') + peso(value, currency);
  // The PDF's built-in fonts have no minus sign: a plain "-" there.
  const minus = currency ? '−' : '-';
  const describe = (additions: string[], discount: number, reason: string) => [
    ...additions.map((line) => `+ ${line}`),
    ...(discount > 0 ? [`${minus} Discount ${money(discount)}${reason ? ` (${reason})` : ''}`]
      : discount < 0 ? [`+ Discount reduced ${money(-discount)}`] : []),
  ].join(' · ');
  const notes: string[] = [];
  counted.forEach((payment, index) => {
    if (index === 0) return;
    const discount = paymentDiscount(payment, data.payments);
    const text = describe(paymentAdditions(data, payment, currency), discount?.amount ?? 0, discount?.reason ?? '');
    if (text) notes.push(`Before ${receiptLabel(payment)}: ${text}`);
  });
  // After the last payment: items added since, and a discount given or changed since (not yet on a receipt).
  const last = counted.at(-1);
  const reg = data.registration;
  if (last && reg.status !== 'cancelled') {
    const since = changeLines(reg, timeOf(last.created), Infinity, currency);
    const discount = (discountCents(reg) - snapshotCents(last)) / 100;
    const text = describe(since, discount, reg.revenue_discount?.reason ?? '');
    if (text) notes.push(`Since ${receiptLabel(last)}: ${text}`);
  }
  return notes;
}

/** Items, package and fee changes logged on the order in (start, end]. */
function changeLines(reg: Registration, start: number, end: number, currency: boolean): string[] {
  const changes = reg.order_changes;
  if (!Array.isArray(changes) || !changes.length) return [];
  const lines: string[] = [];
  for (const change of changes) {
    const at = timeOf(change.at);
    if (!(at > start && at <= end)) continue;
    for (const item of change.added ?? []) lines.push(`${item.name} ${peso(item.amount, currency)}`);
    if (change.package?.to) lines.push(`Package → ${change.package.to}`);
    if (change.fees && change.fees.to > change.fees.from) lines.push(`Other fees ${peso(change.fees.to - change.fees.from, currency)}`);
  }
  return lines;
}

/** An order with a job order number already has a printed claim stub (worth reprinting after a change). */
export const hasPrintedJobOrder = (reg: Registration) => Boolean(reg.job_order_no) && reg.status !== 'cancelled';

/** Names of add-ons in `after` that were not in `before` (matched by id, else name). */
export function addedAddOnNames(before: unknown, after: unknown): string[] {
  const key = (item: { id?: string; name: string }) => item.id ?? item.name;
  const had = new Set(getRegistrationAddOns(before).map(key));
  return getRegistrationAddOns(after).filter((item) => !had.has(key(item))).map((item) => item.name);
}

const timeOf = (value: string) => Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));

/**
 * What was added to the order since the previous counted payment, up to this one ("Extra 8R Frame ₱350",
 * "Package → Premium B"), so the receipt says what the extra payment is for. Empty when nothing was added.
 */
export function paymentAdditions(data: ReceiptData, payment: PaymentRecord, currency = true): string[] {
  const previous = previousPayment(payment, data.payments);
  return changeLines(data.registration, previous ? timeOf(previous.created) : -Infinity, timeOf(payment.created), currency);
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
    // Downpayments on orders mixing Studio and MUA charges are split once the order is fully paid:
    // held then, and the settling payment splits that earlier cash into Studio and MUA.
    ...(split.unallocated > 0 ? [`Held until fully paid ${format(split.unallocated)}`]
      : split.unallocated < 0 ? [`Earlier held cash split ${format(-split.unallocated)}`] : []),
  ].join(' · ');
}

export const isCounted = (payment: PaymentRecord) => (payment.status || 'completed') === 'completed';

/**
 * Start on the letter-size job order for ordinary first payments and the
 * payment receipt for later payments or a payment that came with a discount.
 */
export function printModeFor(payment: PaymentRecord | undefined, payments: PaymentRecord[]): PrintMode {
  if (!payment) return 'joborder';
  if (paymentDiscount(payment, payments)) return 'receipt';
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
