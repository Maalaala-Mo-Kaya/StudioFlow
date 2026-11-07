import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { pb } from '../../../db/pocketbase';
import type { Course, Level, Organization, Package, PaymentRecord, Registration } from '../../../types';
import { sumAddOnAmounts } from '../../../utils/registrationAddOns';
import {
  amountColumns, buildOverallRows, displayReportDate, overallAmount, reportPackages, summarizeOverallRows,
} from '../studentOverallData';
import type { OverallLevel, OverallRow, PackageColumn, PackageMapping } from '../studentOverallData';
import { StudentDirectoryFilters } from './StudentDirectoryFilters';
import { RegistrationAddOnsDropdown } from './RegistrationAddOnsDropdown';

const leadingColumns = [
  { id: 'date', label: 'Date of Pictorial' },
  { id: 'studio', label: 'Studio #' },
  { id: 'course', label: 'Course' },
  { id: 'name', label: 'Name' },
  { id: 'packageCode', label: 'Package' },
  { id: 'addOns', label: 'Add-ons' },
] as const;
const trailingColumns = [
  { id: 'poses', label: 'Additional Poses', description: '₱350 per pose' },
  { id: 'fullyPaid', label: 'Full Payment' },
  { id: 'additionalPayment', label: 'Additional Payment' },
  { id: 'downPayment', label: 'Down Payment' },
  { id: 'total', label: 'Total Payment' },
  { id: 'balancePayment', label: 'Balance Payment' },
  { id: 'settledDate', label: 'Date Paid with the Balance' },
  { id: 'balance', label: 'Balance' },
] as const;
type Column = typeof leadingColumns[number]['id'] | typeof trailingColumns[number]['id'] | PackageColumn;
const defaultColumnIds = new Set<Column>([
  'course',
  'name',
  'packageCode',
  'addOns',
  'fullyPaid',
  'additionalPayment',
  'downPayment',
  'total',
  'balancePayment',
  'balance',
]);
const financialColumns = new Set<string>(amountColumns);
const filterSections = [
  { key: 'school', title: 'Schools & Organizations' },
  { key: 'course', title: 'Courses & Strands' },
  { key: 'package', title: 'Packages' },
  { key: 'date', title: 'Pictorial Dates' },
  { key: 'financial', title: 'Payment Statuses' },
] as const;
type FilterKey = typeof filterSections[number]['key'];
const emptyFilters: Record<FilterKey, string[]> = { school: [], course: [], package: [], date: [], financial: [] };
const financialLabels = { fully_paid: 'Fully paid', partially_paid: 'Partially paid', unpaid: 'Unpaid' };
const mappingKey = 'studioflow.students.overall.packageMapping';
const compareText = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const money = (amount: number | null | undefined) => amount == null ? '—' : peso.format(amount / 100);

interface StudentOverallProps {
  title: string;
  level: OverallLevel;
  registrations: Registration[];
  organizations: Organization[];
  levels: Level[];
  courses: Course[];
  packages: Package[];
}

function readMapping(): PackageMapping {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(mappingKey) ?? 'null');
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).filter(([, id]) => id === '' || reportPackages.some((pkg) => pkg.id === id)));
    }
  } catch {
    // Fall back to the catalog when no saved mapping can be read.
  }
  return {};
}

function usePaymentLedger() {
  const [ledger, setLedger] = useState<{ status: 'loading' | 'error' } | { status: 'ready'; records: PaymentRecord[] }>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const collection = pb.collection('payments');
    let active = true;
    let version = 0;
    let unsubscribe: (() => Promise<void>) | undefined;

    async function refresh() {
      const request = ++version;
      try {
        const records = await collection.getFullList<PaymentRecord>({ fields: 'id,registration,amount,payment_type,created' });
        if (active && request === version) setLedger({ status: 'ready', records });
      } catch {
        if (active && request === version) setLedger({ status: 'error' });
      }
    }

    void refresh();
    void collection.subscribe('*', refresh).then((stop) => {
      if (!active) return stop();
      unsubscribe = stop;
      // Catch transactions recorded between the initial fetch and the subscription.
      return refresh();
    }).catch((error) => console.error('Could not subscribe to payment updates:', error));
    return () => {
      active = false;
      void unsubscribe?.().catch(console.error);
    };
  }, [attempt]);

  return {
    ledger,
    retry: () => {
      setLedger({ status: 'loading' });
      setAttempt((previous) => previous + 1);
    },
  };
}

function sortValue(row: OverallRow, id: Column): number | string | null {
  switch (id) {
    case 'date': case 'studio': return null;
    case 'name': return row.name;
    case 'course': return row.course || row.courseCode || null;
    case 'packageCode': return row.packageCode || row.packageName || null;
    case 'addOns': return sumAddOnAmounts(row.addOns);
    case 'settledDate': return row.settledDate || null;
    case 'fullyPaid': return Number(row.fullyPaid);
    default: return overallAmount(row, id);
  }
}

