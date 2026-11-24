import { useState, type ReactNode } from 'react';
import { BarChart3 } from 'lucide-react';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { formatMuaAmount, muaEarningsTable, muaReportTable, type MuaPerformanceReport } from '../admin/muaPerformance';
import { makeupSecondary, makeupTable } from './makeupStyles';
import { stationCard } from './StationLayout';

export function MuaAnalyticsTable({ report, earnings, renderDetails, compact = false }: {
  report: MuaPerformanceReport;
  earnings: boolean;
  renderDetails?: (artist: MuaPerformanceReport['rows'][number]) => ReactNode;
  compact?: boolean;
}) {
  const matrix = earnings ? muaEarningsTable(report) : muaReportTable(report);
  // The artist whose breakdown is open in a popup.
  const [openId, setOpenId] = useState<string | null>(null);
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
    <>
    <DataTable label={earnings ? 'Daily MUA earnings' : 'Daily MUA counts'}
      rows={rows} columns={columns} getRowId={({ artist }) => artist.id} pagination={renderDetails ? false : undefined}
      emptyMessage="No completions recorded for this date." tableClassName="whitespace-nowrap" headerClassName="uppercase"
      className={compact ? makeupTable : undefined}
      renderCompactRow={compact ? ({ artist, values }) => (
        <article className={`${stationCard} flex flex-wrap items-center justify-between gap-3`}>
          <div className="min-w-0 wrap-break-word">
            <h3 className="font-semibold">{artist.name}</h3>
            <p className="text-sm text-ink/75">{earnings ? 'Total earnings' : 'Services completed'} · {valueText(values.at(-1) ?? 0)}</p>
          </div>
          <button type="button" className={makeupSecondary} onClick={() => setOpenId(artist.id)}>Details</button>
        </article>
      ) : undefined}
      footer={() => (
        <tr className="border-t border-line bg-gold-wash font-black">
          <th scope="row" className="px-3 py-2 text-left">TOTAL</th>
          {matrix.total.slice(2).map((value, index) => (
            <td key={valueIds[index]} className="px-3 py-2 text-right font-mono">{valueText(value)}</td>
          ))}
        </tr>
      )}
      onRowClick={({ artist }) => setOpenId(artist.id)}
    />
    {compact && <p className="text-sm font-semibold md:hidden">
      {earnings ? 'Team earnings' : 'Total completed services'} · {valueText(matrix.total.at(-1) ?? 0)}
    </p>}
    {(() => {
      const artist = openId ? report.rows.find((row) => row.id === openId) : undefined;
      return artist && (
        <Modal title={artist.name} subtitle={<>{earnings ? 'Earnings' : 'Services completed'} · {report.date}</>} icon={BarChart3}
          onClose={() => setOpenId(null)}>
          {renderDetails ? renderDetails(artist) : (
        <section className="space-y-2 whitespace-normal" aria-label={artist.name + ' service breakdown'}>
          <h4 className="font-black">{artist.name} · {report.date}</h4>
          {artist.totalServices ? (
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {report.columns.filter(({ id }) => artist.counts[id]).map(({ id, name }) => (
                <div key={id} className="flex justify-between gap-3 border-b border-line py-1">
                  <dt>{name}</dt>
                  <dd className="font-mono">{earnings ? valueText(artist.earnings[id] ?? 0) : artist.counts[id]}</dd>
                </div>
              ))}
            </dl>
          ) : <p>No services completed.</p>}
        </section>
      )}
        </Modal>
      );
    })()}
    </>
  );
}
