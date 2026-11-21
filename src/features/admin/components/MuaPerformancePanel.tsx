import { useState, type FormEvent } from 'react';
import { DataTable, type DataTableColumn } from '../../../components/common/DataTable';
import { pb } from '../../../db/pocketbase';
import { useToast } from '../../../context/ToastContext';
import { useWorkflowData, workflowApi, workflowError } from '../../../hooks/useWorkflowData';
import { randomId } from '../../../utils/randomId';
import { stationButton, stationCard } from '../../workflow/StationLayout';
import { formatMuaAmount, muaEarningsTable, muaReportTable, type MuaCompletion, type MuaPerformanceReport } from '../muaPerformance';

const studioTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
const sourceLabels: Record<string, string> = {
  package: 'Package', add_on: 'Add-on', admin: 'Admin correction', legacy: 'Existing order',
};

export function MuaPerformancePanel() {
  const [date, setDate] = useState('');
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<'performance' | 'earnings'>('performance');
  const { toast } = useToast();
  const { data: report, error, refresh } = useWorkflowData<MuaPerformanceReport>(`/mua-performance?date=${encodeURIComponent(date)}`);

  async function exportReport(format: 'csv' | 'xlsx') {
    if (!report || exporting) return;
    setExporting(true);
    try {
      const { downloadMuaReport } = await import('../muaPerformanceExport');
      await downloadMuaReport(report, format, tab);
    } catch (failure) {
      toast.error(workflowError(failure));
    } finally { setExporting(false); }
  }

  return (
    <section className={`${stationCard} space-y-4`} aria-label="MUA Performance Analytics">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-wider">MUA Performance Analytics</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-bold">
            <span className="block">Date · Asia/Manila</span>
            <input type="date" value={date || report?.today || ''} onChange={(event) => setDate(event.target.value)}
              className="min-h-10 border border-line bg-panel px-2" />
          </label>
          {date && <button type="button" className={stationButton} onClick={() => setDate('')}>Today</button>}
          {report && (
            <details className="relative">
              <summary className={stationButton}>{exporting ? 'Exporting…' : 'Export Report ▾'}</summary>
              <div className="absolute right-0 z-10 min-w-28 border border-line bg-panel p-1 shadow-lux">
                <button type="button" className="block w-full p-2 text-left text-xs font-bold hover:bg-gold-wash"
                  disabled={exporting} onClick={() => void exportReport('csv')}>CSV</button>
                <button type="button" className="block w-full p-2 text-left text-xs font-bold hover:bg-gold-wash"
                  disabled={exporting} onClick={() => void exportReport('xlsx')}>Excel</button>
              </div>
            </details>
          )}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!report && !error && <p role="status" className="text-sm">Loading daily report…</p>}
      {report && (
        <>
          <div role="tablist" aria-label="MUA analytics views" className="flex flex-wrap gap-2 border-b-2 border-line pb-2">
            {(['performance', 'earnings'] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key}
              className={`${stationButton} ${tab === key ? 'bg-obsidian !text-gold border-b-4 border-b-gold' : 'bg-panel !text-ink'}`} onClick={() => setTab(key)}>
              {key === 'performance' ? 'Performance' : 'Earnings'}
            </button>)}
          </div>
          <ArtistReportTable key={`${report.date}:${tab}`} report={report} earnings={tab === 'earnings'} refresh={refresh} />
        </>
      )}
    </section>
  );
}

function ArtistReportTable({ report, earnings, refresh }: {
  report: MuaPerformanceReport; earnings: boolean; refresh: () => void;
}) {
  const matrix = earnings ? muaEarningsTable(report) : muaReportTable(report);
  const rows = report.rows.map((artist, index) => ({ artist, values: matrix.rows[index].slice(2) }));
  const valueText = (value: string | number) => earnings ? formatMuaAmount(Number(value)) : value;
  const valueIds = [...report.columns.map(({ id }) => 'service:' + id), 'total'];
  const columns: DataTableColumn<typeof rows[number]>[] = [
    { id: 'name', header: 'MUA Name', sortable: true, accessor: ({ artist }) => artist.name, cellClassName: 'font-bold' },
    ...matrix.headers.slice(2).map((header, index): DataTableColumn<typeof rows[number]> => ({
      id: valueIds[index], header, sortable: true, align: 'right', cellClassName: 'font-mono',
      accessor: ({ values }) => Number(values[index]), cell: ({ values }) => valueText(values[index]),
    })),
  ];

  return (
    <DataTable label={earnings ? 'Daily MUA earnings' : 'Daily MUA counts'}
      rows={rows} columns={columns} getRowId={({ artist }) => artist.id} pagination={false}
      emptyMessage="No completions recorded for this date." tableClassName="whitespace-nowrap" headerClassName="uppercase"
      footer={() => (
        <tr className="border-t border-line bg-gold-wash font-black">
          <th scope="row" className="px-3 py-2 text-left">TOTAL</th>
          {matrix.total.slice(2).map((value, index) => (
            <td key={valueIds[index]} className="px-3 py-2 text-right font-mono">{valueText(value)}</td>
          ))}
        </tr>
      )}
      renderExpanded={({ artist }) => (
        <section className="space-y-2 whitespace-normal" aria-label={artist.name + ' service details'}>
          <h4 className="font-black uppercase">{earnings ? 'MUA earnings details' : 'MUA performance details'}</h4>
          <p className="text-sm">{artist.name} · {report.date} · {artist.totalClients} clients</p>
          {!artist.details.length && <p className="text-sm text-neutral-600">No services completed.</p>}
          <ul className="divide-y divide-neutral-200">
            {artist.details.map((item) => (
              <li key={item.id} className="py-2 text-sm">
                <p className="font-bold">{studioTime.format(new Date(item.completedAt.replace(' ', 'T')))} · {item.studentName} · {item.serviceName}</p>
                <p>Job order {item.jobOrder} · {item.sources.map(({ source, name }) => `${name} (${sourceLabels[source]})`).join(', ')}</p>
                {item.packageName && !item.sources.some(({ source }) => source === 'package') && <p>Portrait package {item.packageName}</p>}
                <p className="text-neutral-600">Performed by {item.artistName} · Recorded by {item.actorName}</p>
                {item.reviewReason && <p className="font-semibold text-amber-700">Review required. {item.reviewReason}</p>}
                {earnings && <EarningsDetails item={item} refresh={refresh} />}
              </li>
            ))}
          </ul>
        </section>
      )}
    />
  );
}

