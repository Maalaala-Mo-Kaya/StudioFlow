import type { Workbook, Worksheet } from 'exceljs';
import { STUDIO_INFO } from '../../constants/studio';
import { artistTotals, sharedTotals, type MuaPayout, type MuaPayoutLine, type MuaSharedLine } from './muaPayouts';

// MUA pages for a workbook (the master Excel, and the MUA payout export): a summary of what each artist
// earned / was paid / is still owed, one sheet per artist with every service, the shared MUA money
// (Wardrobe …, split outside the system) and, when given, the payout log. The workbook is passed in,
// so this module never loads exceljs itself (callers load it lazily).

const PESO = '"₱"#,##0.00';
const GOLD = 'FFC9A227';
const box = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } as const;

function header(sheet: Worksheet, row: number) {
  const cells = sheet.getRow(row);
  cells.height = 30;
  cells.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FF0A0A0A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = box;
  });
}

function total(sheet: Worksheet, row: number) {
  sheet.getRow(row).eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4E7B7' } };
    cell.border = box;
  });
}

function title(sheet: Worksheet, text: string, period: string, columns: number) {
  sheet.mergeCells(1, 1, 1, columns);
  sheet.getCell(1, 1).value = `${STUDIO_INFO.name} · ${text}`;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, columns);
  sheet.getCell(2, 1).value = period;
  sheet.getCell(2, 1).font = { italic: true, color: { argb: 'FF555555' } };
}

const sum = (column: string, first: number, last: number, result: number) =>
  (last >= first ? { formula: `SUM(${column}${first}:${column}${last})`, result } : 0);
const round = (value: number) => Math.round(value * 100) / 100;
const yesNo = (line: { paidInFull: boolean; balance: number; status: string }) =>
  line.status === 'cancelled' ? 'Cancelled' : line.paidInFull ? 'Yes' : `No (balance ₱${line.balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })})`;

export interface MuaSheetsInput {
  lines: MuaPayoutLine[];
  shared: MuaSharedLine[];
  /** Recorded payouts to list (the payout export); omitted in the master Excel. */
  payouts?: MuaPayout[];
  /** Shown under each sheet title: "Nov 1 – Nov 15, 2026 · completions" … */
  period: string;
  /** Returns a unique, valid sheet name. */
  name: (wanted: string) => string;
}

