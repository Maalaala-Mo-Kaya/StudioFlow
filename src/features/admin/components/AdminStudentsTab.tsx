import React, { useState, useMemo, useEffect } from 'react';
import { Edit3, Trash2, Users, FileDown } from 'lucide-react';
import type { Registration, Organization, Level, Course, Package } from '../../../types';
import { formatCurrency, formatClientName } from '../../../utils/formatters';
import { RegistrationStatusBadge } from '../../../components/RegistrationStatusBadge';
import { EditStudentModal } from './EditStudentModal';
import { generateSignedYellowFormPdf } from '../../../utils/generateSignedPdf';
import { getRegistrationAddOns } from '../../../utils/registrationAddOns';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useToast } from '../../../context/ToastContext';
import { StudentDirectoryFilters } from './StudentDirectoryFilters';
import { StudentOverall } from './StudentOverall';
import { RegistrationAddOnsDropdown } from './RegistrationAddOnsDropdown';

const filterSections = [
  { key: 'school', title: 'Schools & Organizations' },
  { key: 'level', title: 'Select Academic Level' },
  { key: 'queue', title: 'Queue Statuses' },
  { key: 'financial', title: 'Financial Statuses' },
] as const;
type StudentFilterKey = typeof filterSections[number]['key'];
type StudentFilters = Record<StudentFilterKey, string[]>;

const columns = [
  { id: 'student', label: 'Student Name', heading: '', cell: '' },
  { id: 'school', label: 'School & Course', heading: '', cell: '' },
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
  onUpdateRegistration: (id: string, data: Partial<Registration>) => Promise<void>;
  onDeleteRegistration: (id: string) => Promise<void>;
}

const directoryViews = { list: 'Student List', college: 'College Overall', shs: 'SHS Overall' } as const;
type DirectoryView = keyof typeof directoryViews;

