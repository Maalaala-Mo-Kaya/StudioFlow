import React, { useEffect, useMemo, useState } from 'react';
import { Frame, Copy, Check, Layers, MessageSquare, Save } from 'lucide-react';
import type { Registration, ProductionStatus } from '../../../types';
import { formatClientName, formatCurrency, orderInclusions } from '../../../utils/formatters';
import { getPhotoFolderPath, copyFolderPathToClipboard } from '../../../utils/folderPath';
import { useToast } from '../../../context/ToastContext';
import { workflowError } from '../../../hooks/useWorkflowData';
import { DataTable } from '../../../components/common/DataTable';
import type { DataTableColumn } from '../../../components/common/DataTable';
import { ConfirmModal } from '../../../components/common/ConfirmModal';
import { clientDetail, clientGroup } from '../../../utils/clientInfo';
import { StudentDirectoryFilters } from './StudentDirectoryFilters';
import { ClientGroupFilter } from '../../../components/common/ClientGroupFilter';
import { ALL_CLIENTS, matchesClientGroup, SCHOOL_CLIENTS, WALKIN_CLIENTS } from '../../../utils/clientGroup';
import { isPhotographed, isReadyForRelease } from '../../../utils/releaseReadiness';
import { useStudioSettings } from '../../../hooks/useStudioSettings';
import { pb } from '../../../db/pocketbase';
import { PickupNoticeInfo } from '../../cashier/components/PickupNoticeInfo';
import { buildPickupMessage, PICKUP_PLACEHOLDERS, studioTime } from '../../../utils/pickupMessage';

interface AdminProductionTabProps {
  registrations: Registration[];
  onSetProductionStatus: (ids: string[], status: ProductionStatus) => Promise<void>;
}

type Stage = ProductionStatus | 'released';

const STAGE_LABELS: Record<Stage, string> = {
  none: 'Not Started',
  pending_framing: 'Pending',
  in_production: 'In Production',
  framed: 'Framed',
  ready_for_pickup: 'Ready for Pickup',
  released: 'Released',
};
const SETTABLE: ProductionStatus[] = ['none', 'pending_framing', 'in_production', 'framed', 'ready_for_pickup'];
const READY_STAGES = new Set<Stage>(['framed', 'ready_for_pickup']);

// Advanced Filters panel (same panel as Clients Directory and the cashier).
const filterSections = [
  { key: 'level', title: 'Academic Level' },
  { key: 'course', title: 'Course / Session' },
  { key: 'stage', title: 'Production Stage' },
  { key: 'frames', title: 'Frames' },
  { key: 'shoot', title: 'Photoshoot' },
  { key: 'payment', title: 'Payment' },
] as const;
type FilterKey = typeof filterSections[number]['key'];
type Filters = Record<FilterKey, string[]>;
const emptyFilters: Filters = { level: [], course: [], stage: [], frames: [], shoot: [], payment: [] };

const STAGE_FILTERS = {
  waiting: 'Not Started / Pending',
  in_production: 'In Production',
  ready: 'Ready for Pickup (Framed / Ready)',
  not_notified: 'Ready, Client Not Notified',
  released: 'Released',
} as const;
type StageFilter = keyof typeof STAGE_FILTERS;
const fixedOptions = {
  stage: Object.entries(STAGE_FILTERS).map(([id, label]) => ({ id, label })),
  frames: [{ id: 'with', label: 'With frames' }, { id: 'without', label: 'Without frames' }],
  shoot: [{ id: 'done', label: 'Photoshoot done' }, { id: 'not_yet', label: 'Not photographed yet' }],
  payment: [{ id: 'paid', label: 'Fully paid' }, { id: 'balance', label: 'With balance' }],
};

/** True when the order is in one of the stage filter's groups. */
function inStageFilter(reg: Registration, filter: string): boolean {
  const stage = stageOf(reg);
  switch (filter as StageFilter) {
    case 'waiting': return stage === 'none' || stage === 'pending_framing';
    case 'in_production': return stage === 'in_production';
    case 'ready': return READY_STAGES.has(stage);
    case 'not_notified': return READY_STAGES.has(stage) && !reg.pickup_notified_at;
    case 'released': return stage === 'released';
    default: return false;
  }
}

