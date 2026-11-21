import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import type { TablePage } from '../../components/common/dataTableModel';
import { makeupLookLabel } from '../../constants/makeupLook';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import { formatQueueNumber } from '../../utils/formatters';
import { makeupStateLabels, requiresConfirmation, type MakeupAssignment } from './makeupAssignment';
import type { MuaTeam } from './muaTeam';

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
const inputClass = 'min-h-10 min-w-0 max-w-full border border-line bg-panel px-2 text-sm text-ink';

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
const teamColumns: DataTableColumn<Artist>[] = [
  { id: 'name', header: 'MUA name', accessor: (artist) => artist.name, sortable: true, cellClassName: 'font-bold' },
  { id: 'role', header: 'Role', accessor: (artist) => artist.parent ? 'Parent' : 'Artist', sortable: true,
    cell: (artist) => <>{artist.parent ? 'Parent' : 'Artist'}{artist.disabled && <span className="text-neutral-600"> · Disabled</span>}</> },
  { id: 'pending', header: 'Pending', accessor: (artist) => artist.pending, align: 'right', sortable: true },
  { id: 'progress', header: 'In progress', accessor: (artist) => artist.inProgress, align: 'right', sortable: true },
  { id: 'completed', header: 'Completed', accessor: (artist) => artist.completed, align: 'right', sortable: true },
];

export function MakeupTeamTable({ artists, loading }: { artists: MuaTeam['artists']; loading: boolean }) {
  return (
    <section className="min-w-0 space-y-2">
      <h2 className="text-sm font-black uppercase">MUA team status</h2>
      <DataTable label="MUA team status" rows={artists} columns={teamColumns} getRowId={(artist) => artist.id}
        pagination={false} loading={loading} emptyMessage="No MUA accounts have been set up."
        tableClassName="min-w-[440px]" headerClassName="uppercase tracking-wide" />
    </section>
  );
}

interface MakeupClientTableProps {
  title: string;
  kind: 'waiting' | 'assigned' | 'completed';
  rows: MakeupAssignment[];
  empty: string;
  loading?: boolean;
  renderAction?: (row: MakeupAssignment) => ReactNode;
  renderDetailsActions?: (row: MakeupAssignment) => ReactNode;
}

export function MakeupClientTable({
  title, kind, rows, empty, loading, renderAction, renderDetailsActions,
}: MakeupClientTableProps) {
  const heading = useId();
  const [query, setQuery] = useState('');
  const [service, setService] = useState('');
  const [artist, setArtist] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState<TablePage>({ page: 1, pageSize: pageSizes[0] });
  const resetPage = () => setPage((current) => ({ ...current, page: 1 }));
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
  const columns: DataTableColumn<MakeupAssignment>[] = [
    { id: 'job', header: 'Job Order №', accessor: (row) => row.jobOrder, sortable: true, cellClassName: 'whitespace-nowrap font-mono font-bold' },
    { id: 'client', header: 'Client name', accessor: (row) => row.name, sortable: true, minWidth: 130,
      cell: (row) => <><span className="font-bold">{row.name || '—'}</span>{(row.look || row.lookNote)
        && <span className="block text-[11px] text-gold-soft">{row.lookNote ? 'Client note' : 'Preferred look'}</span>}</> },
    { id: 'package', header: 'Package', accessor: (row) => row.packageName, sortable: true, visible: kind === 'waiting' },
    { id: 'service', header: 'MUA service', accessor: serviceNames, sortable: true, minWidth: 120,
      cell: (row) => <>{serviceNames(row)}{row.state !== 'completed' && requiresConfirmation(row)
        && <span className="block text-[11px] font-bold text-gold-soft">Confirmation required</span>}</> },
    { id: 'artist', header: kind === 'completed' ? 'Completed by' : 'Assigned MUA', accessor: (row) => row.artistName,
      sortable: true, visible: kind !== 'waiting' },
    { id: 'time', header: 'Completion time', accessor: (row) => instant(row.completedAt), sortable: true,
      visible: kind === 'completed', cell: (row) => dateTime(row.completedAt), cellClassName: 'whitespace-nowrap' },
    { id: 'status', header: 'Status', accessor: status, sortable: true,
      cell: (row) => <span className={`inline-block whitespace-nowrap border px-1.5 py-0.5 font-bold ${
        row.state === 'completed' ? 'border-emerald-600/40 text-emerald-700'
          : row.state === 'in_progress' ? 'border-gold bg-gold-wash text-gold-soft' : 'border-line text-ink'
      }`}>{status(row)}</span> },
    { id: 'actions', header: kind === 'waiting' ? 'Assign to' : 'Actions', visible: kind !== 'completed',
      cell: renderAction ?? (() => null), minWidth: 140 },
  ];

  return (
    <section aria-labelledby={heading} className="min-w-0 space-y-2">
      <h2 id={heading} className="text-sm font-black uppercase">{title} <span className="font-mono text-gold-soft">({rows.length})</span></h2>
      <DataTable label={title} rows={filteredRows} columns={columns} getRowId={(row) => row.rowKey ?? row.id}
        pagination={{ pageSizes, value: page, onChange: setPage }}
        defaultSort={kind === 'completed' ? { column: 'time', direction: 'descending' } : undefined}
        loading={loading} emptyMessage={empty} filtered={filtersActive}
        detailsColumnId={kind === 'assigned' ? 'actions' : undefined}
        headerClassName="uppercase tracking-wide" tableClassName="min-w-[650px] [&_tr:has(button[aria-expanded=true])]:bg-gold-wash"
        toolbar={
          <div onChange={resetPage} className="flex flex-wrap items-center gap-2 border-b border-line p-2">
            <input type="search" aria-label={`Search ${title.toLowerCase()}`} placeholder="Search job, client, service…" value={query}
              onChange={(event) => setQuery(event.target.value)} className={`${inputClass} w-full sm:w-56`} />
            <TableFilter name="Service" value={service} onChange={setService} options={serviceOptions.map((name) => [name, name])} />
            {kind !== 'waiting' && <>
              <TableFilter name="Artist" value={artist} onChange={setArtist} options={artistOptions} />
              <TableFilter name="Status" value={state} onChange={setState} options={(kind === 'completed'
                ? ['Completed', 'Confirmed'] : ['Claimed', 'In progress']).map((name) => [name, name])} />
            </>}
            {filtersActive && <button type="button" onClick={() => { setQuery(''); setService(''); setArtist(''); setState(''); resetPage(); }}
              className="min-h-10 px-2 text-xs font-bold text-gold-soft underline">Clear filters</button>}
          </div>
        }
        renderExpanded={(row) => <MakeupClientDetails row={row}>
          {renderDetailsActions?.(row) ?? renderAction?.(row)}
        </MakeupClientDetails>}
      />
    </section>
  );
}

function TableFilter({ name, value, onChange, options }: {
  name: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[];
}) {
  return (
    <select aria-label={`Filter by ${name.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)}
      className={`${inputClass} ${value ? 'border-gold bg-gold-wash' : ''}`}>
      <option value="">All {name === 'Status' ? 'statuses' : name.toLowerCase() + 's'}</option>
      {value && !options.some(([id]) => value === id) && <option value={value}>{value}</option>}
      {options.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
    </select>
  );
}

function MakeupClientDetails({ row, children }: { row: MakeupAssignment; children: ReactNode }) {
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