export function AdminStudentsTab(props: AdminStudentsTabProps) {
  const [view, setView] = useState<DirectoryView>('list');

  return (
    <div className="min-w-0 space-y-6">
      <label className="inline-flex max-w-full flex-wrap items-center gap-2 bg-white border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A] px-3 py-2 font-mono text-xs font-black uppercase">
        Students Directory
        <select
          value={view}
          onChange={(event) => setView(event.target.value as DirectoryView)}
          className="max-w-full border border-[#0A0A0A] bg-[#0A0A0A] px-2 py-1.5 text-[#C9A227]"
        >
          {Object.entries(directoryViews).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <div hidden={view !== 'list'}>
        <StudentList {...props} />
      </div>
      {view !== 'list' && <StudentOverall key={view} {...props} level={view} title={directoryViews[view]} />}
    </div>
  );
}

const StudentList: React.FC<AdminStudentsTabProps> = ({
  registrations,
  organizations,
  levels,
  courses,
  packages,
  onUpdateRegistration,
  onDeleteRegistration,
}) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<StudentFilters>(emptyFilters);
  const [visibleColumnIds, setVisibleColumnIds] = useState(readColumnPreferences);
  const visibleColumns = columns.filter(({ id }) => visibleColumnIds.includes(id));
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
      school: organizations.map(({ id, name, code }) => ({ id, label: code ? `${name} (${code})` : name })),
      level: [...distinctLevels].map(([id, label]) => ({ id, label })),
      queue: statusOptions(registrations.map(({ status }) => status)),
      financial: statusOptions(registrations.map(({ payment_status }) => payment_status)),
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
    jobOrderNo: string;
  }>({
    isOpen: false,
    id: '',
    name: '',
    jobOrderNo: '',
  });

  const promptDeleteStudent = (reg: Registration) => {
    setDeleteModalState({
      isOpen: true,
      id: reg.id,
      name: `${reg.given_name} ${reg.family_name}`,
      jobOrderNo: reg.job_order_no,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalState.id) return;
    try {
      await onDeleteRegistration(deleteModalState.id);
      toast.success(`Registration JO № ${deleteModalState.jobOrderNo} cancelled`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete registration');
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return registrations.filter((r) => {
      if (filters.school.length && !filters.school.includes(r.organization ?? '')) return false;
      if (filters.level.length && !filters.level.includes(levelNames.get(r.level ?? '') ?? '')) return false;
      if (filters.queue.length && !filters.queue.includes(r.status)) return false;
      if (filters.financial.length && !filters.financial.includes(r.payment_status)) return false;

      if (q) {
        const fullName = `${r.given_name} ${r.family_name} ${r.middle_name || ''}`.toLowerCase();
        const jo = (r.job_order_no || '').toLowerCase();
        const sid = (r.student_id || '').toLowerCase();
        const sec = (r.section || '').toLowerCase();
        const school = (r.expand?.organization?.name || '').toLowerCase();
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
  }, [registrations, searchQuery, filters, levelNames]);

  return (
    <div className="space-y-6 animate-enter font-mono text-xs">
      <StudentDirectoryFilters
        query={searchQuery}
        onQueryChange={setSearchQuery}
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
      <div className="bg-white border-2 border-[#0A0A0A] shadow-[6px_6px_0px_#0A0A0A] overflow-hidden">
        <div className="p-4 border-b-2 border-[#0A0A0A] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#C9A227]" />
            <h3 className="font-black text-xs uppercase tracking-wider text-[#0A0A0A]">
              Student Registrations
            </h3>
          </div>
          <span className="text-[11px] text-neutral-500 font-bold">
            Showing {filtered.length} of {registrations.length} Students
          </span>
        </div>

        <div role="region" aria-label="Student Registrations table" tabIndex={0} className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0A0A0A] text-[#C9A227] text-[10px] uppercase font-black tracking-wider border-b-2 border-[#0A0A0A]">
                {visibleColumns.map(({ id, label, heading }) => (
                  <th key={id} scope="col" className={`py-2.5 px-3 ${heading}`}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-12 text-center text-neutral-400 font-mono">
                    No student registrations match the selected filters.
                  </td>
                </tr>
              ) : (
                filtered.map((reg) => {
                  const addOns = getRegistrationAddOns(reg.add_ons);
                  const cells = {
                    student: <>
                      <div className="font-bold text-[#0A0A0A]">{formatClientName(reg)}</div>
                      <div className="text-[10px] text-neutral-500 font-mono">
                        {reg.student_id ? `ID: ${reg.student_id}` : 'No ID recorded'}
                      </div>
                    </>,
                    school: <>
                      <div className="font-semibold text-neutral-800">
                        {reg.expand?.organization?.code || reg.expand?.organization?.name || 'School'}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        {reg.expand?.course?.code || reg.course || 'Degree'}
                      </div>
                    </>,
                    contact: <>
                      <div className="font-bold">{reg.section || '—'}</div>
                      <div className="text-[10px] text-neutral-500 font-mono">{reg.mobile_number}</div>
                    </>,
                    package: <>
                      <div className="min-w-28">
                        <div className="font-bold text-[#0A0A0A]">
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
                    </>,
                    balance: reg.balance > 0 ? (
                        <span className="text-red-600 font-black">{formatCurrency(reg.balance)}</span>
                      ) : (
                        <span className="text-emerald-700">✓ Settled</span>
                      ),
                    status: <RegistrationStatusBadge status={reg.status} />,
                    actions: (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => generateSignedYellowFormPdf(reg, { copyType: 'customer', autoDownload: true })}
                          title="Download Signed PDF Yellow Form (T041)"
                          className="btn-tactile inline-flex items-center gap-1 px-2 py-1 bg-[#F8F7F4] text-[#0A0A0A] hover:bg-[#C9A227] hover:text-[#0A0A0A] border border-neutral-300 text-[10px] font-bold uppercase cursor-pointer"
                        >
                          <FileDown className="w-3 h-3 text-[#C9A227]" />
                          <span>PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingStudent(reg)}
                          title="Edit Student Information"
                          className="btn-tactile inline-flex items-center gap-1 px-2 py-1 bg-[#0A0A0A] text-[#C9A227] hover:bg-neutral-800 text-[10px] font-bold uppercase cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => promptDeleteStudent(reg)}
                          title="Cancel/Delete Registration"
                          className="btn-tactile p-1 text-red-600 hover:bg-red-50 border border-neutral-300 hover:border-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ),
                  };
                  return (
                    <tr key={reg.id} className="hover:bg-[#F8F7F4] transition-colors">
                      {visibleColumns.map(({ id, cell }) => (
                        <td key={id} className={`py-2.5 px-3 ${cell}`}>{cells[id]}</td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingStudent && (
        <EditStudentModal
          registration={editingStudent}
          organizations={organizations}
          courses={courses}
          packages={packages}
          onClose={() => setEditingStudent(null)}
          onSave={async (id, data) => {
            try {
              await onUpdateRegistration(id, data);
              toast.success('Student record updated');
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : 'Failed to update student');
            }
          }}
        />
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModalState.isOpen}
        title={`Cancel Registration: JO № ${deleteModalState.jobOrderNo}`}
        message={`Are you sure you want to cancel and delete the registration for ${deleteModalState.name}? This will remove the participant from the active queue.`}
        confirmText="Confirm Delete"
        isDestructive={true}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteModalState({ isOpen: false, id: '', name: '', jobOrderNo: '' })}
      />
    </div>
  );
};
