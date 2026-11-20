export interface MuaPerformanceReport {
  date: string;
  today: string;
  columns: { id: string; name: string }[];
  rows: {
    id: string;
    name: string;
    counts: Record<string, number>;
    totalClients: number;
    totalServices: number;
    earnings: Record<string, number>;
    totalEarnings: number;
    details: MuaCompletion[];
  }[];
  totals: Record<string, number>;
  totalClients: number;
  totalServices: number;
}

export interface MuaFinancialEvent {
  kind: 'refund' | 'void';
  reference: string;
  amount: number;
}

export interface MuaCompletion {
  id: string;
  jobOrder: string;
  studentName: string;
  artistName: string;
  actorName: string;
  serviceName: string;
  packageName: string;
  sources: { source: string; id?: string; name: string }[];
  completedAt: string;
  basis: {
    kind: 'price' | 'review' | 'historical';
    quantity: number;
    unit?: number;
    earned: number;
    discount?: { amount: number; reason: string; by: string; at: string };
  };
  earned: number;
  reviewReason?: string;
  pendingReview: MuaFinancialEvent[];
  adjustments: { kind: MuaFinancialEvent['kind'] | 'correction'; amount: number; reference: string;
    reason: string; clientKey: string; by: string; at: string }[];
}

export function muaReportTable(report: MuaPerformanceReport) {
  const headers = ['Date', 'MUA Name', ...report.columns.map(({ name }) => name), 'Total Services'];
  const counts = (row: Record<string, number>) => report.columns.map(({ id }) => row[id] ?? 0);
  const rows = report.rows.map((row) => [report.date, row.name, ...counts(row.counts), row.totalServices]);
  return { headers, rows, total: [report.date, 'TOTAL', ...counts(report.totals), report.totalServices] };
}

export const formatMuaAmount = (pesos: number) => pesos.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

export function muaEarningsTable(report: MuaPerformanceReport) {
  const headers = ['Date', 'MUA Name', ...report.columns.map(({ name }) => name), 'Total Earnings'];
  const total = (values: number[]) => values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
  const rows = report.rows.map((row) => [report.date, row.name, ...report.columns.map(({ id }) => row.earnings[id] ?? 0), row.totalEarnings]);
  return { headers, rows, total: [report.date, 'TOTAL',
    ...report.columns.map(({ id }) => total(report.rows.map((row) => row.earnings[id] ?? 0))),
    total(report.rows.map((row) => row.totalEarnings))] };
}