/** True when the order passes every Advanced Filters section that has ticks. */
function matchesFilters(reg: Registration, filters: Filters): boolean {
  const any = (key: FilterKey, test: (value: string) => boolean) => !filters[key].length || filters[key].some(test);
  return any('level', (value) => levelName(reg) === value)
    && any('course', (value) => clientDetail(reg) === value)
    && any('stage', (value) => inStageFilter(reg, value))
    && any('frames', (value) => (value === 'with') === (frameItems(reg).length > 0))
    && any('shoot', (value) => (value === 'done') === isPhotographed(reg))
    && any('payment', (value) => (value === 'balance') === (reg.balance > 0));
}

// Columns the admin can hide (select box, JO № and production status always show).
const toggleableColumns = [
  { id: 'name', label: 'Client' },
  { id: 'frames', label: 'Frames' },
  { id: 'payment', label: 'Payment' },
  { id: 'shoot', label: 'Photoshoot' },
  { id: 'pickup', label: 'Pickup Notice' },
  { id: 'folder', label: 'Photo Folder' },
] as const;
type ToggleableColumn = typeof toggleableColumns[number]['id'];
const allToggleable: ToggleableColumn[] = toggleableColumns.map(({ id }) => id);
const COLUMNS_KEY = 'studioflow.production.visibleColumns';
function readColumns(): ToggleableColumn[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? 'null');
    const valid = Array.isArray(saved) ? allToggleable.filter((id) => saved.includes(id)) : [];
    if (valid.length) return valid;
  } catch {
    // Storage unavailable: show every column.
  }
  return allToggleable;
}

/** The production stage shown for an order (released and older "completed" orders included). */
function stageOf(reg: Registration): Stage {
  if (reg.status === 'released') return 'released';
  if (isReadyForRelease(reg)) return reg.framing_status === 'framed' ? 'framed' : 'ready_for_pickup';
  const status = reg.framing_status;
  return status && status !== 'released' ? status : 'none';
}

/** Frame items in the package or add-ons. */
function frameItems(reg: Registration): string[] {
  const items = orderInclusions(reg).filter((item) => /frame/i.test(item));
  const packageName = reg.package_snapshot?.name || reg.expand?.package?.name || '';
  if (/frame/i.test(packageName) && !items.length) items.push(packageName);
  for (const addOn of reg.add_ons || []) {
    if (/frame/i.test(addOn.name) || /frame/i.test(addOn.code || '')) items.push(addOn.name);
  }
  return items;
}

const levelName = (reg: Registration) => reg.expand?.level?.name || (reg.client_kind === 'walkin' ? 'Walk-in' : '');
const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

/**
 * Production & Pickup: track every paid order from shoot to pickup. Admins set the stage of
 * one order or of a whole group at once (e.g. every ACLC College order is In Production).
 * Release happens at the cashier, which records who claimed the order.
 */
