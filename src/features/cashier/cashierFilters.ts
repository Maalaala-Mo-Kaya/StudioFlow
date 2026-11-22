import type { Registration } from '../../types';
import { isWalkIn } from '../../utils/clientInfo';
import { WALKIN_CLIENTS } from '../../utils/clientGroup';

/** Sections of the cashier's Advanced Filters panel (same panel as Admin → Clients Directory). */
export const cashierFilterSections = [
  { key: 'school', title: 'Schools & Walk-ins' },
  { key: 'level', title: 'Academic Level' },
  { key: 'package', title: 'Package' },
  { key: 'queue', title: 'Order Status' },
  { key: 'financial', title: 'Payment Status' },
] as const;
export type CashierFilterKey = typeof cashierFilterSections[number]['key'];
export type CashierFilters = Record<CashierFilterKey, string[]>;
export const emptyCashierFilters: CashierFilters = { school: [], level: [], package: [], queue: [], financial: [] };

/** Columns the cashier can show or hide (Actions always stays). */
export const cashierColumns = [
  { id: 'job', label: 'Job Order №' },
  { id: 'name', label: 'Client Name' },
  { id: 'school', label: 'School / Session' },
  { id: 'package', label: 'Package' },
  { id: 'total', label: 'Total' },
  { id: 'balance', label: 'Paid / Balance' },
  { id: 'status', label: 'Status' },
  { id: 'pickup', label: 'Pickup Notice (Ready tab)' },
] as const;
export type CashierColumnId = typeof cashierColumns[number]['id'];
export const defaultCashierColumns: CashierColumnId[] = cashierColumns.map(({ id }) => id);

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Pending Payment', paid: 'Paid (In Queue)', shooting: 'Shooting', done_shooting: 'Done Shooting',
  completed: 'Completed', ready_for_pickup: 'Ready for Pickup', released: 'Released', cancelled: 'Cancelled',
};
const PAYMENT_LABELS: Record<string, string> = { unpaid: 'Unpaid', downpayment: 'Downpayment', fully_paid: 'Fully Paid' };

const levelKey = (name = '') => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** The value each filter section compares against. */
function valueFor(reg: Registration, key: CashierFilterKey): string {
  switch (key) {
    case 'school': return isWalkIn(reg) ? WALKIN_CLIENTS : reg.organization ?? '';
    case 'level': return levelKey(reg.expand?.level?.name);
    case 'package': return reg.package ?? '';
    case 'queue': return reg.status;
    case 'financial': return reg.payment_status;
  }
}

export function matchesCashierFilters(reg: Registration, filters: CashierFilters): boolean {
  return cashierFilterSections.every(({ key }) => !filters[key].length || filters[key].includes(valueFor(reg, key)));
}

/** Checkbox options for each section, built from the orders on screen. */
export function cashierFilterOptions(registrations: Registration[]) {
  const schools = new Map<string, string>();
  const levels = new Map<string, string>();
  const packages = new Map<string, string>();
  const statuses = new Set<string>();
  const payments = new Set<string>();
  let walkIns = false;
  for (const reg of registrations) {
    if (isWalkIn(reg)) walkIns = true;
    else if (reg.organization) {
      const org = reg.expand?.organization;
      schools.set(reg.organization, org ? `${org.name}${org.code ? ` (${org.code})` : ''}` : reg.organization);
    }
    const level = reg.expand?.level?.name?.trim();
    if (level) levels.set(levelKey(level), level);
    const pkg = reg.expand?.package;
    if (reg.package) packages.set(reg.package, pkg ? [pkg.code, pkg.name].filter(Boolean).join(' · ') : reg.package);
    if (reg.status) statuses.add(reg.status);
    if (reg.payment_status) payments.add(reg.payment_status);
  }
  const sorted = (map: Map<string, string>) => [...map].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  const order = (labels: Record<string, string>, values: Set<string>) =>
    Object.keys(labels).filter((id) => values.has(id)).map((id) => ({ id, label: labels[id] }));
  return {
    school: [...sorted(schools), ...(walkIns ? [{ id: WALKIN_CLIENTS, label: 'Walk-in clients' }] : [])],
    level: sorted(levels),
    package: sorted(packages),
    queue: order(STATUS_LABELS, statuses),
    financial: order(PAYMENT_LABELS, payments),
  };
}
