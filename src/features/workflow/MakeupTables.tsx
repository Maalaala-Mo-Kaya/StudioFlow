import { useId, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Paintbrush } from 'lucide-react';
import { DataTable, tableFilterControl, type DataTableColumn } from '../../components/common/DataTable';
import { defaultTableExpansion, type TableExpansion, type TablePage, type TableSort } from '../../components/common/dataTableModel';
import { makeupLookLabel } from '../../constants/makeupLook';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import { formatQueueNumber } from '../../utils/formatters';
import { makeupStateLabels, requiresConfirmation, type MakeupAssignment } from './makeupAssignment';
import type { MuaTeam } from './muaTeam';
import { StationClientQueue } from './StationClientQueue';
import { stationButton } from './StationLayout';

const serviceSources = {
  package: 'Selected package', add_on: 'Selected add-on', admin: 'Admin correction', legacy: 'Existing job order',
};
const historyActions: Record<string, string> = {
  assign: 'Assigned', reassign: 'Reassigned', start: 'Started', release: 'Released', complete: 'Completed',
};
const manilaTime = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
});
const instant = (date: string) => Date.parse(date.replace(' ', 'T'));
const dateTime = (date: string) => Number.isFinite(instant(date)) ? manilaTime.format(instant(date)) : '—';
const pageSizes = [10, 25, 50];
const firstPage = { page: 1, pageSize: pageSizes[0] };
const completedSort: TableSort = { column: 'time', direction: 'descending' };

interface MakeupDetails {
  details: {
    school: string;
    course: string;
    level: string;
    packageName: string;
    paymentConfirmed: boolean;
    paymentStatus: string;
    look: string;
    lookNote: string;
    queueNumber: number | null;
  } | null;
  history: { id: string; action: string; artist: string; actor: string; at: string }[];
}

function serviceNames(row: MakeupAssignment) {
  return row.services?.length ? row.services.map(({ name }) => name).join(', ') : row.service || 'Makeup / grooming';
}

function status(row: MakeupAssignment) {
  return row.state === 'completed' && requiresConfirmation(row) ? 'Confirmed' : makeupStateLabels[row.state];
}

type Artist = MuaTeam['artists'][number];
export interface MakeupTableView {
  query?: string;
  service?: string;
  artist?: string;
  state?: string;
  page?: TablePage;
  sort?: TableSort;
  expansion?: TableExpansion;
}

const teamColumns: DataTableColumn<Artist>[] = [
  { id: 'name', header: 'MUA name', accessor: (artist) => artist.name, sortable: true, cellClassName: 'font-bold' },
  { id: 'role', header: 'Role', accessor: (artist) => artist.parent ? 'Parent' : 'Artist', sortable: true },
  { id: 'pending', header: 'Pending', accessor: (artist) => artist.pending, align: 'right', sortable: true },
  { id: 'progress', header: 'In progress', accessor: (artist) => artist.inProgress, align: 'right', sortable: true },
  { id: 'completed', header: 'Completed', accessor: (artist) => artist.completed, align: 'right', sortable: true },
];

export function MakeupTeamTable({ artists, loading, sort, onSort }: {
  artists: MuaTeam['artists']; loading: boolean; sort: TableSort; onSort: (sort: TableSort) => void;
}) {
  return (
    <section className="min-w-0 space-y-2">
      <h2 className="text-sm font-black uppercase">MUA team status</h2>
      <DataTable label="MUA team status" rows={artists} columns={teamColumns} getRowId={(artist) => artist.id}
        pagination={false} sorting={{ value: sort, onChange: onSort }} loading={loading} emptyMessage="No active MUA staff found."
        tableClassName="min-w-[440px]" headerClassName="uppercase tracking-wide" />
    </section>
  );
}

interface MakeupClientsViewProps {
  title: string;
  kind: 'waiting' | 'assigned' | 'completed';
  rows: MakeupAssignment[];
  empty: string;
  loading?: boolean;
  view: MakeupTableView;
  onViewChange: (change: MakeupTableView) => void;
  renderAction?: (row: MakeupAssignment) => ReactNode;
  assignmentSelection: {
    id: string | undefined;
    onChange: (id: string | undefined) => void;
    disabled: boolean;
    renderActions: (row: MakeupAssignment) => ReactNode;
  };
}

