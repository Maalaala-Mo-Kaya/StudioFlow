import type { Course, Level, Organization, Package, PaymentRecord, RefundRecord, Registration } from '../../types';
import { getRegistrationAddOns } from '../../utils/registrationAddOns';

export const reportPackages = [
  { id: 'premiumA', label: 'Premium Package A', description: '₱2,595.00 — 11R Frame' },
  { id: 'standardB', label: 'Standard Package B', description: '₱1,995.00 — 8R Frame' },
  { id: 'standardShsC', label: 'Standard Package SHS C', description: '₱1,395.00 — No Frame' },
  { id: 'basicB', label: 'Basic Package B', description: '₱985.00 — No Frame' },
] as const;

export type ReportPackageId = typeof reportPackages[number]['id'];
export type PackageColumn = ReportPackageId | `catalog:${string}`;
export type PackageMapping = Partial<Record<string, ReportPackageId | ''>>;
/** 'college', 'shs', or another level's name in capitals (e.g. 'ELEMENTARY'). */
export type OverallLevel = string;

const normalize = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Groups a level name for the Overall reports; matches the server's student Excel export. */
export function overallLevelKey(levelName: string): OverallLevel {
  const key = normalize(levelName);
  if (key === 'college') return 'college';
  if (/^(?:senior high(?: school)?(?: shs)?|shs)(?: (?:grade )?(?:11|12))?$/.test(key)) return 'shs';
  return key.toUpperCase();
}
const cents = (amount: number | undefined) => typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount * 100) : 0;
const studioDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});
const shortMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short' });

function paymentTime(payment: PaymentRecord) {
  return Date.parse(payment.created.replace(' ', 'T'));
}

export function displayReportDate(date: string) {
  if (!date) return '—';
  const month = shortMonth.format(new Date(date + 'T00:00:00Z'));
  return `${date.slice(8, 10)}-${month}-${date.slice(2, 4)}`;
}

export function reportPackageFor(pkg: Package, mapping: PackageMapping) {
  if (Object.prototype.hasOwnProperty.call(mapping, pkg.id)) return mapping[pkg.id] || undefined;
  const name = normalize(pkg.name);
  return reportPackages.find(({ label }) => {
    const heading = normalize(label);
    return name === heading || name.startsWith(heading + ' ');
  })?.id;
}

function paymentBreakdown(allRecords: PaymentRecord[], due: number, refunded = 0) {
  // Voided payments (and old "refunded" ones) were never kept: leave them out.
  const records = allRecords.filter((payment) => payment.status !== 'voided' && payment.status !== 'refunded');
  let total = 0;
  let downPayment = 0;
  let additionalPayment = 0;
  let balancePayment = 0;
  let settledDate = '';
  let receivedPayment = false;
  const chronological = [...records].sort((a, b) => {
    const aTime = paymentTime(a);
    const bTime = paymentTime(b);
    return (Number.isFinite(aTime) ? aTime : Infinity) - (Number.isFinite(bTime) ? bTime : Infinity)
      || a.id.localeCompare(b.id);
  });

  for (const payment of chronological) {
    const amount = cents(payment.amount);
    if (!amount) continue;
    const isSettlement = payment.payment_type === 'full' || payment.payment_type === 'balance_settlement';
    if (isSettlement) balancePayment += amount;
    else if (payment.payment_type === 'initial') downPayment += amount;
    else additionalPayment += amount;

    const before = total;
    total += amount;
    if (total < due) settledDate = '';
    else if (before < due && (receivedPayment || isSettlement)) {
      const time = paymentTime(payment);
      if (Number.isFinite(time)) settledDate = studioDate.format(time);
    }
    receivedPayment ||= amount > 0;
  }

  // Money given back comes off the total paid.
  const net = total - refunded;
  const balance = Math.max(0, due - net);
  const fullyPaid = receivedPayment && net > 0 && balance === 0;
  return { total: net, refunded, downPayment, additionalPayment, balancePayment, balance, fullyPaid, settledDate: fullyPaid ? settledDate : '' };
}

interface OverallData {
  registrations: Registration[];
  payments: PaymentRecord[];
  /** Refunds given back; they come off each job order's total paid. */
  refunds?: RefundRecord[];
  organizations: Organization[];
  levels: Level[];
  courses: Course[];
  packages: Package[];
  mapping: PackageMapping;
}

