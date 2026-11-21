import type { ReactNode } from 'react';
import { DataTable, type DataTableColumn } from '../../components/common/DataTable';
import { formatMuaAmount, muaEarningsTable, muaReportTable, type MuaPerformanceReport } from '../admin/muaPerformance';

export function MuaAnalyticsTable({ report, earnings, renderDetails }: {
  report: MuaPerformanceReport;
  earnings: boolean;
  renderDetails?: (artist: MuaPerformanceReport['rows'][number]) => ReactNode;
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
      rows={rows} columns={columns} getRowId={({ artist }) => artist.id} pagination={renderDetails ? false : undefined}
      emptyMessage="No completions recorded for this date." tableClassName="whitespace-nowrap" headerClassName="uppercase"
      footer={() => (
        <tr className="border-t border-line bg-gold-wash font-black">
          <th scope="row" className="px-3 py-2 text-left">TOTAL</th>
          {matrix.total.slice(2).map((value, index) => (
            <td key={valueIds[index]} className="px-3 py-2 text-right font-mono">{valueText(value)}</td>
          ))}
        </tr>
      )}
      renderExpanded={({ artist }) => renderDetails ? renderDetails(artist) : (
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
    />
  );
}