export const AdminProductionTab: React.FC<AdminProductionTabProps> = ({ registrations, onSetProductionStatus }) => {
  const { toast } = useToast();
  const [filterGroup, setFilterGroup] = useState(ALL_CLIENTS);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [visibleColumns, setVisibleColumns] = useState<ToggleableColumn[]>(readColumns);
  const [search, setSearch] = useState('');
  useEffect(() => {
    try { localStorage.setItem(COLUMNS_KEY, JSON.stringify(visibleColumns)); } catch { /* optional */ }
  }, [visibleColumns]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ProductionStatus>('in_production');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [folder, setFolder] = useState<{ id: string; path: string }>();

  // Paid orders only: unpaid and cancelled job orders have nothing to produce.
  const orders = useMemo(
    () => registrations.filter((reg) => reg.status !== 'pending_payment' && reg.status !== 'cancelled'),
    [registrations],
  );

  const inGroup = orders.filter((reg) => matchesClientGroup(reg, filterGroup));
  const groupNames: Record<string, string> = {
    [ALL_CLIENTS]: 'all clients', [SCHOOL_CLIENTS]: 'school clients', [WALKIN_CLIENTS]: 'walk-in clients',
  };
  const groupLabel = groupNames[filterGroup] ?? (inGroup[0] ? clientGroup(inGroup[0], true) : 'this school');
  // Level and course choices come from the chosen school / walk-ins.
  const filterOptions = {
    level: uniqueSorted(inGroup.map(levelName)).map((level) => ({ id: level, label: level })),
    course: uniqueSorted(inGroup.map((reg) => clientDetail(reg))).map((course) => ({ id: course, label: course })),
    ...fixedOptions,
  };
  const toggleFilter = (key: FilterKey, id: string) => setFilters((current) => ({
    ...current,
    [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id],
  }));
  const toggleColumn = (id: ToggleableColumn) => setVisibleColumns((current) => {
    if (!current.includes(id)) return [...current, id];
    return current.length > 1 ? current.filter((item) => item !== id) : current;
  });

  const metrics = useMemo(() => {
    const count = (test: (reg: Registration) => boolean) => orders.filter(test).length;
    return {
      waiting: count((reg) => ['none', 'pending_framing'].includes(stageOf(reg))),
      inProduction: count((reg) => stageOf(reg) === 'in_production'),
      ready: count((reg) => READY_STAGES.has(stageOf(reg))),
      notNotified: count((reg) => READY_STAGES.has(stageOf(reg)) && !reg.pickup_notified_at),
      released: count((reg) => stageOf(reg) === 'released'),
    };
  }, [orders]);

  const q = search.trim().toLowerCase();
  const filtered = inGroup.filter((reg) => matchesFilters(reg, filters)
    && (!q || `${reg.job_order_no} ${reg.given_name} ${reg.family_name}`.toLowerCase().includes(q)));
  const selectable = filtered.filter((reg) => reg.status !== 'released');
  const selectedShown = selectable.filter((reg) => selected.has(reg.id));
  const allShownSelected = selectable.length > 0 && selectedShown.length === selectable.length;
  // Bulk changes apply to the ticked orders, or to every order shown when none are ticked.
  const targets = selected.size ? [...selected] : selectable.map((reg) => reg.id);
  const filtersActive = filterGroup !== ALL_CLIENTS || Object.values(filters).some((values) => values.length > 0) || !!q;
  // Names the group the bulk change applies to, e.g. "ACLC College of Mandaue · College · BSIT".
  const listed = (values: string[]) => (values.length > 2 ? `${values.length} selected` : values.join(', '));
  const scopeLabel = [groupLabel, listed(filters.level), listed(filters.course),
    filters.stage.map((value) => STAGE_FILTERS[value as StageFilter]).join(', ')].filter(Boolean).join(' · ');

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllShown = () => setSelected((current) => {
    const next = new Set(current);
    for (const reg of selectable) {
      if (allShownSelected) next.delete(reg.id); else next.add(reg.id);
    }
    return next;
  });

  const setOne = async (reg: Registration, status: ProductionStatus) => {
    setBusyId(reg.id);
    try { await onSetProductionStatus([reg.id], status); } finally { setBusyId(''); }
  };
  const applyBulk = async () => {
    await onSetProductionStatus(targets, bulkStatus);
    setSelected(new Set());
  };

  const handleCopy = async (reg: Registration) => {
    try {
      const path = await getPhotoFolderPath(reg.id);
      if (await copyFolderPathToClipboard(path)) {
        setCopiedId(reg.id);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        setFolder({ id: reg.id, path });
      }
    } catch (error) {
      toast.error(workflowError(error));
    }
  };

  const columns: DataTableColumn<Registration>[] = [
    {
      id: 'select',
      header: (
        <input type="checkbox" aria-label="Select all shown orders" checked={allShownSelected}
          onChange={toggleAllShown} disabled={!selectable.length} className="w-4 h-4 accent-gold cursor-pointer" />
      ),
      cell: (reg) => (
        <input type="checkbox" aria-label={`Select JO ${reg.job_order_no}`} checked={selected.has(reg.id)}
          onChange={() => toggle(reg.id)} disabled={reg.status === 'released'} className="w-4 h-4 accent-gold cursor-pointer" />
      ),
    },
    {
      id: 'job', header: 'JO №', sortable: true, accessor: (reg) => reg.job_order_no,
      cellClassName: 'font-mono',
      cell: (reg) => <div className="font-black text-red-600">{reg.job_order_no}</div>,
    },
    {
      id: 'name', header: 'Client', sortable: true,
      accessor: (reg) => `${reg.family_name} ${reg.given_name}`,
      cell: (reg) => (
        <>
          <div className="font-black uppercase text-ink">{formatClientName(reg)}</div>
          <div className="text-[11px] text-neutral-500">
            {clientGroup(reg)}{levelName(reg) && levelName(reg) !== 'Walk-in' ? ` · ${levelName(reg)}` : ''} · {clientDetail(reg) || '—'}
          </div>
        </>
      ),
    },
    {
      id: 'frames', header: 'Frames', sortable: true, accessor: (reg) => frameItems(reg).join(' '),
      cell: (reg) => {
        const items = frameItems(reg);
        return items.length ? (
          <div className="space-y-1">
            {items.map((item, index) => (
              <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] font-bold bg-gold-wash border border-line text-ink">
                <Frame className="w-3 h-3 text-gold" /> {item}
              </span>
            ))}
          </div>
        ) : <span className="text-[10px] text-neutral-500 uppercase">No frame</span>;
      },
    },
    {
      id: 'payment', header: 'Payment', sortable: true, accessor: (reg) => reg.balance,
      cellClassName: 'font-mono',
      cell: (reg) => reg.balance > 0
        ? <span className="text-red-600 font-black text-[11px]">Bal: {formatCurrency(reg.balance)}</span>
        : <span className="text-emerald-700 font-black text-[11px]">✓ Paid</span>,
    },
    {
      id: 'shoot', header: 'Photoshoot', sortable: true, accessor: (reg) => (isPhotographed(reg) ? 1 : 0),
      cell: (reg) => isPhotographed(reg)
        ? <span className="text-emerald-700 font-black text-[11px]">✓ Done</span>
        : <span className="text-amber-700 font-black text-[11px] uppercase">Not yet</span>,
    },
    {
      id: 'stage', header: 'Production Status', sortable: true, accessor: (reg) => SETTABLE.indexOf(stageOf(reg) as ProductionStatus),
      cell: (reg) => {
        const stage = stageOf(reg);
        if (stage === 'released') {
          return (
            <div className="text-[11px]">
              <div className="font-black uppercase text-neutral-700">Released</div>
              <div className="text-neutral-500">to {reg.claimed_by || '—'}{reg.released_at ? ` · ${studioTime(reg.released_at)}` : ''}</div>
            </div>
          );
        }
        return (
          <select
            aria-label={`Production status for JO ${reg.job_order_no}`}
            value={stage}
            disabled={busyId === reg.id}
            onChange={(e) => void setOne(reg, e.target.value as ProductionStatus)}
            className={`p-1 font-mono text-xs font-bold uppercase border border-line focus:outline-hidden ${
              READY_STAGES.has(stage) ? 'bg-emerald-50 text-emerald-800' : 'bg-panel'}`}
          >
            {SETTABLE.map((status) => (
              <option key={status} value={status} disabled={READY_STAGES.has(status) && !isPhotographed(reg)}>
                {STAGE_LABELS[status]}{READY_STAGES.has(status) && !isPhotographed(reg) ? ' (after photoshoot)' : ''}
              </option>
            ))}
          </select>
        );
      },
    },
    {
      id: 'pickup', header: 'Pickup Notice', sortable: true, accessor: (reg) => reg.pickup_notified_at || reg.ready_at || '',
      cell: (reg) => READY_STAGES.has(stageOf(reg)) ? <PickupNoticeInfo reg={reg} /> : <span className="text-neutral-400">—</span>,
    },
    {
      id: 'folder', header: 'Photo Folder', align: 'right',
      cell: (reg) => folder?.id === reg.id ? (
        <input aria-label="Pictorial folder path" value={folder.path} type="text" readOnly autoFocus
          onFocus={(event) => event.target.select()} onBlur={() => setFolder(undefined)}
          className="w-full min-w-40 border border-neutral-400 bg-panel p-1 font-mono text-xs" />
      ) : (
        <button type="button" onClick={() => void handleCopy(reg)}
          className="btn-tactile inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-bold uppercase bg-obsidian text-gold hover:bg-neutral-800 cursor-pointer">
          {copiedId === reg.id ? <><Check className="w-3.5 h-3.5 text-emerald-400" /><span>Copied</span></> : <><Copy className="w-3.5 h-3.5" /><span>Copy Path</span></>}
        </button>
      ),
    },
  ];

  // A card shows only its stage; clicking it again shows every stage.
  const card = (label: string, value: number, tone: string, filter: StageFilter) => {
    const on = filters.stage.length === 1 && filters.stage[0] === filter;
    return (
    <button type="button" aria-pressed={on}
      onClick={() => setFilters((current) => ({ ...current, stage: on ? [] : [filter] }))}
      className={`p-4 text-left bg-panel border-2 shadow-lux cursor-pointer ${on ? 'border-gold' : 'border-line'}`}>
      <span className={`text-[10px] font-bold uppercase block ${tone}`}>{label}</span>
      <span className="text-2xl font-black text-ink">{value}</span>
    </button>
    );
  };

  return (
    <div className="space-y-6 animate-enter-delay-2">
      {/* Stage overview: click a card to filter. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 font-mono">
        {card('Not Started / Pending', metrics.waiting, 'text-amber-700', 'waiting')}
        {card('In Production', metrics.inProduction, 'text-blue-700', 'in_production')}
        {card('Ready for Pickup', metrics.ready, 'text-emerald-700', 'ready')}
        {card('Ready, Not Notified', metrics.notNotified, 'text-red-700', 'not_notified')}
        {card('Released / Claimed', metrics.released, 'text-neutral-500', 'released')}
      </div>

      {/* Filters: same row as Clients Directory and the cashier (funnel, school picker, search). */}
      <div className="relative z-20 font-mono text-xs">
        <StudentDirectoryFilters
          query={search}
          onQueryChange={setSearch}
          searchPlaceholder="Search JO № or name..."
          searchLabel="Search job orders"
          quickFilter={(
            <div className="w-full sm:w-72 shrink-0">
              <ClientGroupFilter id="production-client-group" value={filterGroup} registrations={orders}
                onChange={(value) => { setFilterGroup(value); setFilters((current) => ({ ...current, level: [], course: [] })); }} />
            </div>
          )}
          sections={filterSections}
          filters={filters}
          options={filterOptions}
          onToggleFilter={toggleFilter}
          onClearFilters={() => setFilters(emptyFilters)}
          columns={toggleableColumns}
          visibleColumns={visibleColumns}
          onToggleColumn={toggleColumn}
          onResetColumns={() => setVisibleColumns(allToggleable)}
        />
      </div>

      {/* Bulk update: ticked orders, or everything the filters show. */}
      <div className="p-4 bg-obsidian text-gold-soft border-2 border-line flex flex-wrap gap-3 items-center text-xs font-mono">
        <Layers className="w-4 h-4 text-gold" />
        <span className="font-black uppercase text-gold">Set Production Status</span>
        <span>
          for {selected.size
            ? <strong className="text-gold">{selected.size} ticked order{selected.size === 1 ? '' : 's'}</strong>
            : <strong className="text-gold">all {selectable.length} shown order{selectable.length === 1 ? '' : 's'} ({scopeLabel})</strong>}
        </span>
        <span>to</span>
        <select aria-label="New production status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as ProductionStatus)}
          className="p-1.5 bg-canvas text-ink border border-line font-mono text-xs font-bold uppercase">
          {SETTABLE.map((status) => <option key={status} value={status}>{STAGE_LABELS[status]}</option>)}
        </select>
        <button type="button" disabled={!targets.length} onClick={() => setConfirmBulk(true)}
          className="btn-tactile px-4 py-1.5 bg-gold text-on-gold font-black uppercase border border-line cursor-pointer disabled:opacity-40">
          Apply
        </button>
        {selected.size > 0 && (
          <button type="button" onClick={() => setSelected(new Set())} className="underline cursor-pointer">Clear ticks</button>
        )}
        <span className="basis-full text-[10px] text-neutral-400">
          Tick orders to change only those; with nothing ticked, every order in the list below is changed.
          Framed and Ready for Pickup only apply to orders that were already photographed.
        </span>
      </div>

      <DataTable
        label="Production Ledger"
        rows={filtered}
        columns={columns}
        visibleColumnIds={['select', 'job', 'stage', ...visibleColumns]}
        getRowId={(reg) => reg.id}
        defaultSort={{ column: 'job', direction: 'ascending' }}
        pagination={false}
        viewportClassName="max-h-[640px]"
        headerClassName="font-mono uppercase tracking-wider"
        filtered={filtersActive}
        emptyMessage="No paid job orders yet."
        filteredEmptyMessage="No job orders match the selected filters."
        rowClassName={(reg) => (selected.has(reg.id) ? 'bg-gold-wash/60' : '')}
      />

      <PickupMessageEditor />

      <ConfirmModal
        isOpen={confirmBulk}
        title="Update Production Status"
        message={(
          <>
            Set <strong>{targets.length}</strong> job order{targets.length === 1 ? '' : 's'}
            {selected.size ? ' (ticked)' : ` (${scopeLabel})`} to <strong>{STAGE_LABELS[bulkStatus]}</strong>?
            {READY_STAGES.has(bulkStatus) && ' Orders that are ready appear in the cashier\'s Ready for Pickup list. Orders not yet photographed are skipped.'}
          </>
        )}
        confirmText="Update"
        onConfirm={applyBulk}
        onClose={() => setConfirmBulk(false)}
      />
    </div>
  );
};