export function MakeupClientsView({
  title, kind, rows, empty, loading, view, onViewChange, renderAction, assignmentSelection,
}: MakeupClientsViewProps) {
  const heading = useId();
  const { query = '', service = '', artist = '', state = '', page = firstPage,
    sort = kind === 'completed' ? completedSort : null } = view;
  const changeFilter = (change: MakeupTableView) => onViewChange({ ...change, page: { ...page, page: 1 } });
  const serviceOptions = useMemo(() => [...new Set(rows.flatMap((row) => row.services?.length
    ? row.services.flatMap((item) => [item.name, ...(item.types?.map((type) => type.name) ?? [])])
    : [serviceNames(row)]))].filter(Boolean).sort((a, b) => a.localeCompare(b)), [rows]);
  const artistOptions = useMemo(() => [...new Map(rows.filter((row) => row.artistId)
    .map((row) => [row.artistId, row.artistName || row.artistId]))].sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const queryText = query.trim().toLowerCase();
  const filteredRows = useMemo(() => rows.filter((row) => {
    const searchableService = row.services?.length
      ? row.services.flatMap((item) => [item.name, ...(item.types?.map((type) => type.name) ?? [])])
      : [serviceNames(row)];
    return (!service || searchableService.includes(service))
      && (!artist || row.artistId === artist) && (!state || status(row) === state)
      && (!queryText || queryText.split(/\s+/).every((term) =>
        [row.jobOrder, row.name, row.artistName, ...searchableService].join(' ').toLowerCase().includes(term)));
  }), [rows, queryText, service, artist, state]);
  const filtersActive = !!(queryText || service || artist || state);
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 p-2">
      <input type="search" aria-label={`Search ${title.toLowerCase()}`} placeholder="Search job, client, service…" value={query}
        onChange={(event) => changeFilter({ query: event.target.value })} className={`${tableFilterControl} w-full sm:w-56`} />
      <TableFilter name="Service" value={service} onChange={(next) => changeFilter({ service: next })}
        options={serviceOptions.map((name) => [name, name])} />
      {kind !== 'waiting' && <>
        <TableFilter name="Artist" value={artist} onChange={(next) => changeFilter({ artist: next })} options={artistOptions} />
        <TableFilter name="Status" value={state} onChange={(next) => changeFilter({ state: next })} options={(kind === 'completed'
          ? ['Completed', 'Confirmed'] : ['Claimed', 'In progress']).map((name) => [name, name])} />
      </>}
      {filtersActive && <button type="button" onClick={() => changeFilter({ query: '', service: '', artist: '', state: '' })}
        className="min-h-10 px-2 text-xs font-bold text-gold-soft underline">Clear filters</button>}
    </div>
  );

  if (kind === 'assigned') {
    if (loading) return <p role="status" className="border-2 border-line bg-panel p-5 text-center text-sm">Loading assigned clients…</p>;
    const selected = rows.find((row) => row.id === assignmentSelection.id);
    const unselected = filteredRows.filter((row) => row.id !== selected?.id);

    return <StationClientQueue
      placeholderIcon={<Paintbrush className="size-7 text-gold" aria-hidden="true" />}
      totalUnselected={rows.length - (selected ? 1 : 0)}
      tools={rows.length > 0 && <div className="mb-4 border border-line bg-panel">{toolbar}</div>}
      empty={rows.length === 0 ? empty : filtersActive ? 'No unselected clients match the filters.' : 'No other assigned clients in the queue.'}
      selected={selected && <MakeupAssignmentCard key={selected.id} row={selected} selected
        disabled={assignmentSelection.disabled} onToggle={() => assignmentSelection.onChange(undefined)}>
        {assignmentSelection.renderActions(selected)}
      </MakeupAssignmentCard>}
      unselected={unselected.map((row) => <MakeupAssignmentCard key={row.id} row={row}
        disabled={assignmentSelection.disabled} onToggle={() => assignmentSelection.onChange(row.id)} />)}
    />;
  }

  const columns: DataTableColumn<MakeupAssignment>[] = [
    { id: 'job', header: 'Job Order №', accessor: (row) => row.jobOrder, sortable: true, cellClassName: 'whitespace-nowrap font-mono font-bold' },
    { id: 'client', header: 'Client name', accessor: (row) => row.name, sortable: true, minWidth: 130,
      cell: (row) => <><span className="font-bold">{row.name || '—'}</span>{(row.look || row.lookNote)
        && <span className="block text-[11px] text-gold-soft">{row.lookNote ? 'Client note' : 'Preferred look'}</span>}</> },
    { id: 'package', header: 'Package', accessor: (row) => row.packageName, sortable: true, visible: kind === 'waiting' },
    { id: 'service', header: 'MUA service', accessor: serviceNames, sortable: true, minWidth: 120,
      cell: (row) => <>{serviceNames(row)}{row.state !== 'completed' && requiresConfirmation(row)
        && <span className="block text-[11px] font-bold text-gold-soft">Confirmation required</span>}</> },
    { id: 'artist', header: 'Completed by', accessor: (row) => row.artistName,
      sortable: true, visible: kind !== 'waiting' },
    { id: 'time', header: 'Completion time', accessor: (row) => instant(row.completedAt), sortable: true,
      visible: kind === 'completed', cell: (row) => dateTime(row.completedAt), cellClassName: 'whitespace-nowrap' },
    { id: 'status', header: 'Status', accessor: status, sortable: true,
      cell: (row) => <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-bold ${
        row.state === 'completed' ? 'border-emerald-600/40 text-emerald-700'
          : row.state === 'in_progress' ? 'border-gold bg-gold-wash text-gold-soft' : 'border-line text-ink'
      }`}>{status(row)}</span> },
    { id: 'actions', header: 'Assign to', visible: kind !== 'completed',
      cell: renderAction ?? (() => null), minWidth: 140 },
  ];

  return (
    <section aria-labelledby={heading} className="min-w-0 space-y-2">
      <h2 id={heading} className="text-sm font-black uppercase">{title} <span className="font-mono text-gold-soft">({rows.length})</span></h2>
      <DataTable label={title} rows={filteredRows} columns={columns} getRowId={(row) => row.rowKey ?? row.id}
        pagination={{ pageSizes, value: page, onChange: (next) => onViewChange({ page: next }) }}
        sorting={{ value: sort, onChange: (next) => onViewChange({ sort: next }) }}
        expansion={{ value: view.expansion ?? defaultTableExpansion, onChange: (next) => onViewChange({ expansion: next }) }}
        loading={loading} emptyMessage={empty} filtered={filtersActive}
        headerClassName="uppercase tracking-wide" tableClassName="min-w-[650px]"
        toolbar={toolbar}
        renderExpanded={(row) => <MakeupClientDetails row={row}>{renderAction?.(row)}</MakeupClientDetails>}
      />
    </section>
  );
}

function MakeupAssignmentCard({ row, selected = false, disabled, onToggle, children }: {
  row: MakeupAssignment; selected?: boolean; disabled: boolean; onToggle: () => void; children?: ReactNode;
}) {
  const look = makeupLookLabel(row.look) || row.look;
  return (
    <article className={`flex min-w-0 flex-col gap-4 border-2 bg-panel p-4 text-ink sm:p-5 ${
      selected ? 'border-gold shadow-lux-gold' : 'border-line shadow-lux'
    }`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <span className="font-mono text-xs font-black text-gold-soft">{row.jobOrder || row.id}</span>
        <span className={`border px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider ${
          row.state === 'in_progress' ? 'border-gold bg-gold text-on-gold' : 'border-line text-ink'
        }`}>{status(row)}</span>
      </header>
      <div className="min-w-0 space-y-1 wrap-break-word">
        <h3 className="text-lg font-black uppercase">{row.name}</h3>
        <p className="text-sm font-bold">{serviceNames(row)}</p>
        <p className="text-xs text-neutral-500">{row.artistName || 'Unassigned'}</p>
        {requiresConfirmation(row) && <p className="text-xs font-bold text-gold-soft">Confirmation required</p>}
        {(look || row.lookNote) && <div className="border border-gold bg-gold-wash px-3 py-2 text-xs text-gold-soft">
          {look && <p className="font-bold">{look}</p>}
          {row.lookNote && <p className="whitespace-pre-wrap">{selected ? row.lookNote : 'Client note'}</p>}
        </div>}
      </div>
      {selected && <details className="border border-line bg-canvas px-3 py-2">
        <summary className="cursor-pointer text-xs font-bold text-gold-soft">Client details</summary>
        <div className="mt-3"><MakeupClientDetails row={row} /></div>
      </details>}
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {children}
        <button type="button" disabled={disabled} onClick={onToggle} className={selected
          ? 'min-h-10 px-3 text-xs font-bold text-gold-soft underline disabled:opacity-40' : `${stationButton} w-full`}>
          {selected ? 'Deselect' : 'Select'}
        </button>
      </div>
    </article>
  );
}

function TableFilter({ name, value, onChange, options }: {
  name: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[];
}) {
  return (
    <select aria-label={`Filter by ${name.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)}
      className={`${tableFilterControl} ${value ? 'border-gold bg-gold-wash' : ''}`}>
      <option value="">All {name === 'Status' ? 'statuses' : name.toLowerCase() + 's'}</option>
      {value && !options.some(([id]) => value === id) && <option value={value}>{value}</option>}
      {options.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
    </select>
  );
}

function MakeupClientDetails({ row, children }: { row: MakeupAssignment; children?: ReactNode }) {
  const { data, error } = useWorkflowData<MakeupDetails>(`/makeup/${encodeURIComponent(row.id)}/details`);
  const details = data?.details;
  const look = row.look || details?.look;
  const note = row.lookNote || details?.lookNote;
  return (
    <div className="space-y-3 break-words text-sm">
      <h3 className="font-black">{row.name}</h3>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-3">
        <div><dt className="font-bold">Job Order №</dt><dd>{row.jobOrder || row.id}</dd></div>
        {row.studentId && <div><dt className="font-bold">Student ID</dt><dd>{row.studentId}</dd></div>}
        <div><dt className="font-bold">Package</dt><dd>{row.packageName || details?.packageName || '—'}</dd></div>
        {[['School / session', details?.school], ['Academic level', details?.level], ['Course', details?.course]].map(([label, value]) =>
          value && <div key={label}><dt className="font-bold">{label}</dt><dd>{value}</dd></div>)}
        <div><dt className="font-bold">Assigned MUA</dt><dd>{row.artistName || 'Unassigned'}</dd></div>
        <div><dt className="font-bold">Service status</dt><dd>{status(row)}</dd></div>
        {details && <>
          <div><dt className="font-bold">Payment</dt><dd>{
            details.paymentStatus === 'fully_paid' ? 'Fully settled' : details.paymentStatus === 'downpayment' ? 'Downpayment recorded'
              : details.paymentConfirmed ? 'Confirmed' : 'Unpaid'
          }</dd></div>
          <div><dt className="font-bold">Photography queue</dt><dd>{formatQueueNumber(details.queueNumber)}</dd></div>
        </>}
      </dl>
      {(look || note) && <div className="border border-gold bg-gold-wash px-3 py-2">
        <p className="text-xs font-bold uppercase text-gold-soft">Preferred look / client note</p>
        {look && <p className="font-bold">{makeupLookLabel(look) || look}</p>}
        {note && <p className="whitespace-pre-wrap">{note}</p>}
      </div>}
      <div>
        <p className="font-bold">Purchased MUA services</p>
        {row.services?.length ? <ul className="list-disc pl-4">
          {row.services.map((item, index) => <li key={index}>
            {item.name}{item.types?.length ? ` · ${item.types.map((type) => type.name).join(', ')}` : ''}
            {' '}<span className="text-neutral-600">({item.defaultService ? 'Default add-on' : serviceSources[item.source] || 'Recorded service'})</span>
          </li>)}
        </ul> : <p>{serviceNames(row)}</p>}
      </div>
      {row.state !== 'waiting' && row.state !== 'completed' && !row.eligible
        && <p className="font-bold text-red-700">Registration or payment is no longer eligible.</p>}
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!data && !error && <p role="status" className="text-neutral-600">Loading client details…</p>}
      {!!data?.history.length && <div>
        <p className="font-bold">Assignment history</p>
        <ul className="list-disc pl-4 text-xs">
          {data.history.map((event) => <li key={event.id}>
            {dateTime(event.at)} · {historyActions[event.action] || event.action} · {event.artist}
            {event.actor && event.actor !== event.artist && ` (by ${event.actor})`}
          </li>)}
        </ul>
      </div>}
    </div>
  );
}
