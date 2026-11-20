import { useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { useWorkflowData, workflowError } from '../../../hooks/useWorkflowData';
import { stationButton, stationCard } from '../../workflow/StationLayout';
import { muaEarningsTable, muaReportTable, type MuaPerformanceReport } from '../muaPerformance';

const studioTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
const sourceLabels: Record<string, string> = {
  package: 'Package', add_on: 'Add-on', admin: 'Admin correction', legacy: 'Existing order',
};

export function MuaPerformancePanel() {
  const [date, setDate] = useState('');
  const [selected, setSelected] = useState<{ id: string; date: string }>();
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<'performance' | 'earnings'>('performance');
  const { toast } = useToast();
  const { data: report, error } = useWorkflowData<MuaPerformanceReport>(`/mua-performance?date=${encodeURIComponent(date)}`);
  const table = report && muaReportTable(report);
  const artist = selected?.date === report?.date ? report?.rows.find((row) => row.id === selected?.id) : undefined;

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
            <input type="date" value={date || report?.today || ''} onChange={(event) => {
              setDate(event.target.value);
              setSelected(undefined);
            }} className="min-h-10 border border-line bg-panel px-2" />
          </label>
          {date && <button type="button" className={stationButton} onClick={() => {
            setDate('');
            setSelected(undefined);
          }}>Today</button>}
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
      {report && table && (
        <>
          <div role="tablist" aria-label="MUA analytics views" className="flex flex-wrap gap-2 border-b-2 border-line pb-2">
            {(['performance', 'earnings'] as const).map((key) => <button key={key} type="button" role="tab" aria-selected={tab === key}
              className={`${stationButton} ${tab === key ? 'bg-obsidian !text-gold border-b-4 border-b-gold' : 'bg-panel !text-ink'}`} onClick={() => setTab(key)}>
              {key === 'performance' ? 'Performance' : 'Earnings'}
            </button>)}
          </div>
          {tab === 'earnings' ? <EarningsTable report={report} /> : <>
          {!report.rows.length && <p className="text-sm">No completions recorded for this date.</p>}
          <div className="overflow-x-auto border border-line" tabIndex={0} role="region" aria-label="Daily MUA counts">
            <table className="min-w-full whitespace-nowrap text-sm">
              <thead className="bg-obsidian text-gold">
                <tr>{table.headers.slice(1).map((name, index) => (
                  <th key={index} scope="col" className={`px-3 py-2 uppercase ${index ? 'text-right' : 'text-left'}`}>{name}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {report.rows.map((row, index) => (
                  <tr key={row.id}>
                    <th scope="row" className="px-3 py-2 text-left">
                      <button type="button" className="cursor-pointer underline font-bold" aria-expanded={artist?.id === row.id}
                        onClick={() => setSelected(artist?.id === row.id ? undefined : { id: row.id, date: report.date })}>
                        {row.name}
                      </button>
                    </th>
                    {table.rows[index].slice(2).map((value, column) => (
                      <td key={column} className="px-3 py-2 text-right font-mono">{value}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-line bg-gold-wash font-black">
                <tr>
                  <th scope="row" className="px-3 py-2 text-left">TOTAL</th>
                  {table.total.slice(2).map((value, column) => (
                    <td key={column} className="px-3 py-2 text-right font-mono">{value}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          {artist && (
            <section className="space-y-2 border-t border-line pt-3" aria-label="MUA Performance Details">
              <h4 className="font-black uppercase">MUA Performance Details</h4>
              <p className="text-sm">{artist.name} · {report.date} · {artist.totalClients} clients</p>
              {!artist.details.length && <p className="text-sm text-neutral-600">No services completed.</p>}
              <ul className="divide-y divide-neutral-200">
                {artist.details.map((item) => (
                  <li key={item.id} className="py-2 text-sm">
                    <p className="font-bold">{studioTime.format(new Date(item.completedAt.replace(' ', 'T')))} · {item.studentName} · {item.serviceName}</p>
                    <p>Job order {item.jobOrder} · {item.sources.map(({ source, name }) => `${name} (${sourceLabels[source]})`).join(', ')}</p>
                    {item.packageName && !item.sources.some(({ source }) => source === 'package') && <p>Portrait package {item.packageName}</p>}
                    <p className="text-neutral-600">Performed by {item.artistName} · Recorded by {item.actorName}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          </>}
        </>
      )}
    </section>
  );
}

function EarningsTable({ report }: { report: MuaPerformanceReport }) {
  const table = muaEarningsTable(report);
  return <div className="overflow-x-auto border border-line" tabIndex={0} role="region" aria-label="Daily MUA earnings">
    <table className="min-w-full whitespace-nowrap text-sm"><thead className="bg-obsidian text-gold"><tr>{table.headers.slice(1).map((name, index) => <th key={name} scope="col" className={`px-3 py-2 uppercase ${index > 0 ? 'text-right' : 'text-left'}`}>{name}</th>)}</tr></thead>
      <tbody className="divide-y divide-neutral-200">{table.rows.map((row, index) => <tr key={`${row[1]}-${index}`}>{row.slice(1).map((value, cell) => cell === 0 ? <th key={cell} scope="row" className="px-3 py-2 text-left">{value}</th> : <td key={cell} className="px-3 py-2 text-right font-mono">{value}</td>)}</tr>)}</tbody>
      <tfoot className="border-t border-line bg-gold-wash font-black"><tr>{table.total.slice(1).map((value, index) => index === 0 ? <th key={index} scope="row" className="px-3 py-2 text-left">{value}</th> : <td key={index} className="px-3 py-2 text-right font-mono">{value}</td>)}</tr></tfoot>
    </table>
  </div>;
}