export function buildOverallRows({ registrations, payments, refunds = [], organizations, levels, courses, packages, mapping }: OverallData) {
  const refundedByRegistration = new Map<string, number>();
  for (const refund of refunds) {
    refundedByRegistration.set(refund.registration, (refundedByRegistration.get(refund.registration) ?? 0) + cents(refund.amount));
  }
  const schoolsById = new Map(organizations.map((item) => [item.id, item]));
  const levelsById = new Map(levels.map((item) => [item.id, item]));
  const coursesById = new Map(courses.map((item) => [item.id, item]));
  const packagesById = new Map(packages.map((item) => [item.id, item]));
  const paymentsByRegistration = new Map<string, PaymentRecord[]>();
  for (const payment of new Map(payments.map((item) => [item.id, item])).values()) {
    const records = paymentsByRegistration.get(payment.registration) ?? [];
    records.push(payment);
    paymentsByRegistration.set(payment.registration, records);
  }

  return [...new Map(registrations.map((item) => [item.id, item])).values()].flatMap((reg) => {
    // Walk-ins have no level and are not part of the school Overall reports.
    const level = overallLevelKey(levelsById.get(reg.level ?? '')?.name ?? reg.expand?.level?.name ?? '');
    // Walk-ins and cancelled job orders (nothing owed) are not part of these reports.
    if (!level || reg.status === 'cancelled') return [];

    const school = schoolsById.get(reg.organization ?? '') ?? reg.expand?.organization;
    const course = coursesById.get(reg.course ?? '') ?? reg.expand?.course;
    const pkg = packagesById.get(reg.package) ?? reg.expand?.package;
    const addOns = getRegistrationAddOns(reg.add_ons);
    const extras = addOns.reduce((sum, item) => sum + cents(item.amount), cents(reg.other_fees));
    const due = Math.max(0, Number.isFinite(reg.total_amount) ? cents(reg.total_amount) : cents(pkg?.amount) + extras);
    // The package at the price it was sold for (total − add-ons − other fees), not today's catalog price.
    const discount = (reg.revenue_discount?.studio ?? 0) + (reg.revenue_discount?.mua ?? 0);
    const packageAmount = pkg ? (Number.isFinite(reg.total_amount) ? due + discount - extras : cents(pkg.amount)) : null;
    const packageColumn: PackageColumn | undefined = pkg
      ? reportPackageFor(pkg, mapping) ?? `catalog:${pkg.id}`
      : undefined;
    const poseEntries = addOns.filter((item) => /^additional poses?$/.test(normalize(item.name ?? ''))
      || /^add(?:itional)? poses?$/.test(normalize(item.code ?? '')));
    // What the client was charged for extra poses (price × quantity), not a fixed rate.
    const poses = poseEntries.length ? poseEntries.reduce((sum, item) => {
      const quantity = item.quantity;
      return sum + cents(item.amount) * (typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0 ? quantity : 1);
    }, 0) : null;
    const money = paymentBreakdown(paymentsByRegistration.get(reg.id) ?? [], due, refundedByRegistration.get(reg.id) ?? 0);
    return [{
      id: reg.id,
      level,
      schoolId: reg.organization ?? '',
      school: school?.name ?? '',
      schoolCode: school?.code ?? '',
      courseId: reg.course ?? '',
      course: course?.name ?? '',
      courseCode: course?.code ?? '',
      name: [reg.family_name + ',', reg.given_name, reg.middle_name].filter(Boolean).join(' '),
      givenFirstName: [reg.given_name, reg.middle_name, reg.family_name].filter(Boolean).join(' '),
      jobOrder: reg.job_order_no,
      queue: reg.queue_number,
      packageId: reg.package,
      packageName: pkg?.name ?? '',
      packageCode: pkg?.code ?? '',
      packageColumn,
      packageAmount,
      due,
      addOns,
      poses,
      ...money,
      financial: money.fullyPaid ? 'fully_paid' as const : money.total > 0 ? 'partially_paid' as const : 'unpaid' as const,
    }];
  });
}

export type OverallRow = ReturnType<typeof buildOverallRows>[number];

export const amountColumns = [
  'poses', 'additionalPayment', 'downPayment', 'refunded', 'total', 'balancePayment', 'balance',
] as const;

type AmountColumn = typeof amountColumns[number];

export function overallAmount(row: OverallRow, column: string): number | null {
  switch (column) {
    case 'poses': case 'additionalPayment': case 'downPayment': case 'refunded': case 'total': case 'balancePayment': case 'balance':
      return row[column];
    default:
      return row.packageColumn === column ? row.packageAmount : null;
  }
}

export function summarizeOverallRows(rows: OverallRow[]) {
  const amounts: Partial<Record<AmountColumn | PackageColumn, number>> = {};
  const packageCounts: Partial<Record<PackageColumn, number>> = {};
  let billed = 0;
  for (const row of rows) {
    billed += row.due;
    for (const column of amountColumns) {
      const amount = overallAmount(row, column);
      if (amount !== null) amounts[column] = (amounts[column] ?? 0) + amount;
    }
    if (row.packageColumn && row.packageAmount !== null) {
      amounts[row.packageColumn] = (amounts[row.packageColumn] ?? 0) + row.packageAmount;
      packageCounts[row.packageColumn] = (packageCounts[row.packageColumn] ?? 0) + 1;
    }
  }
  return { amounts, packageCounts, billed, count: rows.length };
}
