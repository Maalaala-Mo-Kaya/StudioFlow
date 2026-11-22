import React, { useState, useMemo } from 'react';
import { UploadCloud, CheckCircle2, Search } from 'lucide-react';
import { RecordActionButton } from '../../../components/common/RecordActionButton';
import type { Organization, MasterListItem } from '../../../types';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { useToast } from '../../../context/ToastContext';
import { DataTable, tableFilterControl } from '../../../components/common/DataTable';
import type { DataTableColumn } from '../../../components/common/DataTable';
import { parseRosterCsv, type RosterImportResult, type RosterImportRow } from '../../../utils/csv';

interface AdminRosterTabProps {
  organizations: Organization[];
  masterList: MasterListItem[];
  rosterOrgId: string;
  onRosterOrgIdChange: (val: string) => void;
  csvText: string;
  onCsvTextChange: (val: string) => void;
  onImportRoster: (organization: string, rows: RosterImportRow[]) => Promise<RosterImportResult>;
  onDeleteMasterListItem: (id: string) => Promise<void>;
  onClearMasterList: (orgId: string) => Promise<void>;
}

export const AdminRosterTab: React.FC<AdminRosterTabProps> = ({
  organizations,
  masterList,
  rosterOrgId,
  onRosterOrgIdChange,
  csvText,
  onCsvTextChange,
  onImportRoster,
  onDeleteMasterListItem,
  onClearMasterList,
}) => {
  const { toast } = useToast();
  const [searchRoster, setSearchRoster] = useState('');
  const [importing, setImporting] = useState(false);
  const [rejections, setRejections] = useState<RosterImportResult['rejected']>([]);

  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: async () => {},
  });

  const selectedOrg = organizations.find((o) => o.id === rosterOrgId);

  const parsedPreview = useMemo(() => parseRosterCsv(csvText), [csvText]);
  const validRowCount = parsedPreview.filter((row) => !row.error).length;
  const previewColumns: DataTableColumn<RosterImportRow>[] = [
    { id: 'name', header: 'Name', accessor: (row) => row.fields.full_name, cellClassName: 'font-bold' },
    { id: 'studentId', header: 'ID', accessor: (row) => row.fields.student_id },
    { id: 'section', header: 'Section', accessor: (row) => row.fields.section },
    { id: 'email', header: 'Email', accessor: (row) => row.fields.email },
    { id: 'mobile', header: 'Mobile', accessor: (row) => row.fields.mobile_number },
    { id: 'status', header: 'Status', accessor: (row) => row.error ?? 'Ready' },
  ];

  const scopedRoster = useMemo(() => {
    if (rosterOrgId !== 'unassigned') return masterList.filter((item) => item.organization === rosterOrgId);
    const schoolIds = new Set(organizations.map((org) => org.id));
    return masterList.filter((item) => !item.organization || !schoolIds.has(item.organization));
  }, [masterList, organizations, rosterOrgId]);

  const orgMasterList = useMemo(() => {
    return scopedRoster.filter((item) => {
      if (searchRoster.trim()) {
        const q = searchRoster.toLowerCase();
        return (
          item.full_name.toLowerCase().includes(q) ||
          (item.student_id && item.student_id.toLowerCase().includes(q)) ||
          (item.section && item.section.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [scopedRoster, searchRoster]);

  const handleImport = async () => {
    if (!selectedOrg || importing) return;
    setImporting(true);
    try {
      const { saved, rejected } = await onImportRoster(selectedOrg.id, parsedPreview);
      setRejections(rejected);
      onCsvTextChange(rejected.map(({ row }) => row.source).join('\n'));
      const summary = `Imported ${saved} roster records. Rejected ${rejected.length}.`;
      if (rejected.length) toast.error(summary);
      else toast.success(summary);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const promptClearRoster = () => {
    setConfirmModalState({
      isOpen: true,
      title: `Clear School Roster: ${selectedOrg?.name || 'School'}`,
      message: `Are you sure you want to delete all ${scopedRoster.length} master roster records for ${selectedOrg?.name}? This action cannot be undone.`,
      action: async () => {
        try {
          await onClearMasterList(rosterOrgId);
          toast.success('School roster cleared');
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Failed to clear roster');
        }
      },
    });
  };

  const promptDeleteItem = (item: MasterListItem) => {
    setConfirmModalState({
      isOpen: true,
      title: `Delete Roster Entry: ${item.full_name}`,
      message: `Are you sure you want to remove ${item.full_name} (${item.student_id || 'No ID'}) from the master roster?`,
      action: async () => {
        try {
          await onDeleteMasterListItem(item.id);
          toast.success(`Removed ${item.full_name}`);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Failed to delete roster entry');
        }
      },
    });
  };

  const rosterColumns: DataTableColumn<MasterListItem>[] = [
    { id: 'name', header: 'Name', sortable: true, accessor: (item) => item.full_name, cellClassName: 'font-bold uppercase' },
    { id: 'student', header: 'Student ID', sortable: true, accessor: (item) => item.student_id },
    { id: 'section', header: 'Section', sortable: true, accessor: (item) => item.section },
    { id: 'mobile', header: 'Mobile', accessor: (item) => item.mobile_number },
    { id: 'actions', header: 'Actions', cell: (item) => (
      <RecordActionButton variant="delete" recordName={`roster record for ${item.full_name}`} onClick={() => promptDeleteItem(item)} />
    ) },
  ];

  return (
    <div className="space-y-8 animate-enter font-mono text-xs">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
        {/* Ingestion & Parser */}
        <div className="min-w-0 bg-panel border-2 border-line shadow-lux p-6 space-y-4">
          <div className="pb-3 border-b-2 border-line flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-ink flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-gold" />
              <span>Bulk Roster Ingestion</span>
            </h3>
          </div>

          <div>
            <label htmlFor="roster-school" className="block text-[11px] font-black uppercase mb-1">
              Target Organization / School
            </label>
            <select
              id="roster-school"
              value={rosterOrgId}
              disabled={importing}
              onChange={(e) => onRosterOrgIdChange(e.target.value)}
              className="w-full p-2.5 bg-panel border border-line font-bold"
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.code || 'ORG'})
                </option>
              ))}
              <option value="unassigned">No school assigned</option>
            </select>
          </div>

          <div>
            <label htmlFor="roster-paste" className="block text-[11px] font-black uppercase mb-1">
              Paste CSV / Tab-Delimited Rows
            </label>
            <p className="text-[10px] text-neutral-500 mb-2">
              Format: <code>Full Name, Student ID, Section, Email, Mobile</code>
            </p>
            <textarea
              id="roster-paste"
              rows={6}
              placeholder="Claire Varlo, 2026-001, BSCS-4A, claire@example.com, 0917-111-2222&#10;John Dela Cruz, 2026-002, STEM-12, john@example.com, 0918-333-4444"
              value={csvText}
              disabled={importing}
              onChange={(e) => {
                onCsvTextChange(e.target.value);
                setRejections([]);
              }}
              className="w-full text-xs font-mono p-3 border border-neutral-400 bg-canvas focus:bg-panel"
            />
          </div>

          {rejections.length > 0 && (
            <ul aria-label="Rejected roster rows" className="list-disc space-y-1 pl-5 text-red-700">
              {rejections.map(({ row, message }) => (
                <li key={row.line}>Original line {row.line}{row.fields.full_name ? ` (${row.fields.full_name})` : ''}. {message}</li>
              ))}
            </ul>
          )}

          {parsedPreview.length > 0 && (
            <div className="border border-neutral-300 p-3 bg-canvas space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold">
                  Preview: {validRowCount} valid of {parsedPreview.length} lines
                </span>
                <span className={validRowCount === parsedPreview.length ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                  {validRowCount === parsedPreview.length ? 'Ready to import' : 'Some rows need corrections'}
                </span>
              </div>

              <DataTable
                label="Roster import preview"
                rows={parsedPreview}
                columns={previewColumns}
                getRowId={(row) => row.line}
                viewportClassName="max-h-[140px]"
                className="border! border-neutral-200! shadow-none!"
                headerClassName="uppercase"
                rowClassName={(row) => row.error ? 'bg-red-50 text-red-700' : ''}
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleImport}
            disabled={!selectedOrg || validRowCount === 0 || importing}
            className="btn-tactile w-full py-2.5 bg-obsidian text-gold border border-line font-black uppercase tracking-wider cursor-pointer disabled:opacity-40"
          >
            {importing ? 'Importing…' : `Commit Ingestion (${validRowCount} Ready)`}
          </button>
        </div>

        {/* SECTION 2: ROSTER DIRECTORY & SEARCH */}
        <div className="min-w-0 bg-panel border-2 border-line shadow-lux p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="pb-3 border-b-2 border-line flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-[0.15em] text-ink flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-gold" />
                <span>Master List Directory</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] bg-obsidian text-gold px-2 py-0.5 font-bold">
                  {orgMasterList.length} Students
                </span>
                {selectedOrg && scopedRoster.length > 0 && (
                  <button
                    type="button"
                    onClick={promptClearRoster}
                    className="px-2 py-1 text-[10px] font-bold uppercase text-red-600 border border-red-300 hover:bg-red-50 cursor-pointer"
                  >
                    Clear Roster
                  </button>
                )}
              </div>
            </div>

            <DataTable label="Master roster records" rows={orgMasterList} columns={rosterColumns}
              getRowId={(item) => item.id} pagination={false} viewportClassName="max-h-[380px]"
              tableClassName="min-w-[410px]" headerClassName="uppercase" filtered={Boolean(searchRoster.trim())}
              emptyMessage={selectedOrg ? `No roster entries found for ${selectedOrg.name}.` : 'No roster entries without a school.'}
              toolbar={<div className="relative p-2">
                <Search aria-hidden="true" className="pointer-events-none absolute left-5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
                <input type="search" aria-label="Search roster" value={searchRoster}
                  onChange={(event) => setSearchRoster(event.target.value)}
                  placeholder="Search by student name, ID, or section"
                  className={`${tableFilterControl} w-full pl-8`} />
              </div>}
            />
          </div>

          <div className="mt-4 pt-3 border-t border-neutral-200 flex justify-between items-center text-neutral-500 text-[10px]">
            <span>School: <strong>{selectedOrg?.name || 'Unassigned'}</strong></span>
            <span>Total Ingested: <strong>{masterList.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModalState.isOpen}
        title={confirmModalState.title}
        message={confirmModalState.message}
        confirmText="Confirm"
        isDestructive={true}
        onConfirm={confirmModalState.action}
        onClose={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
