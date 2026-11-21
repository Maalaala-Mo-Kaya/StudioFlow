import React, { useState, useMemo, useEffect } from 'react';
import { Edit3, Ban, Users, FileDown, RotateCcw } from 'lucide-react';
import type { AddOn, Registration, Organization, Level, Course, Package } from '../../../types';
import { formatCurrency, formatClientName } from '../../../utils/formatters';
import { RegistrationStatusBadge } from '../../../components/RegistrationStatusBadge';
import { EditStudentModal, type RegistrationEdits } from './EditStudentModal';
import { getRegistrationAddOns } from '../../../utils/registrationAddOns';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useToast } from '../../../context/ToastContext';
import { StudentDirectoryFilters } from './StudentDirectoryFilters';
import { StudentOverall } from './StudentOverall';
import { overallLevelKey } from '../studentOverallData';
import { RegistrationAddOnsDropdown } from './RegistrationAddOnsDropdown';
import { DataTable } from '../../../components/common/DataTable';
import { ClientGroupFilter } from '../../../components/common/ClientGroupFilter';
import { matchesClientGroup } from '../../../utils/clientGroup';
import type { DataTableColumn } from '../../../components/common/DataTable';
import { clientDetail, clientGroup, clientSummary, isWalkIn } from '../../../utils/clientInfo';

const WALKIN_FILTER = '__walkin';
const REFUNDED_FILTER = '__refunded';
const isRefunded = (reg: Registration) => (reg.refunded_amount ?? 0) > 0;

const filterSections = [
  { key: 'school', title: 'Schools & Organizations' },
  { key: 'level', title: 'Select Academic Level' },
  { key: 'queue', title: 'Queue Statuses' },
  { key: 'financial', title: 'Financial Statuses' },
] as const;
type StudentFilterKey = typeof filterSections[number]['key'];
type StudentFilters = Record<StudentFilterKey, string[]>;

const columns = [
  { id: 'student', label: 'Client Name', heading: '', cell: '' },
  { id: 'school', label: 'School / Session', heading: '', cell: '' },
  { id: 'contact', label: 'Section & Contact', heading: '', cell: '' },
  { id: 'package', label: 'Package', heading: '', cell: '' },
  { id: 'balance', label: 'Balance', heading: 'text-right', cell: 'text-right font-mono font-bold' },
  { id: 'status', label: 'Status', heading: 'text-center', cell: 'text-center' },
  { id: 'actions', label: 'Actions', heading: 'text-right', cell: 'text-right' },
] as const;

type ColumnId = typeof columns[number]['id'];
const defaultColumns = columns.map(({ id }) => id);
const columnStorageKey = 'studioflow.students.visibleColumns';
const emptyFilters: StudentFilters = { school: [], level: [], queue: [], financial: [] };

function readColumnPreferences(): ColumnId[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(columnStorageKey) ?? 'null');
    const valid = Array.isArray(saved) ? defaultColumns.filter((id) => saved.includes(id)) : [];
    if (valid.length) return valid;
  } catch {
    // Use defaults if local storage is unavailable or contains invalid data.
  }
  return defaultColumns;
}

const levelKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const statusOptions = (values: string[]) => [...new Set(values.filter(Boolean))].sort().map((id) => ({
  id,
  label: id.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
}));

interface AdminStudentsTabProps {
  registrations: Registration[];
  organizations: Organization[];
  levels: Level[];
  courses: Course[];
  packages: Package[];
  /** The add-on catalog, for adding add-ons to a job order after registration. */
  addOns: AddOn[];
  onUpdateRegistration: (id: string, data: RegistrationEdits) => Promise<void>;
  onCancelRegistration: (id: string, reason: string) => Promise<void>;
  onRestoreRegistration: (id: string) => Promise<void>;
}

const fixedViews: Record<string, string> = { list: 'All Clients', college: 'College Payment Report', shs: 'SHS Payment Report' };

