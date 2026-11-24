import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpRight, CircleCheck, ListFilter, Paintbrush, Search, UserRound, Users } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import type { TablePage, TableSort } from '../../components/common/dataTableModel';
import { makeupLookLabel } from '../../constants/makeupLook';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import { formatQueueNumber } from '../../utils/formatters';
import { makeupStateLabels, requiresConfirmation, type MakeupAssignment } from './makeupAssignment';
import type { MuaTeam } from './muaTeam';
import { stationCard } from './StationLayout';
import { makeupField, makeupSecondary, makeupTable } from './makeupStyles';

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
  if (row.state === 'claimed') return 'Assigned';
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
      <h3 className="text-sm font-black uppercase tracking-wide">Team workload</h3>
      <DataTable label="MUA team status" rows={artists} columns={teamColumns} getRowId={(artist) => artist.id}
        pagination={false} sorting={{ value: sort, onChange: onSort }} loading={loading} emptyMessage="No active MUA staff found."
        className={makeupTable} tableClassName="min-w-[440px]"
        renderCompactRow={(artist) => (
          <article className={stationCard}>
            <h4 className="font-black uppercase wrap-break-word">{artist.name}</h4>
            <p className="text-sm text-ink/70">{artist.parent ? 'Team lead' : 'Artist'}</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-sm">
              {([['Pending', artist.pending], ['In progress', artist.inProgress], ['Completed', artist.completed]] as const).map(([label, count]) => (
                <div key={label}>
                  <dt className="text-ink/70">{label}</dt>
                  <dd className="font-semibold tabular-nums">{count}</dd>
                </div>
              ))}
            </dl>
          </article>
        )} />
    </section>
  );
}

interface MakeupClientsViewProps {
  title: string;
  kind: 'waiting' | 'assigned' | 'completed';
  rows: MakeupAssignment[];
  loading?: boolean;
  failed?: boolean;
  view: MakeupTableView;
  onViewChange: (change: MakeupTableView) => void;
  renderAction?: (row: MakeupAssignment) => ReactNode;
}