/** Admin-editable text the cashier sends when an order is ready. */
const PickupMessageEditor: React.FC = () => {
  const { toast } = useToast();
  const { settings, pickupMessage, refresh } = useStudioSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const text = draft ?? pickupMessage;
  const sample = {
    given_name: 'JUAN', family_name: 'DELA CRUZ', job_order_no: '00123', balance: 500,
  } as Registration;

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await pb.collection('studio_settings').update(settings.id, { pickup_message: text.trim() });
      await refresh();
      setDraft(null);
      toast.success('Pickup message saved.');
    } catch (err) {
      toast.error('Could not save the message: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="bg-panel border-2 border-line p-4 text-xs font-mono">
      <summary className="cursor-pointer font-black uppercase text-ink flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-gold" /> Pickup Text Message (sent by the cashier)
      </summary>
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label htmlFor="pickup-template" className="block font-bold uppercase">Message</label>
          <textarea id="pickup-template" value={text} maxLength={500} rows={5} onChange={(e) => setDraft(e.target.value)}
            className="w-full p-2.5 bg-canvas border border-line text-ink font-sans text-xs leading-relaxed" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void save()} disabled={saving || !settings || draft === null || !text.trim()}
              className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 bg-obsidian text-gold font-black uppercase border border-line cursor-pointer disabled:opacity-40">
              <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Message'}
            </button>
            {draft !== null && (
              <button type="button" onClick={() => setDraft(null)} className="underline cursor-pointer">Undo changes</button>
            )}
          </div>
          <ul className="text-[10px] text-neutral-600 grid grid-cols-1 sm:grid-cols-2 gap-x-3">
            {PICKUP_PLACEHOLDERS.map(([token, meaning]) => <li key={token}><code className="text-gold-soft">{token}</code> {meaning}</li>)}
          </ul>
        </div>
        <div>
          <div className="font-bold uppercase mb-2">Preview (with a ₱500 balance)</div>
          <p className="p-3 bg-canvas border border-line font-sans text-ink leading-relaxed whitespace-pre-wrap">{buildPickupMessage(sample, text)}</p>
        </div>
      </div>
    </details>
  );
};
