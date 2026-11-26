import { DataFeedback, type DataRequestState } from '../../components/common/DataFeedback';
import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import type { TableSort } from '../../components/common/dataTableModel';
import { studioDate } from '../../utils/studioDay';
import { clampDay, useStudioCalendar } from '../../hooks/useStudioCalendar';
import { formatMuaAmount, muaEarningsTable } from '../admin/muaPerformance';
import { MakeupTeamTable } from './MakeupTables';
import { MuaAnalyticsTable } from './MuaAnalyticsTable';
import { StationTabs } from './StationTabs';
import { makeupField } from './makeupStyles';
import type { MuaTeam } from './muaTeam';

const views = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'earnings', label: 'Earnings' },
] as const;

export function MuaTeamOverview({ team, date, onDateChange, sort, onSort, request, embedded }: {
  team?: MuaTeam;
  date: string;
  onDateChange: (date: string) => void;
  sort: TableSort;
  onSort: (sort: TableSort) => void;
  request: DataRequestState;
  embedded: boolean;
}) {
  const [view, setView] = useState<typeof views[number]['id']>('overview');
  const current = team?.date === date ? team : undefined;
  const report = current?.report;
  const workload = current?.workload;
  const today = team?.today ?? studioDate();
  const calendar = useStudioCalendar();
  const { start } = calendar;
  const metrics = report && workload ? [
    ['Artists', current.artists.length],
    ['Pending', workload.pending],
    ['In progress', workload.inProgress],
    ['Completed', report.totalServices],
    ['Team earnings', formatMuaAmount(Number(muaEarningsTable(report).total.at(-1)))],
  ] as const : [];

  const reportDate = (
    <label className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm font-semibold">
      <CalendarDays className="size-4 shrink-0 text-gold-soft" aria-hidden="true" />
      <span>Report date<span className="block text-xs font-normal text-ink/70">Philippine time</span></span>
      <input type="date" className={makeupField} value={date} min={start || undefined} max={today}
        onChange={(event) => onDateChange(clampDay(event.target.value || today, start, today))} />
    </label>
  );

  return (
    <section aria-label="MUA Team Overview" className={embedded ? 'min-w-0 border border-line bg-panel' : 'min-w-0 space-y-3'}>
      {!embedded && reportDate}
      <DataFeedback {...calendar} loadingMessage="Loading available dates…" className="p-2" />
      <StationTabs label="MUA team analytics views" tabs={views} active={view} onChange={setView}
        variant={embedded ? 'underline' : 'default'} toolbar={embedded ? reportDate : undefined}>
        {view !== 'overview' && <DataFeedback {...request} loadingMessage="Loading team report…" className="min-h-12 p-3" />}
        {report && view === 'overview' && (
          <>
            <dl className={embedded
              ? 'grid grid-cols-2 gap-px border border-line bg-line @min-[420px]:grid-cols-3 @min-[680px]:grid-cols-5'
              : 'grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5'}>
              {metrics.map(([label, value]) => (
                <div key={label} className={embedded
                  ? 'min-w-0 bg-canvas px-3 py-3 last:col-span-2 @min-[680px]:last:col-span-1 sm:px-4'
                  : 'border border-line bg-panel p-3'}>
                  <dt className="text-xs font-semibold text-ink/75">{label}</dt>
                  <dd className="mt-0.5 wrap-anywhere font-mono text-lg font-black tabular-nums text-gold-soft">{value}</dd>
                </div>
              ))}
            </dl>
            {date < today && <p className="text-xs text-ink">Pending and in-progress services reflect recorded assignments at the end of this date.</p>}
          </>
        )}
        {view === 'overview' && <MakeupTeamTable artists={current?.artists ?? []} request={request} sort={sort} onSort={onSort} />}
        {report && view !== 'overview' &&
          <MuaAnalyticsTable key={`${report.date}:${view}`} report={report} earnings={view === 'earnings'} compact />}
      </StationTabs>
    </section>
  );
}