export function MakeupClientsView({
  title, kind, rows, loading, failed, view, onViewChange, renderAction,
}: MakeupClientsViewProps) {
  const heading = useId();
  const filterId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The client whose details are open in a popup (by row key, so it shows the latest data).
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { query = '', service = '', artist = '', state = '', page = firstPage,
    sort = kind === 'completed' ? completedSort : null } = view;
  const changeFilter = (change: MakeupTableView) => onViewChange({ ...change, page: { ...page, page: 1 } });
  const clearFilters = () => changeFilter({ query: '', service: '', artist: '', state: '' });
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
  const activeFilters = [service, artist, state].filter(Boolean).length;
  const openDetails = (row: MakeupAssignment) => setOpenKey(row.rowKey ?? row.id);
  const renderCard = (row: MakeupAssignment) => (
    <MakeupClientCard row={row} onDetails={() => openDetails(row)}>{renderAction?.(row)}</MakeupClientCard>
  );
  const orderedAssignments = kind === 'assigned' && [...filteredRows].sort((a, b) =>
    Number(b.state === 'in_progress') - Number(a.state === 'in_progress'));
  const open = openKey && rows.find((row) => (row.rowKey ?? row.id) === openKey);

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
    { id: 'status', header: 'Status', accessor: status, sortable: true, cell: (row) => <MakeupStatus row={row} /> },
    { id: 'actions', header: 'Action', visible: kind === 'waiting', cell: renderAction ?? (() => null), minWidth: 140 },
  ];

  return (
    <section aria-labelledby={heading} className="min-w-0 space-y-3">
      <div className="flex items-center gap-2 border-b-2 border-line pb-2">
        <h2 id={heading} className="text-sm font-black uppercase tracking-wider">{title}</h2>
        {!loading && !failed && <span className="border border-line bg-panel px-2 py-0.5 font-mono text-[11px] font-bold text-gold-soft">
          {filtersActive ? `${filteredRows.length}/${rows.length}` : rows.length}
        </span>}
      </div>
      {(rows.length > 0 || filtersActive) && (
        <div className="flex flex-wrap items-center gap-2 border-2 border-line bg-panel p-2 sm:p-3">
          <div className="relative min-w-0 flex-1 sm:basis-64">
            <Search className="pointer-events-none absolute top-3.5 left-3 size-4 text-ink/65" aria-hidden="true" />
            <input type="search" aria-label={`Search ${title.toLowerCase()}`} placeholder="Search clients" value={query}
              onChange={(event) => changeFilter({ query: event.target.value })}
              className={`${makeupField} w-full pl-9 font-mono placeholder:text-ink/65`} />
          </div>
          <button type="button" className={`${makeupSecondary} shrink-0 md:hidden`} aria-expanded={filtersOpen} aria-controls={filterId}
            onClick={() => setFiltersOpen(!filtersOpen)}>
            <ListFilter className="size-4" aria-hidden="true" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
          </button>
          <div id={filterId} className={`${filtersOpen ? 'flex' : 'hidden'} min-w-0 basis-full flex-wrap items-center gap-2 md:flex md:basis-auto`}>
            <TableFilter name="Service" value={service} onChange={(next) => changeFilter({ service: next })}
              options={serviceOptions.map((name) => [name, name])} />
            {kind !== 'waiting' && <>
              <TableFilter name="Artist" value={artist} onChange={(next) => changeFilter({ artist: next })} options={artistOptions} />
              <TableFilter name="Status" value={state} onChange={(next) => changeFilter({ state: next })} options={(kind === 'completed'
                ? ['Completed', 'Confirmed'] : ['Assigned', 'In progress']).map((name) => [name, name])} />
            </>}
            {kind !== 'assigned' && (
              <label className="flex flex-wrap items-center gap-2 text-sm md:hidden">
                Sort by
                <select className={makeupField} value={sort ? `${sort.column}:${sort.direction}` : ''}
                  onChange={(event) => {
                    const [column, direction] = event.target.value.split(':');
                    onViewChange({ sort: direction === 'ascending' || direction === 'descending' ? { column, direction } : null,
                      page: { ...page, page: 1 } });
                  }}>
                  <option value="">Default order</option>
                  {columns.filter((column) => column.visible !== false && column.sortable).map((column) => (
                    <optgroup key={column.id} label={String(column.header)}>
                      <option value={`${column.id}:ascending`}>{column.header} ↑</option>
                      <option value={`${column.id}:descending`}>{column.header} ↓</option>
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
          </div>
          {filtersActive && <button type="button" onClick={clearFilters} className={makeupSecondary}>Clear filters</button>}
        </div>
      )}
      {loading || filteredRows.length === 0 ? (
        <div role="status" className={`${stationCard} text-sm`}>
          {loading ? <p className="p-4 text-center">Loading clients…</p>
            : <MakeupEmptyState kind={kind} failed={failed} filtered={filtersActive} />}
        </div>
      ) : orderedAssignments ? (
        <ul className="grid items-start gap-3 md:grid-cols-2">
          {orderedAssignments.map((row) => <li key={row.id}>{renderCard(row)}</li>)}
        </ul>
      ) : (
        <DataTable label={title} rows={filteredRows} columns={columns} getRowId={(row) => row.rowKey ?? row.id}
          pagination={filteredRows.length > pageSizes[0] ? { pageSizes, value: page, onChange: (next) => onViewChange({ page: next }) } : false}
          sorting={{ value: sort, onChange: (next) => onViewChange({ sort: next }) }}
          tableClassName="min-w-[650px]" className={makeupTable}
          onRowClick={openDetails} renderCompactRow={renderCard}
        />
      )}
      {open && (
        <Modal title={open.name || 'Client'} subtitle={<>Job order {open.jobOrder || open.id} · {serviceNames(open)} · {status(open)}</>}
          icon={Paintbrush} onClose={() => setOpenKey(null)} footer={renderAction?.(open)}>
          <MakeupClientDetails row={open} />
        </Modal>
      )}
    </section>
  );
}

function MakeupStatus({ row }: { row: MakeupAssignment }) {
  const highlight = row.state === 'in_progress' || row.state === 'completed';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 border px-2 py-0.5 font-mono text-[11px] font-bold uppercase ${
      highlight ? 'border-gold bg-gold-wash text-gold-soft' : 'border-line bg-canvas text-ink/80'
    }`}>
      {row.state === 'completed' && <CircleCheck className="size-3.5" aria-hidden="true" />}
      {row.state === 'in_progress' && <span className="size-1.5 bg-gold" aria-hidden="true" />}
      {status(row)}
    </span>
  );
}

function MakeupEmptyState({ kind, failed, filtered }: { kind: MakeupClientsViewProps['kind']; failed?: boolean; filtered?: boolean }) {
  const Icon = failed ? Paintbrush : filtered ? Search : kind === 'completed' ? CircleCheck : kind === 'waiting' ? Users : Paintbrush;
  const title = failed ? 'Clients could not be loaded' : filtered ? 'No matching clients' : kind === 'completed'
    ? 'No completed services' : kind === 'waiting' ? 'No clients waiting' : 'No active assignments';
  const message = failed ? 'Use Refresh to try again.' : filtered ? 'Try a different search or clear the filters.'
    : kind === 'completed' ? 'Choose another date to review completed services.'
      : kind === 'waiting' ? 'Clients appear here when they are ready for makeup or grooming.'
        : 'New assignments will appear here as they are made.';
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 px-2 py-5 text-center">
      <Icon className="size-6 text-gold" aria-hidden="true" />
      <p className="text-sm font-black uppercase tracking-wide text-ink">{title}</p>
      <p className="text-sm text-ink/75">{message}</p>
    </div>
  );
}

function MakeupClientCard({ row, onDetails, children }: {
  row: MakeupAssignment; onDetails: () => void; children?: ReactNode;
}) {
  const look = makeupLookLabel(row.look) || row.look;
  const active = row.state === 'claimed' || row.state === 'in_progress';
  return (
    <article className={`${stationCard} min-w-0 space-y-3 text-ink ${row.state === 'in_progress' ? 'outline outline-gold/60' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-ink/75">Job order <span className="font-bold text-gold-soft">{row.jobOrder || row.id}</span></p>
        <MakeupStatus row={row} />
      </div>
      <div className="space-y-1 wrap-break-word">
        <h3 className="text-lg leading-tight font-black uppercase">{row.name || 'Client'}</h3>
        <p className="text-sm">{serviceNames(row)}</p>
        {row.state === 'waiting' && row.packageName && <p className="text-sm text-ink/75">{row.packageName}</p>}
        {row.artistName && <p className="flex items-center gap-2 text-sm text-ink/75">
          <UserRound className="size-4 shrink-0 text-gold-soft" aria-hidden="true" /> {row.artistName}
        </p>}
        {row.state === 'completed' && <p className="text-sm text-ink/75">{dateTime(row.completedAt)}</p>}
        {row.state !== 'completed' && requiresConfirmation(row) && <p className="text-sm font-semibold text-gold-soft">Confirmation required</p>}
      </div>
      {row.state !== 'completed' && (look || row.lookNote) && (
        <div className="space-y-1 border border-gold bg-gold-wash px-3 py-2 text-sm wrap-break-word">
          <p className="font-semibold text-gold-soft">{look || 'Client note'}</p>
          {row.lookNote && <p className={active ? 'whitespace-pre-wrap' : 'line-clamp-2'}>{row.lookNote}</p>}
        </div>
      )}
      {active && !row.eligible && <p className="text-sm text-ink/75">Registration or payment is no longer eligible.</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {children}
        <button type="button" onClick={onDetails} aria-label={`View details for ${row.name || 'client'}`} className={makeupSecondary}>
          Details <ArrowUpRight className="size-4" aria-hidden="true" />
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
      className={`${makeupField} max-w-full ${value ? 'border-gold bg-gold-wash' : ''}`}>
      <option value="">All {name === 'Status' ? 'statuses' : name.toLowerCase() + 's'}</option>
      {value && !options.some(([id]) => value === id) && <option value={value}>{value}</option>}
      {options.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
    </select>
  );
}

function MakeupClientDetails({ row }: { row: MakeupAssignment }) {
  const { data, error } = useWorkflowData<MakeupDetails>(`/makeup/${encodeURIComponent(row.id)}/details`);
  const details = data?.details;
  const look = row.look || details?.look;
  const note = row.lookNote || details?.lookNote;
  return (
    <div className="space-y-4 font-sans text-sm wrap-break-word">
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