export function addMuaPayoutSheets(workbook: Workbook, { lines, shared, payouts, period, name }: MuaSheetsInput) {
  const artists = artistTotals(lines);
  const pool = sharedTotals(shared);

  // ── Summary ─────────────────────────────────────────────────────────────────────────────
  const summary = workbook.addWorksheet(name('MUA SUMMARY'), { properties: { tabColor: { argb: GOLD } }, views: [{ showGridLines: false }] });
  summary.columns = [
    { key: 'artist', width: 30 }, { key: 'clients', width: 10 }, { key: 'services', width: 10 },
    { key: 'earned', width: 16, style: { numFmt: PESO } }, { key: 'paid', width: 16, style: { numFmt: PESO } },
    { key: 'unpaid', width: 16, style: { numFmt: PESO } }, { key: 'clientPaid', width: 20, style: { numFmt: PESO } },
    { key: 'review', width: 12 },
  ];
  title(summary, 'MUA Summary', period, 8);
  summary.getRow(4).values = ['MAKEUP ARTIST', 'CLIENTS', 'SERVICES', 'EARNED', 'PAID OUT', 'UNPAID',
    'EARNED ON FULLY PAID ORDERS', 'NEEDS REVIEW'];
  header(summary, 4);
  const first = 5;
  for (const artist of artists) {
    const row = summary.addRow([artist.artistName, artist.clients, artist.services, artist.earned, artist.paid,
      artist.unpaid, artist.clientPaid, artist.review || '']);
    row.eachCell((cell) => { cell.border = box; });
  }
  const last = first + artists.length - 1;
  const totals = summary.addRow(['TOTAL FOR ARTISTS',
    sum('B', first, last, artists.reduce((s, a) => s + a.clients, 0)), sum('C', first, last, artists.reduce((s, a) => s + a.services, 0)),
    sum('D', first, last, round(artists.reduce((s, a) => s + a.earned, 0))), sum('E', first, last, round(artists.reduce((s, a) => s + a.paid, 0))),
    sum('F', first, last, round(artists.reduce((s, a) => s + a.unpaid, 0))), sum('G', first, last, round(artists.reduce((s, a) => s + a.clientPaid, 0))),
    '']);
  total(summary, totals.number);
  summary.addRow([]);
  // Wardrobe and any other shared MUA charge: the team's money, split outside the system.
  summary.getRow(summary.rowCount + 1).values = ['WARDROBE / SHARED MUA MONEY', 'JOB ORDERS', '', 'AMOUNT', '', '', 'ON FULLY PAID ORDERS', ''];
  header(summary, summary.rowCount);
  const sharedJobs = new Set(shared.map((line) => line.jobId)).size;
  for (const [item, amount] of pool.byItem) {
    const lines = shared.filter((line) => line.item === item);
    summary.addRow([`   ${item}`, new Set(lines.map((line) => line.jobId)).size, '', amount, '', '',
      round(lines.filter((line) => line.paidInFull).reduce((s, line) => s + line.amount, 0))])
      .eachCell((cell) => { cell.border = box; });
  }
  const sharedRow = summary.addRow(['TOTAL WARDROBE / SHARED (not credited to one artist)', sharedJobs, '', pool.total, '', '', pool.clientPaid, '']);
  total(summary, sharedRow.number);
  const grand = summary.addRow(['TOTAL FOR MUA (artists + shared)', '', '',
    { formula: `D${totals.number}+D${sharedRow.number}`, result: round(artists.reduce((s, a) => s + a.earned, 0) + pool.total) }]);
  total(summary, grand.number);
  summary.addRow([]);
  for (const note of [
    'The client pays the studio everything; the studio pays the makeup artists.',
    'EARNED: what each artist earned for the services they completed (sold price, less its MUA discount share, plus adjustments).',
    'PAID OUT: lines covered by a recorded payout (MP-…). UNPAID: still owed. NEEDS REVIEW: amounts an admin must verify before paying.',
    'EARNED ON FULLY PAID ORDERS: of the earnings, those on orders the client has paid in full.',
    'WARDROBE / SHARED MUA MONEY: MUA charges that are not one artist\'s service (e.g. Wardrobe). It belongs to the MUA team and is split outside the system. The MUA WARDROBE & SHARED sheet lists each job order.',
  ]) summary.addRow([note]).font = { italic: true, color: { argb: 'FF555555' } };
  summary.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // ── One sheet per artist ────────────────────────────────────────────────────────────────
  for (const artist of artists) {
    const sheet = workbook.addWorksheet(name(`MUA - ${artist.artistName}`), { views: [{ state: 'frozen', ySplit: 4 }] });
    sheet.columns = [
      { key: 'date', width: 12 }, { key: 'job', width: 11, style: { numFmt: '@' } }, { key: 'client', width: 28 },
      { key: 'group', width: 18 }, { key: 'service', width: 26 }, { key: 'earned', width: 14, style: { numFmt: PESO } },
      { key: 'clientPaid', width: 22 }, { key: 'payout', width: 22 }, { key: 'note', width: 40 },
    ];
    title(sheet, `MUA · ${artist.artistName}`, period, 9);
    sheet.getRow(4).values = ['DATE', 'JOB ORDER', 'CLIENT', 'SCHOOL / SESSION', 'SERVICE', 'EARNED',
      'CLIENT PAID IN FULL', 'PAYOUT', 'NOTE'];
    header(sheet, 4);
    for (const line of artist.lines) {
      const row = sheet.addRow([line.date, line.jobOrder, line.client, line.group, line.service, line.earned,
        yesNo(line), line.payoutNo ? `${line.payoutNo} · ${line.paidAt.slice(0, 10)}` : 'UNPAID', line.review]);
      row.eachCell((cell) => { cell.border = box; });
      if (!line.payoutNo) row.getCell(8).font = { bold: true, color: { argb: 'FFC8102E' } };
    }
    const end = 4 + artist.lines.length;
    const earnedRow = sheet.addRow(['TOTAL EARNED', '', '', '', '', sum('F', 5, end, artist.earned)]);
    total(sheet, earnedRow.number);
    const unpaidRow = sheet.addRow(['UNPAID', '', '', '', '',
      end >= 5 ? { formula: `SUMIF(H5:H${end},"UNPAID",F5:F${end})`, result: artist.unpaid } : 0]);
    total(sheet, unpaidRow.number);
    unpaidRow.getCell(6).font = { bold: true, color: { argb: 'FFC8102E' } };
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }

  // ── Shared MUA money ────────────────────────────────────────────────────────────────────
  const pooled = workbook.addWorksheet(name('MUA WARDROBE & SHARED'), { views: [{ state: 'frozen', ySplit: 4 }] });
  pooled.columns = [
    { key: 'date', width: 12 }, { key: 'job', width: 11, style: { numFmt: '@' } }, { key: 'client', width: 28 },
    { key: 'group', width: 18 }, { key: 'item', width: 26 }, { key: 'amount', width: 14, style: { numFmt: PESO } },
    { key: 'clientPaid', width: 22 },
  ];
  title(pooled, 'Wardrobe & shared MUA money: each job order (split by the MUA team outside the system)', period, 7);
  pooled.getRow(4).values = ['ORDER DATE', 'JOB ORDER', 'CLIENT', 'SCHOOL / SESSION', 'ITEM', 'AMOUNT', 'CLIENT PAID IN FULL'];
  header(pooled, 4);
  for (const line of shared) {
    pooled.addRow([line.date, line.jobOrder, line.client, line.group, line.item, line.amount, yesNo(line)])
      .eachCell((cell) => { cell.border = box; });
  }
  const pooledTotal = pooled.addRow(['TOTAL', sharedJobs ? `${sharedJobs} job order${sharedJobs === 1 ? '' : 's'}` : '', '', '', '', sum('F', 5, 4 + shared.length, pool.total)]);
  total(pooled, pooledTotal.number);
  // Per item: "Wardrobe · 2 job orders · ₱100".
  for (const [item, amount] of pool.byItem) {
    const jobs = new Set(shared.filter((line) => line.item === item).map((line) => line.jobId)).size;
    pooled.addRow(['', `${jobs} job order${jobs === 1 ? '' : 's'}`, '', '', item, amount]).font = { italic: true };
  }

  // ── Payout log ──────────────────────────────────────────────────────────────────────────
  if (payouts) {
    const log = workbook.addWorksheet(name('MUA PAYOUT LOG'), { views: [{ state: 'frozen', ySplit: 4 }] });
    log.columns = [
      { key: 'no', width: 12 }, { key: 'artist', width: 24 }, { key: 'period', width: 24 },
      { key: 'amount', width: 14, style: { numFmt: PESO } }, { key: 'lines', width: 8 }, { key: 'paidBy', width: 20 },
      { key: 'paidAt', width: 20 }, { key: 'note', width: 30 }, { key: 'void', width: 40 },
    ];
    title(log, 'MUA payouts recorded', period, 9);
    log.getRow(4).values = ['PAYOUT', 'ARTIST', 'FOR SERVICES', 'AMOUNT', 'LINES', 'PAID BY', 'PAID AT', 'NOTE', 'VOIDED'];
    header(log, 4);
    for (const payout of payouts) {
      const row = log.addRow([payout.payoutNo, payout.artistName, `${payout.from} to ${payout.to}`,
        payout.voidedAt ? 0 : payout.amount, payout.lines.length, payout.paidBy, payout.paidAt.replace('T', ' ').slice(0, 16), payout.note,
        payout.voidedAt ? `VOIDED ${payout.voidedAt.slice(0, 10)} by ${payout.voidedBy}: ${payout.voidReason} (was ₱${payout.amount})` : '']);
      row.eachCell((cell) => { cell.border = box; });
    }
    const logTotal = log.addRow(['TOTAL PAID', '', '', sum('D', 5, 4 + payouts.length,
      round(payouts.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amount, 0)))]);
    total(log, logTotal.number);
  }
}
