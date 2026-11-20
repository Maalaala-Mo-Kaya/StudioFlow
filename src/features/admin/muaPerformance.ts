export interface MuaPerformanceReport {
  date: string;
  today: string;
  columns: { id: string; name: string }[];
  rows: {
    id: string;
    name: string;
    counts: Record<string, number>;
    totalClients: number;
    earnings: Record<string, number>;
    totalEarnings: number;
    details: MuaCompletion[];
  }[];
  totals: Record<string, number>;
  totalClients: number;
}

interface MuaCompletion {
  id: string;
  jobOrder: string;
  studentName: string;
  artistName: string;
  actorName: string;
  serviceName: string;
  packageName: string;
  sources: { source: string; id?: string; name: string }[];
  completedAt: string;
}

export function muaReportTable(report: MuaPerformanceReport) {
  const headers = ['Date', 'MUA Name', ...report.columns.map(({ name }) => name), 'Total Clients'];
  const counts = (row: Record<string, number>) => report.columns.map(({ id }) => row[id] ?? 0);
  const rows = report.rows.map((row) => [report.date, row.name, ...counts(row.counts), row.totalClients]);
  return { headers, rows, total: [report.date, 'TOTAL', ...counts(report.totals), report.totalClients] };
}

export function muaEarningsTable(report: MuaPerformanceReport) {
  const money = (value: number) => `₱${(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const headers = ['Date', 'MUA Name', ...report.columns.map(({ name }) => name), 'Total Earnings'];
  const amounts = (row: Record<string, number>) => report.columns.map(({ id }) => money(row[id] ?? 0));
  const rows = report.rows.map((row) => [report.date, row.name, ...amounts(row.earnings), money(row.totalEarnings)]);
  return { headers, rows, total: [report.date, 'TOTAL', ...amounts(report.rows.reduce((sum, row) => {
    for (const [id, value] of Object.entries(row.earnings)) sum[id] = (sum[id] || 0) + value;
    return sum;
  }, {} as Record<string, number>)), money(report.rows.reduce((sum, row) => sum + row.totalEarnings, 0))] };
}
