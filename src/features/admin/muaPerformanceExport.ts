import type { Workbook } from 'exceljs';
import { downloadBlob } from '../../utils/downloadBlob.ts';
import { muaEarningsTable, muaReportTable, type MuaPerformanceReport } from './muaPerformance.ts';
import type { MuaPayoutReport } from './muaPayouts.ts';

interface MuaExportReport {
  performance: MuaPerformanceReport;
  payouts: MuaPayoutReport;
}

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

export async function buildMuaWorkbook(report: MuaPerformanceReport, tab: 'performance' | 'earnings' = 'performance') {
  const { default: { Workbook } } = await import('exceljs');
  const workbook = new Workbook();
  addAnalyticsSheet(workbook, report, tab);
  if (tab === 'earnings') addEarningsAudit(workbook, report);
  return workbook;
}

function addAnalyticsSheet(workbook: Workbook, report: MuaPerformanceReport, tab: 'performance' | 'earnings', period = report.date) {
  const { headers, rows, total } = tab === 'earnings' ? muaEarningsTable(report) : muaReportTable(report);
  const ranged = period !== report.date;
  const sheet = workbook.addWorksheet(tab === 'earnings' ? 'MUA Earnings' : 'MUA Performance', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
    properties: { tabColor: { argb: 'FFC9A227' } },
  });
  sheet.columns = headers.map((name, index) => ({
    header: index === 0 && ranged ? 'Period' : name,
    width: index === 0 ? Math.max(14, period.length + 2) : index === 1 ? 28 : Math.min(34, Math.max(16, name.length + 2)),
    style: tab === 'earnings' && index > 1 ? { numFmt: '"₱"#,##0.00' } : {},
  }));
  for (const row of rows) sheet.addRow([period, ...row.slice(1)]);
  const footer = sheet.addRow([period, ...total.slice(1)]);
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
}

function addEarningsAudit(workbook: Workbook, report: MuaPerformanceReport) {
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

export async function buildMuaExportWorkbook({ performance, payouts }: MuaExportReport) {
  const [{ default: { Workbook } }, { addMuaPayoutSheets }, { STUDIO_INFO }] = await Promise.all([
    import('exceljs'), import('./muaPayoutSheets.ts'), import('../../constants/studio.ts'),
  ]);
  const workbook = new Workbook();
  workbook.creator = STUDIO_INFO.name;
  workbook.calcProperties.fullCalcOnLoad = true;
  const period = payouts.from === payouts.to ? payouts.from : `${payouts.from} to ${payouts.to}`;
  addAnalyticsSheet(workbook, performance, 'performance', period);
  addAnalyticsSheet(workbook, performance, 'earnings', period);
  const used = new Set([...workbook.worksheets.map((sheet) => sheet.name.toLowerCase()), 'earnings audit']);
  addMuaPayoutSheets(workbook, {
    ...payouts,
    period: `${period} · services completed / job orders made in this period`,
    name: (wanted) => {
      const base = (wanted === 'MUA SUMMARY' ? 'MUA Payouts' : wanted)
        .replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Sheet';
      let candidate = base;
      for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base.slice(0, 27 - String(n).length)} ${n}`;
      used.add(candidate.toLowerCase());
      return candidate;
    },
  });
  addEarningsAudit(workbook, performance);
  return workbook;
}

export async function downloadMuaExport(from: string, to: string) {
  const { pb } = await import('../../db/pocketbase.ts');
  const query = new URLSearchParams({ from, to });
  const data = await pb.send<MuaExportReport>(`/api/studioflow/mua-export?${query}`, { cache: 'no-store' });
  if (!Array.isArray(data?.performance?.rows) || !Array.isArray(data?.payouts?.lines)) {
    throw new Error('MUA reports are unavailable. Check that the StudioFlow server is up to date.');
  }
  const workbook = await buildMuaExportWorkbook(data);
  const bytes = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), `StudioFlow-MUA_${from}_to_${to}.xlsx`);
}