function reportCell(row: OverallRow, id: Column) {
  switch (id) {
    case 'date': case 'studio': return '—';
    case 'course': return <div className="min-w-24 max-w-52">{row.course || row.courseCode || '—'}</div>;
    case 'name': return <div className="min-w-32 font-bold">{row.name}</div>;
    case 'packageCode': return row.packageName ? (
      <div className="min-w-28 max-w-48 whitespace-normal">
        <div className="font-bold">{row.packageCode || row.packageName}</div>
        {row.packageCode && <div className="text-neutral-600">{row.packageName}</div>}
      </div>
    ) : '—';
    case 'addOns': return (
      <RegistrationAddOnsDropdown
        addOns={row.addOns}
        formatAmount={(amount) => peso.format(amount)}
      />
    );
    case 'fullyPaid': return (
      <span className="inline-flex items-center gap-2">
        <input type="checkbox" checked={row.fullyPaid} disabled aria-label={`Full payment for ${row.name}`} className="accent-[#C9A227]" />
        {financialLabels[row.financial]}
      </span>
    );
    case 'settledDate': return displayReportDate(row.settledDate);
    default: return money(overallAmount(row, id));
  }
}

export function StudentOverall({ title, level, registrations, organizations, levels, courses, packages }: StudentOverallProps) {
  const { ledger, retry } = usePaymentLedger();
  const [mapping] = useState(readMapping);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [columnOverrides, setColumnOverrides] = useState<Partial<Record<Column, boolean>>>({});
  const [sort, setSort] = useState<{ column: Column; ascending: boolean }>({ column: 'name', ascending: true });

  const allRows = useMemo(() => ledger.status === 'ready'
    ? buildOverallRows({ registrations, payments: ledger.records, organizations, levels, courses, packages, mapping })
    : [], [registrations, ledger, organizations, levels, courses, packages, mapping]);
  const rows = useMemo(() => allRows.filter((row) => row.level === level), [allRows, level]);
  const catalogColumns = [...new Map(rows.flatMap((row) => {
    const id = row.packageColumn;
    return id?.startsWith('catalog:')
      ? [[id, { id, label: row.packageName, description: `Catalog ${money(row.packageAmount)}` }] as const]
      : [];
  })).values()].sort((a, b) => compareText.compare(a.label, b.label));
  const packageColumns = [...reportPackages, ...catalogColumns];
  const packageColumnIds = new Set<string>(packageColumns.map(({ id }) => id));
  const columns = [...leadingColumns, ...packageColumns, ...trailingColumns];
  const defaultVisible = ({ id }: { id: Column }) => defaultColumnIds.has(id);
  const selectedColumns = columns.filter((column) => columnOverrides[column.id] ?? defaultVisible(column));
  const visibleColumns = selectedColumns.length ? selectedColumns : columns.filter(defaultVisible);
  const visible = visibleColumns.map(({ id }) => id);
  const isMonetary = (id: Column) => financialColumns.has(id) || packageColumnIds.has(id);
  const sortColumn = columns.some(({ id }) => id === sort.column) ? sort.column : 'name';

  const options = useMemo(() => {
    const byId = (values: { id: string; label: string }[]) => [...new Map(values.filter(({ id }) => id).map((item) => [item.id, item])).values()]
      .sort((a, b) => compareText.compare(a.label, b.label));
    return {
      school: byId(rows.map((row) => ({ id: row.schoolId, label: row.school || row.schoolCode || row.schoolId }))),
      course: byId(rows.map((row) => ({ id: row.courseId, label: row.course || row.courseCode || row.courseId }))),
      package: byId(rows.map((row) => ({ id: row.packageId, label: row.packageName || row.packageCode || row.packageId }))),
      date: rows.length ? [{ id: 'unrecorded', label: 'Not recorded' }] : [],
      financial: Object.entries(financialLabels).map(([id, label]) => ({ id, label })),
    };
  }, [rows]);

  const shownRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter((row) => {
      const keys = { school: row.schoolId, course: row.courseId, package: row.packageId, date: 'unrecorded', financial: row.financial };
      return filterSections.every(({ key }) => !filters[key].length || filters[key].includes(keys[key]))
        && (!term || [row.name, row.givenFirstName, row.jobOrder, row.course, row.courseCode, row.school, row.schoolCode]
          .some((value) => value?.toLowerCase().includes(term)));
    }).sort((a, b) => {
      const left = sortValue(a, sortColumn);
      const right = sortValue(b, sortColumn);
      if (left === null || right === null) return Number(left === null) - Number(right === null);
      const order = typeof left === 'number' && typeof right === 'number' ? left - right : compareText.compare(String(left), String(right));
      return sort.ascending ? order : -order;
    });
  }, [filters, query, rows, sort, sortColumn]);

  const totals = summarizeOverallRows(shownRows);

  return (
    <div data-student-overall className="min-w-0 space-y-5 font-mono text-xs">
      <StudentDirectoryFilters
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Search name, JO №, course, school..."
        sections={filterSections}
        filters={filters}
        options={options}
        onToggleFilter={(key, id) => setFilters((current) => ({
          ...current, [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id],
        }))}
        onClearFilters={() => setFilters(emptyFilters)}
        columns={columns}
        visibleColumns={visible}
        onToggleColumn={(id) => {
          if (visible.length === 1 && visible.includes(id)) return;
          setColumnOverrides((current) => ({ ...current, [id]: !visible.includes(id) }));
        }}
        onSelectAllColumns={() => setColumnOverrides(Object.fromEntries(columns.map(({ id }) => [id, true])))}
        onResetColumns={() => setColumnOverrides({})}
      />

      <div className="min-w-0 border-2 border-[#0A0A0A] bg-white shadow-[6px_6px_0px_#0A0A0A]">
        <div className="space-y-2 border-b-2 border-[#0A0A0A] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-black uppercase tracking-wider">{title}</h3>
            {ledger.status === 'ready' && <span className="text-neutral-600">Showing {shownRows.length} of {rows.length} students</span>}
          </div>
          {ledger.status === 'ready' && shownRows.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ['Students', totals.count],
                ['Billed', money(totals.billed)],
                ['Received', money(totals.amounts.total ?? 0)],
                ['Outstanding', money(totals.amounts.balance ?? 0)],
              ].map(([label, value]) => (
                <div key={label} className="border border-neutral-200 bg-[#F8F7F4] p-2">
                  <dt className="text-[10px] font-bold uppercase text-neutral-600">{label}</dt>
                  <dd className="font-black tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {ledger.status !== 'ready' ? (
          <div role="status" className="p-4 text-neutral-600">
            {ledger.status === 'loading' ? 'Loading payment records…' : (
              <>Payment records could not be loaded. <button type="button" onClick={retry} className="font-bold underline">Retry</button></>
            )}
          </div>
        ) : (
          <div role="region" aria-label={`${title} table`} tabIndex={0} className="max-h-[65dvh] overflow-auto">
            <table className="w-full border-separate border-spacing-0 text-left tabular-nums">
              <thead className="sticky top-0 z-10 bg-[#0A0A0A] text-[#C9A227]">
                <tr>
                  {visibleColumns.map((column) => {
                    const { id, label } = column;
                    const sorted = sortColumn === id;
                    const Icon = sorted ? sort.ascending ? ArrowUp : ArrowDown : ArrowUpDown;
                    return (
                      <th key={id} scope="col" aria-sort={sorted ? sort.ascending ? 'ascending' : 'descending' : undefined} className={`p-2.5 align-top text-[11px] ${isMonetary(id) ? 'text-right' : ''}`}>
                        {id === 'date' || id === 'studio' ? <span className="whitespace-nowrap">{label}</span> : (
                          <button
                            type="button"
                            onClick={() => setSort({ column: id, ascending: !sorted || !sort.ascending })}
                            className={`inline-flex cursor-pointer items-center gap-1 font-bold ${isMonetary(id) ? 'justify-end' : ''}`}
                          >
                            {label}<Icon className="size-3 shrink-0" aria-hidden="true" />
                          </button>
                        )}
                        {'description' in column && <span className="mt-1 block whitespace-nowrap font-normal text-white">{column.description}</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shownRows.length === 0 && (
                  <tr>
                    {visibleColumns.map(({ id }) => (
                      <td key={id} className={`px-2.5 py-2 text-neutral-500 ${isMonetary(id) ? 'text-right' : ''}`}>—</td>
                    ))}
                  </tr>
                )}
                {shownRows.map((row) => (
                  <tr key={row.id} className="even:bg-[#F8F7F4] hover:bg-[#F7F2E0]">
                    {visibleColumns.map(({ id }) => (
                      <td key={id} className={`border-b border-neutral-200 px-2.5 py-2 align-top ${isMonetary(id) ? 'whitespace-nowrap text-right' : ''}`}>
                        {reportCell(row, id)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot hidden={shownRows.length === 0} className="bg-[#F7F2E0] font-bold">
                <tr>
                  {visibleColumns.map(({ id }, index) => (
                    <td key={id} className="border-t-2 border-[#0A0A0A] px-2.5 py-2 whitespace-nowrap">
                      {index === 0 && <span className="mr-2">TOTAL AMOUNT</span>}
                      {isMonetary(id) && (
                        <span className="block text-right">
                          {money(totals.amounts[id as keyof typeof totals.amounts] ?? (id === 'poses' ? null : 0))}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  {visibleColumns.map(({ id }, index) => (
                    <td key={id} className="border-t border-[#C9A227] px-2.5 py-2 whitespace-nowrap">
                      {index === 0 && <span className="mr-2">NO. STUDENTS · {totals.count}</span>}
                      {packageColumnIds.has(id) && <span className="block text-right">{totals.packageCounts[id as keyof typeof totals.packageCounts] ?? 0}</span>}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