function EarningsDetails({ item, refresh }: { item: MuaCompletion; refresh: () => void }) {
  const { basis, adjustments, pendingReview } = item;
  const [entry, setEntry] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [clientKey, setClientKey] = useState(randomId);
  const { toast } = useToast();
  const referenceFor = (event: MuaCompletion['pendingReview'][number]) => event.kind + ':' + event.reference;
  const selected = pendingReview.find((event) => referenceFor(event) === entry);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (entry && !selected)) return;
    setBusy(true);
    try {
      await pb.send(`${workflowApi}/mua-completions/${item.id}/adjustments`, {
        method: 'POST',
        body: { kind: selected?.kind ?? 'correction', reference: selected?.reference ?? '',
          amount: Math.round(Number(amount) * 100), reason, clientKey },
      });
      setEntry('');
      setAmount('');
      setReason('');
      setClientKey(randomId());
      toast.success('Earnings adjustment recorded.');
      refresh();
    } catch (error) {
      toast.error(workflowError(error));
    } finally { setBusy(false); }
  }

  return <div className="mt-2 space-y-1 border-l-2 border-gold pl-3">
    <p>
      {basis.unit !== undefined && <>{basis.quantity} × {formatMuaAmount(basis.unit / 100)} · </>}
      {basis.kind === 'historical' ? 'Historical earnings' : 'Original earnings'} {formatMuaAmount(basis.earned / 100)}
      {' · '}<strong>Net {formatMuaAmount(item.earned / 100)}</strong>
    </p>
    {basis.discount && <p className="text-neutral-600">Discount share {formatMuaAmount(basis.discount.amount / 100)} · {basis.discount.reason}</p>}
    {adjustments.map((adj) => <p key={adj.clientKey} className="text-neutral-600">
      {formatMuaAmount(adj.amount / 100)} · {adj.reference ? `${adj.kind} ${adj.reference}` : 'Correction'}
      {' · '}{adj.reason} · {adj.by} · {adj.at.slice(0, 10)}
    </p>)}
    {pendingReview.length > 0 && <p className="font-semibold text-amber-700">
      Review {pendingReview.map((event) => `${event.kind} ${event.reference}`).join(', ')} for this service.
    </p>}
    <details>
      <summary className="cursor-pointer text-xs font-bold underline">Record earnings adjustment</summary>
      <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={submit}>
        <label className="block text-xs font-bold">Adjustment source
          <select value={entry} onChange={(event) => setEntry(event.target.value)}
            className="mt-1 block min-h-10 border border-line bg-panel px-2">
            <option value="">Verified service correction</option>
            {entry && !selected && <option value={entry} disabled>This event has already been reviewed</option>}
            {pendingReview.map((event) => <option key={referenceFor(event)} value={referenceFor(event)}>
              {event.kind === 'void' ? 'Void' : 'Refund'} {event.reference}
            </option>)}
          </select>
        </label>
        <label className="block text-xs font-bold">{selected ? 'Change in ₱ (0 if unrelated)' : 'Change in ₱ (+/−)'}
          <input type="number" step="0.01" max={selected ? 0 : undefined} required value={amount}
            className="mt-1 block min-h-10 w-36 border border-line bg-panel px-2"
            onChange={(event) => setAmount(event.target.value)} />
        </label>
        <label className="min-w-40 flex-1 text-xs font-bold">Reason and supporting details
          <input required minLength={3} maxLength={500} value={reason}
            className="mt-1 block min-h-10 w-full border border-line bg-panel px-2"
            onChange={(event) => setReason(event.target.value)} />
        </label>
        <button type="submit" className={stationButton} disabled={busy || (!!entry && !selected)}>{busy ? 'Saving…' : 'Save adjustment'}</button>
      </form>
    </details>
  </div>;
}