export function AdminStudentsTab(props: AdminStudentsTabProps) {
  const [view, setView] = useState('list');
  // The payment reports ("Overall" sheets) are per academic level. Besides College and SHS,
  // a level gets a report only once clients are registered under it (e.g. Elementary).
  const directoryViews = { ...fixedViews };
  const levelsInUse = new Set(props.registrations.map((reg) => reg.level).filter(Boolean));
  for (const level of props.levels) {
    const key = overallLevelKey(level.name);
    if (key && !directoryViews[key] && levelsInUse.has(level.id)) directoryViews[key] = `${level.name.trim()} Payment Report`;
  }
  const activeView = directoryViews[view] ? view : 'list';

  return (
    <div className="min-w-0 space-y-6">
      <label className="inline-flex max-w-full flex-wrap items-center gap-2 bg-panel border-2 border-line shadow-lux px-3 py-2 font-mono text-xs font-black uppercase">
        Clients Directory
        <select
          value={activeView}
          onChange={(event) => setView(event.target.value)}
          title="All Clients lists every registration. A Payment Report shows one academic level's packages, payments and balances, like the Overall sheets of the Excel export."
          className="max-w-full border border-line bg-obsidian px-2 py-1.5 text-gold"
        >
          <option value="list">{directoryViews.list}</option>
          <optgroup label="Payment reports by level">
            {Object.entries(directoryViews).filter(([id]) => id !== 'list')
              .map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </optgroup>
        </select>
      </label>
      <div hidden={activeView !== 'list'}>
        <StudentList {...props} />
      </div>
      {activeView !== 'list' && <StudentOverall key={activeView} {...props} level={activeView} title={directoryViews[activeView]} />}
    </div>
  );
}

const StudentList: React.FC<AdminStudentsTabProps> = ({
  registrations,
  organizations,
  levels,
  courses,
  packages,
  addOns,
  onUpdateRegistration,
  onCancelRegistration,
  onRestoreRegistration,
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  // Quick filter next to the search box: everyone, school clients, walk-ins, or one school.
  const [clientGroupFilter, setClientGroupFilter] = useState('all');
  const [filters, setFilters] = useState<StudentFilters>(emptyFilters);
  const [visibleColumnIds, setVisibleColumnIds] = useState(readColumnPreferences);
  const [editingStudent, setEditingStudent] = useState<Registration | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(columnStorageKey, JSON.stringify(visibleColumnIds));
    } catch {
      // Column settings remain usable in this session without local storage.
    }
  }, [visibleColumnIds]);

  const levelNames = useMemo(() => new Map(levels.map(({ id, name }) => [id, levelKey(name)])), [levels]);
  const options = useMemo(() => {
    // Academic levels are school-specific records. A level checkbox covers that name across schools.
    const distinctLevels = new Map<string, string>();
    for (const { name } of levels) {
      const key = levelKey(name);
      if (key && !distinctLevels.has(key)) distinctLevels.set(key, name.trim());
    }
    return {
      school: [
        ...organizations.map(({ id, name, code }) => ({ id, label: code ? `${name} (${code})` : name })),
        ...(registrations.some(isWalkIn) ? [{ id: WALKIN_FILTER, label: 'Walk-in clients' }] : []),
      ],
      level: [...distinctLevels].map(([id, label]) => ({ id, label })),
      queue: statusOptions(registrations.map(({ status }) => status)),
      financial: [
        ...statusOptions(registrations.map(({ payment_status }) => payment_status)),
        // Not a payment status: any job order with money given back (cancelled or overpaid).
        ...(registrations.some(isRefunded) ? [{ id: REFUNDED_FILTER, label: 'Refunded (money given back)' }] : []),
      ],
    };
  }, [levels, organizations, registrations]);

  const toggleFilter = (key: StudentFilterKey, id: string) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id],
    }));
  };

  const toggleColumn = (id: ColumnId) => {
    setVisibleColumnIds((current) => {
      if (!current.includes(id)) return [...current, id];
      return current.length > 1 ? current.filter((item) => item !== id) : current;
    });
  };

  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    id: string;
    name: string;
    jobOrderNo: string | null;
    paidAmount: number;
  }>({
    isOpen: false,
    id: '',
    name: '',
    jobOrderNo: '',
    paidAmount: 0,
  });

  const promptDeleteStudent = (reg: Registration) => {
    setDeleteModalState({
      isOpen: true,
      id: reg.id,
      name: `${reg.given_name} ${reg.family_name}`,
      jobOrderNo: reg.job_order_no,
      paidAmount: reg.paid_amount || 0,
    });
  };

  const [cancelReason, setCancelReason] = useState('');
  const errorMessage = (err: unknown, fallback: string) => (err && typeof err === 'object' && 'response' in err
    ? (err as { response?: { message?: string } }).response?.message : undefined) || (err instanceof Error ? err.message : fallback);
  const handleRestore = async (reg: Registration) => {
    try {
      await onRestoreRegistration(reg.id);
      toast.success('Registration restored.');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to restore the job order'));
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalState.id) return;
    // Throwing keeps the confirmation open so the reason can be fixed.
    if (cancelReason.trim().length < 3) {
      toast.error('Write the reason for cancelling (at least 3 characters).');
      throw new Error('A reason is required.');
    }
    try {
      await onCancelRegistration(deleteModalState.id, cancelReason.trim());
      setCancelReason('');
      toast.success('Registration cancelled.');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to cancel registration'));
      throw err;
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return registrations.filter((r) => {
      if (!matchesClientGroup(r, clientGroupFilter)) return false;
      if (filters.school.length && !filters.school.includes(isWalkIn(r) ? WALKIN_FILTER : r.organization ?? '')) return false;
      if (filters.level.length && !filters.level.includes(levelNames.get(r.level ?? '') ?? '')) return false;
      if (filters.queue.length && !filters.queue.includes(r.status)) return false;
      if (filters.financial.length && !filters.financial.includes(r.payment_status)
        && !(filters.financial.includes(REFUNDED_FILTER) && isRefunded(r))) return false;

      if (q) {
        const fullName = `${r.given_name} ${r.family_name} ${r.middle_name || ''}`.toLowerCase();
        const jo = (r.job_order_no || '').toLowerCase();
        const sid = (r.student_id || '').toLowerCase();
        const sec = (r.section || '').toLowerCase();
        const school = clientSummary(r, true).toLowerCase();
        if (
          !fullName.includes(q) &&
          !jo.includes(q) &&
          !sid.includes(q) &&
          !sec.includes(q) &&
          !school.includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [registrations, searchQuery, filters, levelNames, clientGroupFilter]);

  const cells = {
    student: (reg: Registration) => <>
      <div className="font-bold text-ink">{formatClientName(reg)}</div>
      <div className="text-[10px] text-neutral-500 font-mono">
        {isWalkIn(reg) ? 'Walk-in client' : reg.student_id ? `ID: ${reg.student_id}` : 'No ID recorded'}
      </div>
    </>,
    school: (reg: Registration) => <>
      <div className="font-semibold text-neutral-800">
        {clientGroup(reg) || 'School'}
      </div>
      <div className="text-[10px] text-neutral-500">
        {clientDetail(reg) || 'Degree'}
      </div>
    </>,
    contact: (reg: Registration) => <>
      <div className="font-bold">{reg.section || '—'}</div>
      <div className="text-[10px] text-neutral-500 font-mono">{reg.mobile_number || '—'}{reg.gender ? ` · ${reg.gender === 'male' ? 'Male' : 'Female'}` : ''}</div>
    </>,
    package: (reg: Registration) => {
      const addOns = getRegistrationAddOns(reg.add_ons);
      return (
        <div className="min-w-28">
          <div className="font-bold text-ink">
            {reg.expand?.package?.name || reg.expand?.package?.code || '—'}
          </div>
          <div className="text-[10px] text-neutral-600">
            {reg.expand?.package?.name && reg.expand.package.code ? `${reg.expand.package.code} · ` : ''}
            Billed {formatCurrency(reg.total_amount, { exact: true })}
          </div>
          {addOns.length > 0 && (
            <RegistrationAddOnsDropdown
              addOns={addOns}
              formatAmount={(amount) => formatCurrency(amount, { exact: true })}
              className="mt-1"
            />
          )}
        </div>
      );
    },
    balance: (reg: Registration) => <>
      {reg.balance > 0 ? (
        <span className="text-red-600 font-black">{formatCurrency(reg.balance)}</span>
      ) : (
        <span className="text-emerald-700">✓ Settled</span>
      )}
      {isRefunded(reg) && (
        <div className="text-[10px] font-bold text-neutral-600" title="Money given back to the client (see Analytics → ledger)">
          Refunded {formatCurrency(reg.refunded_amount ?? 0, { exact: true })}
        </div>
      )}
    </>,
    status: (reg: Registration) => <RegistrationStatusBadge status={reg.status} />,
    actions: (reg: Registration) => (
      <div className="flex items-center justify-end gap-1.5">
        {reg.job_order_no && <button
          type="button"
          onClick={() => void import('../../receipts/receiptPdf')
            .then((pdf) => pdf.downloadJobOrderPdfFor(reg, 'Administrator'))
            .catch((err) => { console.error('Failed to generate PDF:', err); toast.error('Could not make the job order PDF.'); })}
          title={isRefunded(reg)
            ? 'Download the signed job order, followed by its refund slips'
            : 'Download the signed job order (claim stub + studio copy)'}
          className="btn-tactile inline-flex items-center gap-1 px-2 py-1 bg-canvas text-ink hover:bg-gold hover:text-on-gold border border-neutral-300 text-[10px] font-bold uppercase cursor-pointer"
        >
          <FileDown className="w-3 h-3 text-gold" />
          <span>PDF</span>
        </button>}
        <button
          type="button"
          onClick={() => setEditingStudent(reg)}
          title="Edit Student Information"
          className="btn-tactile inline-flex items-center gap-1 px-2 py-1 bg-obsidian text-gold hover:bg-neutral-800 text-[10px] font-bold uppercase cursor-pointer"
        >
          <Edit3 className="w-3 h-3" />
          <span>Edit</span>
        </button>
        {reg.status === 'cancelled' ? (
          <button
            type="button"
            onClick={() => void handleRestore(reg)}
            title={`Restore to "${(reg.status_before_cancel || 'paid').replace(/_/g, ' ')}"${reg.cancel_reason ? ` · cancelled: ${reg.cancel_reason}` : ''}`}
            className="btn-tactile inline-flex items-center gap-1 px-2 py-1 bg-panel text-emerald-700 border border-emerald-600 text-[10px] font-bold uppercase cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restore</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => promptDeleteStudent(reg)}
            disabled={reg.status === 'released'}
            title={reg.status === 'released' ? 'Released orders cannot be cancelled' : 'Cancel job order'}
            className="btn-tactile p-1 text-red-600 hover:bg-red-50 border border-neutral-300 hover:border-red-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-neutral-300"
          >
            <Ban className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    ),
  };
  const accessors = {
    student: (reg: Registration) => `${reg.family_name} ${reg.given_name}`,
    school: (reg: Registration) => clientSummary(reg, true),
    contact: (reg: Registration) => `${reg.section || ''} ${reg.mobile_number || ''}`,
    package: (reg: Registration) => reg.expand?.package?.name || reg.expand?.package?.code,
    balance: (reg: Registration) => reg.balance,
    status: (reg: Registration) => reg.status,
  };
  const tableColumns: DataTableColumn<Registration, ColumnId>[] = columns.map(({ id, label, heading, cell }) => ({
    id, header: label, headerClassName: heading, cellClassName: cell, cell: cells[id],
    align: id === 'status' ? 'center' : id === 'actions' || id === 'balance' ? 'right' : 'left',
    sortable: id !== 'actions',
    accessor: id === 'actions' ? undefined : accessors[id],
  }));

  return (
    <div className="space-y-6 animate-enter font-mono text-xs">
      <StudentDirectoryFilters
        query={searchQuery}
        onQueryChange={setSearchQuery}
        searchPlaceholder="Search name, JO №, ID, course, school..."
        quickFilter={(
          // Type to find a school when there are many (e.g. "carlos" or "USC").
          <div className="w-full sm:w-80 shrink-0">
            <ClientGroupFilter id="clients-group-filter" value={clientGroupFilter} onChange={setClientGroupFilter}
              registrations={registrations} organizations={organizations} />
          </div>
        )}
        sections={filterSections}
        filters={filters}
        options={options}
        onToggleFilter={toggleFilter}
        onClearFilters={() => setFilters(emptyFilters)}
        columns={columns}
        visibleColumns={visibleColumnIds}
        onToggleColumn={toggleColumn}
        onResetColumns={() => setVisibleColumnIds(defaultColumns)}
      />

      {/* Student Roster Table */}
      <DataTable
        label="Client Registrations"
        rows={filtered}
        columns={tableColumns}
        visibleColumnIds={visibleColumnIds}
        getRowId={(reg) => reg.id}
        defaultSort={{ column: 'student', direction: 'ascending' }}
        headerClassName="uppercase tracking-wider"
        filtered={Boolean(searchQuery.trim()) || clientGroupFilter !== 'all' || Object.values(filters).some((values) => values.length > 0)}
        emptyMessage="No client registrations yet."
        filteredEmptyMessage="No client registrations match the selected filters."
        toolbar={(
          <div className="p-4 border-b-2 border-line flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gold" />
              <h3 className="font-black text-xs uppercase tracking-wider text-ink">
                Client Registrations
              </h3>
            </div>
            <span className="text-[11px] text-neutral-500 font-bold">
              Showing {filtered.length} of {registrations.length} Clients
            </span>
          </div>
        )}
      />

      {/* Edit Modal */}
      {editingStudent && (
        <EditStudentModal
          registration={editingStudent}
          organizations={organizations}
          courses={courses}
          packages={packages}
          addOnCatalog={addOns}
          onClose={() => setEditingStudent(null)}
          onSave={async (id, data) => {
            try {
              await onUpdateRegistration(id, data);
              toast.success('Student record updated');
              setEditingStudent(null);
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : 'Failed to update student');
            }
          }}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        title={deleteModalState.jobOrderNo ? `Cancel Job Order № ${deleteModalState.jobOrderNo}` : 'Cancel Registration'}
        message={(
          <div className="space-y-3">
            <p>
              Cancel the job order of {deleteModalState.name}? They are removed from every station queue. The job order and
              its receipts stay on file{deleteModalState.paidAmount > 0
                ? ` (₱${deleteModalState.paidAmount.toLocaleString()} already collected stays on record; if money is given back, record it with Refund in Analytics → ledger)`
                : ''}. You can restore it later with the Restore button.
            </p>
            <label className="block">
              <span className="block font-bold mb-1">Reason <span className="text-red-600">*</span></span>
              <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} maxLength={500}
                placeholder="e.g. Client backed out; school moved the pictorial"
                className="w-full p-2 border border-line bg-panel text-ink" />
            </label>
          </div>
        )}
        confirmText="Cancel Job Order"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onClose={() => { setCancelReason(''); setDeleteModalState({ isOpen: false, id: '', name: '', jobOrderNo: '', paidAmount: 0 }); }}
      />
    </div>
  );
};
