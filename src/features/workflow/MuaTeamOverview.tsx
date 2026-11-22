import { useState } from 'react';
import type { TableSort } from '../../components/common/dataTableModel';
import { studioDate } from '../../utils/studioDay';
import { clampDay, useStudioCalendar } from '../../hooks/useStudioCalendar';
import { formatMuaAmount, muaEarningsTable } from '../admin/muaPerformance';
import { MakeupTeamTable } from './MakeupTables';
import { MuaAnalyticsTable } from './MuaAnalyticsTable';
import { StationTabs } from './StationTabs';
import type { MuaTeam } from './muaTeam';

const views = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'earnings', label: 'Earnings' },
] as const;

export function MuaTeamOverview({ team, date, onDateChange, sort, onSort, failed }: {
  team?: MuaTeam;
  date: string;
  onDateChange: (date: string) => void;
  sort: TableSort;
  onSort: (sort: TableSort) => void;
  failed: boolean;
}) {
  const [view, setView] = useState<typeof views[number]['id']>('overview');
  const current = !failed && team?.date === date ? team : undefined;
  const report = current?.report;
  const workload = current?.workload;
  const today = team?.today ?? studioDate();
  const { start } = useStudioCalendar();
  const metrics = report && workload ? [
    ['Total MUA artists', current.artists.length],
    ['Pending services', workload.pending],
    ['Services in progress', workload.inProgress],
    ['Completed services', report.totalServices],
    ['Total team earnings', formatMuaAmount(Number(muaEarningsTable(report).total.at(-1)))],
  ] as const : [];

  return (
    <section aria-label="MUA Team Overview" className="min-w-0 space-y-3">
      <label className="flex flex-wrap items-center gap-2 text-xs font-bold">
        Report date (Asia/Manila)
        <input type="date" className="min-h-10 border border-line bg-panel px-2" value={date} min={start || undefined} max={today}
          onChange={(event) => onDateChange(clampDay(event.target.value || today, start, today))} />
      </label>
      <StationTabs label="MUA team analytics views" tabs={views} active={view} onChange={setView}>
        {!report && !failed && <p role="status" className="text-sm">Loading team report…</p>}
        {report && view === 'overview' && (
          <>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {metrics.map(([label, value]) => (
                <div key={label} className="border border-line bg-panel px-3 py-2">
                  <dt className="text-xs font-bold">{label}</dt>
                  <dd className="font-mono text-lg font-black text-gold-soft">{value}</dd>
                </div>
              ))}
            </dl>
            {date < today && <p className="text-xs text-ink">Pending and in-progress services reflect recorded assignments at the end of this date.</p>}
            <MakeupTeamTable artists={current.artists} loading={false} sort={sort} onSort={onSort} />
          </>
        )}
        {report && view !== 'overview' &&
          <MuaAnalyticsTable key={`${report.date}:${view}`} report={report} earnings={view === 'earnings'} />}
      </StationTabs>
    </section>
  );
}
