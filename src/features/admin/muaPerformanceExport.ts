import { downloadBlob } from '../../utils/downloadBlob.ts';
import { muaEarningsTable, muaReportTable, type MuaPerformanceReport } from './muaPerformance.ts';
// Loaded only when needed (this module is also loaded directly by Node in the tests).
import type { MuaPayoutLine, MuaSharedLine } from './muaPayouts.ts';

export function muaReportCsv(report: MuaPerformanceReport, tab: 'performance' | 'earnings' = 'performance') {
  const { headers, rows, total } = tab === 'earnings' ? muaEarningsTable(report) : muaReportTable(report);
  const csvCell = (value: string | number) => {
    if (typeof value === 'number') return String(value);
    // Spreadsheet apps may evaluate a staff or service name as a formula.
    const safe = /^\s*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [headers, ...rows, total].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export async function buildMuaWorkbook(report: MuaPerformanceReport, tab: 'performance' | 'earnings' = 'performance',
  payouts?: { lines: MuaPayoutLine[]; shared: MuaSharedLine[] }) {
  const { default: { Workbook } } = await import('exceljs');
  const { headers, rows, total } = tab === 'earnings' ? muaEarningsTable(report) : muaReportTable(report);
  const workbook = new Workbook();
  // MUA SUMMARY first (artists and Wardrobe / shared money for the day), then the Wardrobe page.
  if (payouts) {
    const { addMuaPayoutSheets } = await import('./muaPayoutSheets.ts');
    const used = new Set<string>();
    addMuaPayoutSheets(workbook, { ...payouts, period: `${report.date} · services completed / job orders made that day`, name: (wanted) => {
      let candidate = wanted.slice(0, 28);
      for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${wanted.slice(0, 26)} ${n}`;
      used.add(candidate.toLowerCase());
      return candidate;
    } });
  }
  const sheet = workbook.addWorksheet(tab === 'earnings' ? 'MUA Earnings' : 'MUA Performance', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
    properties: { tabColor: { argb: 'FFC9A227' } },
  });
  sheet.columns = headers.map((name, index) => ({
    header: name,
    width: index === 0 ? 14 : index === 1 ? 28 : Math.min(34, Math.max(16, name.length + 2)),
    style: tab === 'earnings' && index > 1 ? { numFmt: '"₱"#,##0.00' } : {},
  }));
  for (const row of rows) sheet.addRow(row);
  const footer = sheet.addRow(total);
  const header = sheet.getRow(1);
  header.height = 34;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF0A0A0A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC9A227' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  footer.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4E7B7' } };
  });
  if (tab === 'earnings') {
    const audit = workbook.addWorksheet('Earnings Audit', { views: [{ state: 'frozen', ySplit: 1 }] });
    const labels = ['Job Order', 'MUA Name', 'Service', 'Quantity', 'Unit Price', 'Original Earnings', 'Net Earnings',
      'Entry', 'Amount', 'Reference', 'Reason', 'Recorded By', 'Recorded At'];
    audit.columns = labels.map((name, index) => ({
      header: name,
      width: index === 10 ? 54 : Math.max(18, name.length + 2),
      style: [4, 5, 6, 8].includes(index) ? { numFmt: '"₱"#,##0.00' } : {},
    }));
    audit.getRow(1).font = { bold: true };
    for (const artist of report.rows) for (const item of artist.details) {
      const { basis, adjustments } = item;
      const summary = [item.jobOrder, item.artistName, item.serviceName, basis.quantity,
        basis.unit === undefined ? null : basis.unit / 100, basis.earned / 100, item.earned / 100];
      audit.addRow([...summary, 'Completion', null, '', item.reviewReason ?? '', item.actorName, item.completedAt]);
      if (basis.discount) audit.addRow([...summary, 'Discount at completion', -basis.discount.amount / 100,
        '', basis.discount.reason, basis.discount.by, basis.discount.at]);
      for (const adjustment of adjustments) audit.addRow([...summary, adjustment.kind,
        adjustment.amount / 100, adjustment.reference, adjustment.reason, adjustment.by, adjustment.at]);
      for (const event of item.pendingReview) audit.addRow([...summary, `${event.kind} to review`, event.amount / 100, event.reference]);
    }
  }
  return workbook;
}

export async function downloadMuaReport(report: MuaPerformanceReport, format: 'csv' | 'xlsx', tab: 'performance' | 'earnings' = 'performance') {
  const filename = `StudioFlow-MUA-${tab}-${report.date}.${format}`;
  if (format === 'csv') {
    downloadBlob(new Blob(['\uFEFF', muaReportCsv(report, tab)], { type: 'text/csv;charset=utf-8' }), filename);
  } else {
    // The day's payout lines and Wardrobe / shared charges, for the summary pages.
    const { pb } = await import('../../db/pocketbase.ts');
    const payouts = tab === 'earnings'
      ? await pb.send<{ lines: MuaPayoutLine[]; shared: MuaSharedLine[] }>(`/api/studioflow/mua-payouts?from=${report.date}&to=${report.date}`, {})
      : undefined;
    const workbook = await buildMuaWorkbook(report, tab, payouts);
    const bytes = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([new Uint8Array(bytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }), filename);
  }
}
