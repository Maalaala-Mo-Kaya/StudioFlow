import { downloadBlob } from '../../utils/downloadBlob.ts';
import { muaEarningsTable, muaReportTable, type MuaPerformanceReport } from './muaPerformance.ts';

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
  const { headers, rows, total } = tab === 'earnings' ? muaEarningsTable(report) : muaReportTable(report);
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('MUA Performance', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
    properties: { tabColor: { argb: 'FFC9A227' } },
  });
  sheet.columns = headers.map((name, index) => ({
    header: name,
    width: index === 0 ? 14 : index === 1 ? 28 : Math.min(34, Math.max(16, name.length + 2)),
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
  return workbook;
}

export async function downloadMuaReport(report: MuaPerformanceReport, format: 'csv' | 'xlsx', tab: 'performance' | 'earnings' = 'performance') {
  const filename = `StudioFlow-MUA-${tab}-${report.date}.${format}`;
  if (format === 'csv') {
    downloadBlob(new Blob(['\uFEFF', muaReportCsv(report, tab)], { type: 'text/csv;charset=utf-8' }), filename);
  } else {
    const workbook = await buildMuaWorkbook(report, tab);
    const bytes = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([new Uint8Array(bytes)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }), filename);
  }
}
