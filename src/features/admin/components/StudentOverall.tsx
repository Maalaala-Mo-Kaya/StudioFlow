import { ClientResponseError } from 'pocketbase';
import type { DataRequestState } from '../../../components/common/DataFeedback';
import { useEffect, useMemo, useState } from 'react';
import { pb } from '../../../db/pocketbase';
import { coalesce, mountSubscription, useRealtimeClient } from '../../../hooks/useRealtimeClient';
import type { Course, Level, Organization, Package, PaymentRecord, RefundRecord, Registration } from '../../../types';
import { sumAddOnAmounts } from '../../../utils/registrationAddOns';
import {
  amountColumns, buildOverallRows, displayReportDate, overallAmount, reportPackages, summarizeOverallRows,
} from '../studentOverallData';
import type { OverallLevel, OverallRow, PackageColumn, PackageMapping } from '../studentOverallData';
import { StudentDirectoryFilters } from './StudentDirectoryFilters';
import { RegistrationAddOnsDropdown } from './RegistrationAddOnsDropdown';
import { DataTable } from '../../../components/common/DataTable';
import type { DataTableColumn } from '../../../components/common/DataTable';

const leadingColumns = [
  { id: 'date', label: 'Date of Pictorial' },
  { id: 'studio', label: 'Studio #' },
  { id: 'course', label: 'Course' },
  { id: 'name', label: 'Name' },
  { id: 'packageCode', label: 'Package' },
  { id: 'addOns', label: 'Add-ons' },
] as const;
const trailingColumns = [
  { id: 'poses', label: 'Additional Poses', description: 'Amount charged for extra poses' },
  { id: 'fullyPaid', label: 'Full Payment' },
  { id: 'additionalPayment', label: 'Additional Payment' },
  { id: 'downPayment', label: 'Down Payment' },
  { id: 'refunded', label: 'Refunded', description: 'Money given back; taken off Total Payment' },
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
  'refunded',
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
  request: DataRequestState;
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
  const [ledger, setLedger] = useState<{ pending: boolean; error?: string; records?: PaymentRecord[]; refunds?: RefundRecord[] }>({ pending: true });
  const [attempt, setAttempt] = useState(0);
  const live = useRealtimeClient();

  useEffect(() => {
    const collection = pb.collection('payments');
    let active = true;
    let version = 0;

    async function refresh() {
      const request = ++version;
      setLedger((current) => ({ ...current, pending: true, error: undefined }));
      try {
        // status is needed so voided payments are left out.
        const [records, refunds] = await Promise.all([
          collection.getFullList<PaymentRecord>({ fields: 'id,registration,amount,payment_type,status,created' }),
          pb.collection('refunds').getFullList<RefundRecord>({ fields: 'id,registration,amount,created' }).catch((error: unknown) => {
            if (error instanceof ClientResponseError && error.status === 404) return [];
            throw error;
          }),
        ]);
        if (active && request === version) setLedger({ pending: false, records, refunds });
      } catch (error) {
        if (active && request === version) {
          console.error('Failed to load overall-report payments:', error);
          setLedger((current) => ({ ...current, pending: false, error: 'Could not load payment records.' }));
        }
      }
    }

    void refresh();
    const reload = coalesce(refresh);
    const unsubscribe = mountSubscription(async (listener) => {
      const stop = await live.collection('payments').subscribe('*', listener);
      // Catch transactions recorded between the initial fetch and the subscription.
      if (active) reload();
      return stop;
    }, reload);
    return () => {
      active = false;
      reload.cancel();
      unsubscribe();
    };
  }, [attempt, live]);

  return {
    ledger,
    retry: () => {
      setLedger((current) => ({ ...current, pending: true, error: undefined }));
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
        <input type="checkbox" checked={row.fullyPaid} disabled aria-label={`Full payment for ${row.name}`} className="accent-gold" />
        {financialLabels[row.financial]}
      </span>
    );
    case 'settledDate': return displayReportDate(row.settledDate);
    default: return money(overallAmount(row, id));
  }
}

export function StudentOverall({ request, title, level, registrations, organizations, levels, courses, packages }: StudentOverallProps) {
  const { ledger, retry } = usePaymentLedger();
  const [mapping] = useState(readMapping);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [columnOverrides, setColumnOverrides] = useState<Partial<Record<Column, boolean>>>({});

  const allRows = useMemo(() => ledger.records && ledger.refunds
    ? buildOverallRows({ registrations, payments: ledger.records, refunds: ledger.refunds, organizations, levels, courses, packages, mapping })
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
    });
  }, [filters, query, rows]);

  const totals = summarizeOverallRows(shownRows);
  const tableColumns: DataTableColumn<OverallRow, Column>[] = columns.map((column) => ({
    id: column.id, header: column.label, description: 'description' in column ? column.description : undefined,
    sortable: column.id !== 'date' && column.id !== 'studio',
    accessor: (row) => sortValue(row, column.id),
    cell: (row) => reportCell(row, column.id),
    minWidth: column.id === 'name' ? 156 : ['course', 'packageCode', 'addOns', 'fullyPaid'].includes(column.id) ? 144 : undefined,
    align: isMonetary(column.id) ? 'right' : 'left',
    headerClassName: 'p-2.5',
    cellClassName: `px-2.5 align-top ${isMonetary(column.id) ? 'whitespace-nowrap' : ''}`,
  }));

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

      <DataTable
        label={title}
        rows={shownRows}
        columns={tableColumns}
        visibleColumnIds={visible}
        getRowId={(row) => row.id}
        defaultSort={{ column: 'name', direction: 'ascending' }}
        tableClassName="tabular-nums"
        rowClassName={() => 'even:bg-canvas hover:bg-gold-wash'}
        loading={request.loading || (ledger.pending && !ledger.records)}
        refreshing={request.refreshing || (ledger.pending && !!ledger.records)}
        error={request.error || ledger.error}
        onRetry={request.error ? request.onRetry : retry}
        loadingMessage="Loading payment records…"
        searching={Boolean(query.trim())}
        filtered={Object.values(filters).some((values) => values.length > 0)}
        emptyMessage="No students available."
        footer={shownRows.length ? (visibleColumns) => (
          <>
            <tr>
              {visibleColumns.map(({ id }, index) => (
                <td key={id} className="bg-gold-wash font-bold border-t-2 border-line px-2.5 py-2 whitespace-nowrap">
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
                <td key={id} className="bg-gold-wash font-bold border-t border-gold px-2.5 py-2 whitespace-nowrap">
                  {index === 0 && <span className="mr-2">NO. STUDENTS · {totals.count}</span>}
                  {packageColumnIds.has(id) && <span className="block text-right">{totals.packageCounts[id as keyof typeof totals.packageCounts] ?? 0}</span>}
                </td>
              ))}
            </tr>
          </>
        ) : undefined}
      />
    </div>
  );
}
