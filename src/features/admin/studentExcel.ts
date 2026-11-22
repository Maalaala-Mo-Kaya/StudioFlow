import ExcelJS, { type Row, type Workbook } from 'exceljs';
import { formatCurrency } from '../../utils/formatters';
import { downloadBlob } from '../../utils/downloadBlob';
import { STUDIO_INFO } from '../../constants/studio';
import type { RevenueSplit } from '../../types';
import { allocateRevenue, revenueKeys } from '../../utils/revenue';

interface CatalogColumn {
  id: string;
  code: string;
  name: string;
  amount: number;
}

interface StudentExcelRow {
  /** 'college', 'shs', 'walkin', or another level's name in capitals (e.g. 'ELEMENTARY'). */
  level: string;
  /** The level as named by the school (e.g. "College", "Senior High School"). */
  levelName?: string;
  /** Organization id, or '__walkin'. */
  schoolId?: string;
  schoolName?: string;
  schoolCode?: string;
  cancelled?: boolean;
  /** Who cancelled, when (PocketBase UTC) and why; set on cancelled orders only. */
  cancellation?: { at: string; by: string; reason: string; statusBefore: string } | null;
  /** Registration time (PocketBase UTC). */
  created?: string;
  /** Pictorial date (or a walk-in's event date); empty when not set. */
  date: string;
  jobOrder: string;
  course: string;
  name: string;
  packageId: string;
  packageCode: string;
  packageAmount: number;
  addOns: Record<string, number>;
  /** Other fees on the job order, in centavos (part of TOTAL DUE). */
  otherFees?: number;
  discount?: number;
  /** "10% · reason · by …", shown as a note on the DISCOUNT cell. */
  discountNote?: string;
  revenueTerms?: RevenueSplit | null;
  /** Job order total, in centavos. */
  due: number;
  /** Counted payments (voided excluded) and refunds given back, in centavos. */
  payments: { full: number; additional: number; down: number; refunded?: number };
}

export interface StudentExcelData {
  packages: CatalogColumn[];
  addOns: CatalogColumn[];
  rows: StudentExcelRow[];
}

/** What to export: every level as before, all schools (one sheet each), one school, or walk-ins. */
export type OverallScope =
  | { kind: 'levels' }
  | { kind: 'master' }
  | { kind: 'school'; schoolId: string }
  | { kind: 'walkin' };

/** Inclusive Philippine dates, YYYY-MM-DD. Either end may be left open. */
export interface DateRange { from?: string; to?: string }

export const WALKIN_SCHOOL = '__walkin';

const studentColumns = [
  { key: 'date', header: 'DATE OF PICTORIAL', width: 16, style: { numFmt: 'dd-mmm-yy' } },
  { key: 'jobOrder', header: 'STUDIO #', width: 12, style: { numFmt: '@' } },
  { key: 'course', header: 'COURSE', width: 14 },
  { key: 'name', header: 'NAME', width: 32 },
  { key: 'packageCode', header: 'PACKAGE CODE', width: 15 },
];
const financialColumns = [
  { key: 'due', header: 'TOTAL DUE' },
  { key: 'full', header: 'FULL PAYMENT' },
  { key: 'additional', header: 'ADDITIONAL PAYMENT' },
  { key: 'down', header: 'DOWN PAYMENT' },
  { key: 'refunded', header: 'REFUNDED' },
  { key: 'total', header: 'TOTAL PAYMENT (less refunds)' },
  { key: 'balance', header: 'BALANCE' },
  { key: 'studio', header: 'STUDIO REVENUE' },
  { key: 'mua', header: 'OTHER PAYMENT - MUA' },
  { key: 'unallocated', header: 'UNALLOCATED CASH' },
  { key: 'credit', header: 'DISCOUNT CREDIT' },
  { key: 'operational', header: 'OPERATIONAL COLLECTED' },
];
const PESO = '"₱"#,##0.00;-"₱"#,##0.00';
/** Column key for other fees (shown only when an order in the export has some). */
const OTHER_FEES = 'otherFees';
const DISCOUNT = 'discount';
const totalsKeys = financialColumns.map(({ key }) => key);
const peso = { numFmt: PESO };
const studioDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});
const longDate = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' });
const stamp = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});
const catalogWidth = (name: string) => Math.min(44, Math.max(24, Math.ceil(name.length / 2) + 4));
const LEVEL_ORDER = ['college', 'shs'];

function pictorialDate(value: string) {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(studioDate.formatToParts(date).map(({ type, value }) => [type, Number(value)]));
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

/** The day an order belongs to: its pictorial / event date, or the day it was registered. */
export function orderDay(row: Pick<StudentExcelRow, 'date' | 'created'>): string {
  const value = row.date || row.created || '';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? studioDate.format(date) : '';
}

export function inRange(row: Pick<StudentExcelRow, 'date' | 'created'>, range: DateRange = {}): boolean {
  if (!range.from && !range.to) return true;
  const day = orderDay(row);
  return Boolean(day) && (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

export function rangeLabel(range: DateRange = {}): string {
  const show = (day: string) => longDate.format(new Date(`${day}T00:00:00Z`));
  if (range.from && range.to) return range.from === range.to ? show(range.from) : `${show(range.from)} to ${show(range.to)}`;
  if (range.from) return `from ${show(range.from)}`;
  if (range.to) return `up to ${show(range.to)}`;
  return 'All dates';
}

/** Excel sheet names: max 31 characters, none of : \ / ? * [ ], unique (case-insensitive). */
function sheetName(wanted: string, used: Set<string>) {
  const base = wanted.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Sheet';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 27 - String(n).length)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/** Cell references to a sheet's totals, used by the Summary sheet. */
interface SheetTotals {
  sheet: string;
  row: number;
  countCell: string;
  count: number;
  columns: Record<string, { letter: string; result: number }>;
}

const statusLabel = (status: string) => status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

/**
 * One line per cancelled job order: who cancelled it, when and why, and the money it still holds.
 * They owe nothing, so they stay off the school sheets; the Summary links to this sheet's TOTAL row.
 */
function writeCancelledSheet(workbook: Workbook, title: string, orders: StudentExcelRow[], period: string) {
  const sheet = workbook.addWorksheet(title, {
    views: [{ state: 'frozen', xSplit: 5, ySplit: 1 }],
    properties: { tabColor: { argb: 'FF9B2C2C' } },
  });
  const money = ['due', 'paid', 'refunded', 'kept', ...revenueKeys] as const;
  sheet.columns = [
    { key: 'date', header: 'DATE OF PICTORIAL / EVENT', width: 16, style: { numFmt: 'dd-mmm-yy' } },
    { key: 'jobOrder', header: 'STUDIO #', width: 12, style: { numFmt: '@' } },
    { key: 'school', header: 'SCHOOL / CLIENT TYPE', width: 16 },
    { key: 'course', header: 'COURSE / SESSION', width: 14 },
    { key: 'name', header: 'NAME', width: 32 },
    { key: 'packageCode', header: 'PACKAGE CODE', width: 15 },
    { key: 'statusBefore', header: 'STATUS BEFORE CANCELLING', width: 18 },
    { key: 'cancelledOn', header: 'CANCELLED ON', width: 14, style: { numFmt: 'dd-mmm-yy' } },
    { key: 'cancelledBy', header: 'CANCELLED BY', width: 18 },
    { key: 'reason', header: 'REASON', width: 40, style: { alignment: { wrapText: true, vertical: 'top' } } },
    { key: 'due', header: 'JOB ORDER TOTAL (not owed)', width: 17, style: peso },
    { key: 'paid', header: 'PAID', width: 17, style: peso },
    { key: 'refunded', header: 'REFUNDED', width: 17, style: peso },
    { key: 'kept', header: 'MONEY KEPT (paid less refunds)', width: 17, style: peso },
    ...financialColumns.filter(({ key }) => key === 'studio' || key === 'mua' || key === 'unallocated')
      .map((column) => ({ ...column, width: 17, style: peso })),
  ];
  const header = sheet.getRow(1);
  header.height = 48;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A0A0A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
  sheet.headerFooter.oddFooter = `&L${STUDIO_INFO.name} · Cancelled job orders · ${period}&RPage &P of &N`;

  const sorted = [...orders].sort((a, b) =>
    (a.cancellation?.at || '').localeCompare(b.cancellation?.at || '') || a.jobOrder.localeCompare(b.jobOrder));
  const sums = { due: 0, paid: 0, refunded: 0, kept: 0, studio: 0, mua: 0, unallocated: 0 };
  for (const order of sorted) {
    const paid = order.payments.full + order.payments.additional + order.payments.down;
    const refunded = order.payments.refunded ?? 0;
    const kept = paid - refunded;
    const amounts = { ...allocateRevenue(kept, order.revenueTerms ?? { studio: 0, mua: 0, unallocated: order.due }),
      due: order.due, paid, refunded, kept };
    for (const key of money) sums[key] += amounts[key];
    const row = sheet.addRow({
      date: pictorialDate(order.date),
      jobOrder: order.jobOrder,
      school: order.level === 'walkin' ? 'WALK-IN' : order.schoolCode || order.schoolName || '',
      course: order.course,
      name: order.name,
      packageCode: order.packageCode,
      statusBefore: order.cancellation?.statusBefore ? statusLabel(order.cancellation.statusBefore) : '',
      cancelledOn: pictorialDate(order.cancellation?.at || ''),
      cancelledBy: order.cancellation?.by || '',
      reason: order.cancellation?.reason || '',
      ...Object.fromEntries(money.map((key) => [key, amounts[key] / 100])),
    });
    row.getCell('kept').value = {
      formula: `ROUND(${row.getCell('paid').address}-${row.getCell('refunded').address},2)`,
      result: amounts.kept / 100,
    };
  }
  const first = 2;
  const last = sheet.rowCount;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: last, column: sheet.columnCount } };
  sheet.addRow([]).height = 8;
  const totalRow = sheet.addRow({ name: `TOTAL (${sorted.length} cancelled)` });
  const letters = Object.fromEntries(money.map((key) => [key, sheet.getColumn(key).letter])) as Record<typeof money[number], string>;
  for (const key of money) {
    totalRow.getCell(key).value = { formula: `ROUND(SUM(${letters[key]}${first}:${letters[key]}${last}),2)`, result: sums[key] / 100 };
  }
  totalRow.height = 20;
  for (let column = 1; column <= sheet.columnCount; column++) {
    const cell = totalRow.getCell(column);
    cell.font = { bold: true, color: { argb: 'FF0A0A0A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4E7B7' } };
  }
  sheet.addRow([]);
  sheet.addRow({ name: 'Cancelled job orders owe nothing. Money kept still counts as collected; refunds are money given back.' })
    .font = { italic: true };
  return { sheet: title, row: totalRow.number, letters };
}

export function buildStudentWorkbook(
  { packages, addOns, rows: allRows }: StudentExcelData,
  scope: OverallScope = { kind: 'levels' },
  range: DateRange = {},
  now = new Date(),
) {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.creator = STUDIO_INFO.name;
  const packageColumns = packages.map((pkg) => ({
    key: `package:${pkg.id}`,
    header: [pkg.code, pkg.name, formatCurrency(pkg.amount, { exact: true })].filter(Boolean).join('\n'),
    width: catalogWidth(pkg.name),
    style: peso,
  }));
  const addOnColumns = addOns.map((item) => ({
    key: `addon:${item.id}`,
    header: `${item.name}\n${formatCurrency(item.amount, { exact: true })}`,
    width: catalogWidth(item.name),
    style: peso,
  }));
  // Orders in the date range, for the chosen scope. Cancelled orders are left off the sheets:
  // they are no longer owed; the Summary lists any money already received from them.
  const scoped = allRows.filter((row) => inRange(row, range) && (
    scope.kind === 'levels' || scope.kind === 'master'
    || (scope.kind === 'walkin' && row.level === 'walkin')
    || (scope.kind === 'school' && row.level !== 'walkin' && row.schoolId === scope.schoolId)));
  const rows = scoped.filter((row) => !row.cancelled);
  const cancelled = scoped.filter((row) => row.cancelled);

  // Other fees are part of TOTAL DUE; their column appears only when an order in this export has some,
  // so package + add-ons + other fees always add up to TOTAL DUE on every row.
  const otherFeesColumns = rows.some((row) => (row.otherFees ?? 0) > 0)
    ? [{ key: OTHER_FEES, header: 'OTHER FEES', width: 16, style: peso }] : [];
  const discountColumns = rows.some((row) => (row.discount ?? 0) > 0)
    ? [{ key: DISCOUNT, header: 'DISCOUNT', width: 16, style: peso }] : [];
  const catalogColumns = [...packageColumns, ...addOnColumns, ...otherFeesColumns, ...discountColumns];
  const moneyColumns = [...catalogColumns, ...financialColumns];
  const definitions = [
    ...studentColumns,
    ...catalogColumns,
    ...financialColumns.map((column) => ({ ...column, width: 17, style: peso })),
  ];
  const period = rangeLabel(range);

  const used = new Set<string>();
  const summary = scope.kind === 'levels' ? null : workbook.addWorksheet(sheetName('SUMMARY', used));

  /** Writes one Overall sheet. With `grouped`, students are grouped by level with subtotals. */
  const writeSheet = (title: string, students: StudentExcelRow[], walkin: boolean, grouped: boolean): SheetTotals => {
    const sheet = workbook.addWorksheet(title, {
      views: [{ state: 'frozen', xSplit: studentColumns.length, ySplit: 1 }],
      properties: { tabColor: { argb: 'FFC9A227' } },
    });
    sheet.columns = definitions;
    if (walkin) {
      sheet.getCell(1, 1).value = 'SESSION / EVENT DATE';
      sheet.getCell(1, 3).value = 'SESSION';
    }
    const header = sheet.getRow(1);
    header.height = 76;
    header.eachCell((cell, column) => {
      const details = column <= studentColumns.length;
      cell.font = { bold: true, color: { argb: details ? 'FFFFFFFF' : 'FF0A0A0A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: details ? 'FF0A0A0A' : 'FFC9A227' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' };
    sheet.headerFooter.oddFooter = `&L${STUDIO_INFO.name} · ${title} · ${period}&RPage &P of &N`;

    const letter = (key: string) => sheet.getColumn(key).letter;
    const styleTotals = (row: Row) => {
      row.height = 20;
      for (let column = 1; column <= definitions.length; column++) {
        const cell = row.getCell(column);
        cell.font = { bold: true, color: { argb: 'FF0A0A0A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4E7B7' } };
      }
    };

    // Groups: by level (College first, then SHS, then others) or one group with everything.
    const groups = new Map<string, StudentExcelRow[]>();
    for (const student of students) {
      const key = grouped ? student.level : 'all';
      groups.set(key, [...(groups.get(key) ?? []), student]);
    }
    const order = [...groups.keys()].sort((a, b) => {
      const rank = (key: string) => (LEVEL_ORDER.includes(key) ? LEVEL_ORDER.indexOf(key) : LEVEL_ORDER.length);
      return rank(a) - rank(b) || a.localeCompare(b);
    });

    const grand = new Map<string, number>();
    const blocks: Array<{ first: number; last: number; subtotalRow?: number }> = [];
    for (const key of order) {
      const block = (groups.get(key) ?? []).sort((a, b) => a.course.localeCompare(b.course) || a.name.localeCompare(b.name));
      if (grouped) {
        const label = sheet.addRow({ name: (block[0]?.levelName || key).toUpperCase() });
        label.font = { bold: true, size: 12 };
      }
      const first = sheet.rowCount + 1;
      const amounts = new Map<string, number>();
      for (const student of block) {
        const { full, additional, down } = student.payments;
        const refunded = student.payments.refunded ?? 0;
        const total = full + additional + down - refunded;
        const balance = Math.max(0, student.due - total);
        const charges: Record<string, number> = {};
        if (student.packageId) charges[`package:${student.packageId}`] = student.packageAmount;
        for (const [id, amount] of Object.entries(student.addOns)) charges[`addon:${id}`] = amount;
        if ((student.otherFees ?? 0) > 0) charges[OTHER_FEES] = student.otherFees ?? 0;
        if (student.discount) charges[DISCOUNT] = -student.discount;
        const revenue = allocateRevenue(total, student.revenueTerms ?? { studio: 0, mua: 0, unallocated: student.due });
        const granted = student.discount ?? 0;
        const credit = Math.min(granted, Math.max(0, student.due + granted - total));
        const amountsInRow = { ...charges, ...revenue, due: student.due, full, additional, down, refunded, total, balance,
          credit, operational: total + credit };
        for (const [column, amount] of Object.entries(amountsInRow)) {
          amounts.set(column, (amounts.get(column) ?? 0) + amount);
          grand.set(column, (grand.get(column) ?? 0) + amount);
        }
        const row = sheet.addRow({
          date: pictorialDate(student.date), jobOrder: student.jobOrder, course: student.course,
          name: student.name, packageCode: student.packageCode,
          ...Object.fromEntries(Object.entries(amountsInRow).map(([column, cents]) => [column, cents / 100])),
        });
        // Why the discount was given, as a cell note (hover in Excel); no effect on the formulas.
        if (student.discount && student.discountNote) row.getCell(DISCOUNT).note = student.discountNote;
        const totalCell = row.getCell('total');
        totalCell.value = {
          formula: `ROUND(SUM(${row.getCell('full').address}:${row.getCell('down').address})-${row.getCell('refunded').address},2)`,
          result: total / 100,
        };
        row.getCell('balance').value = {
          formula: `MAX(0,ROUND(${row.getCell('due').address}-${totalCell.address},2))`,
          result: balance / 100,
        };
      }
      const last = sheet.rowCount;
      if (grouped) {
        const subtotal = sheet.addRow({ name: `${(block[0]?.levelName || key).toUpperCase()} SUBTOTAL (${block.length})` });
        for (const { key: column } of moneyColumns) {
          subtotal.getCell(column).value = block.length
            ? { formula: `ROUND(SUM(${letter(column)}${first}:${letter(column)}${last}),2)`, result: (amounts.get(column) ?? 0) / 100 }
            : 0;
        }
        subtotal.font = { bold: true };
        subtotal.eachCell((cell) => { cell.border = { top: { style: 'thin' } }; });
        blocks.push({ first, last, subtotalRow: subtotal.number });
        sheet.addRow([]);
      } else {
        blocks.push({ first, last });
      }
    }

    if (!grouped && students.length) {
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: definitions.length } };
    }
    // Excel can extend an AutoFilter to contiguous rows when opening the file.
    sheet.addRow([]).height = 8;
    const totalRow = sheet.addRow({ name: grouped ? 'TOTAL AMOUNT (all levels)' : 'TOTAL AMOUNT' });
    const countRow = sheet.addRow({ name: walkin ? 'NO. CLIENTS' : 'NO. STUDENTS' });
    const sumAcross = (column: string) => (grouped
      ? blocks.map((block) => `${letter(column)}${block.subtotalRow}`).join('+')
      : blocks.map((block) => `SUM(${letter(column)}${block.first}:${letter(column)}${block.last})`).join('+'));
    const columns: SheetTotals['columns'] = {};
    for (const { key: column } of moneyColumns) {
      const result = (grand.get(column) ?? 0) / 100;
      totalRow.getCell(column).value = students.length ? { formula: `ROUND(${sumAcross(column)},2)`, result } : 0;
      columns[column] = { letter: letter(column), result };
    }
    const nameRanges = blocks.filter((block) => block.last >= block.first)
      .map((block) => `COUNTA(${letter('name')}${block.first}:${letter('name')}${block.last})`);
    countRow.getCell('jobOrder').value = nameRanges.length ? { formula: nameRanges.join('+'), result: students.length } : 0;
    countRow.getCell('jobOrder').numFmt = '0';
    for (const { key: column } of catalogColumns) {
      const cell = countRow.getCell(column);
      const counted = blocks.filter((block) => block.last >= block.first)
        .map((block) => `COUNT(${letter(column)}${block.first}:${letter(column)}${block.last})`);
      const count = students.filter((student) => (column === OTHER_FEES
        ? (student.otherFees ?? 0) > 0
        : column === DISCOUNT ? (student.discount ?? 0) > 0
        : column === `package:${student.packageId}`
          || Object.prototype.hasOwnProperty.call(student.addOns, column.replace(/^addon:/, '')))).length;
      cell.value = counted.length ? { formula: counted.join('+'), result: count } : 0;
      cell.numFmt = '0';
    }
    styleTotals(totalRow);
    styleTotals(countRow);
    return { sheet: title, row: totalRow.number, countCell: `${letter('jobOrder')}${countRow.number}`, count: students.length, columns };
  };

  const totals: Array<{ code: string; name: string; result: SheetTotals }> = [];
  if (scope.kind === 'levels') {
    // As before: one sheet per level, every school together.
    const sheets: Array<[string, string]> = [['college', 'COLLEGE OVERALL'], ['shs', 'SHS OVERALL']];
    const otherLevels = [...new Set(rows.map((row) => row.level))]
      .filter((level) => !['college', 'shs', 'walkin'].includes(level)).sort();
    for (const level of otherLevels) sheets.push([level, `${level.slice(0, 20)} OVERALL`]);
    if (rows.some((row) => row.level === 'walkin')) sheets.push(['walkin', 'WALK-IN OVERALL']);
    for (const [level, title] of sheets) {
      writeSheet(sheetName(title, used), rows.filter((row) => row.level === level), level === 'walkin', false);
    }
  } else {
    // One sheet per school (grouped by level), walk-ins last.
    const bySchool = new Map<string, StudentExcelRow[]>();
    for (const row of rows) {
      const key = row.level === 'walkin' ? WALKIN_SCHOOL : row.schoolId || '';
      bySchool.set(key, [...(bySchool.get(key) ?? []), row]);
    }
    if (scope.kind === 'school' && !bySchool.size) bySchool.set(scope.schoolId, []);
    if (scope.kind === 'walkin' && !bySchool.size) bySchool.set(WALKIN_SCHOOL, []);
    const keys = [...bySchool.keys()].sort((a, b) => {
      if (a === WALKIN_SCHOOL || b === WALKIN_SCHOOL) return Number(a === WALKIN_SCHOOL) - Number(b === WALKIN_SCHOOL);
      const first = (key: string) => bySchool.get(key)?.[0];
      return (first(a)?.schoolCode || first(a)?.schoolName || '').localeCompare(first(b)?.schoolCode || first(b)?.schoolName || '');
    });
    for (const key of keys) {
      const students = bySchool.get(key) ?? [];
      const sample = students[0] ?? allRows.find((row) => (key === WALKIN_SCHOOL ? row.level === 'walkin' : row.schoolId === key));
      const walkin = key === WALKIN_SCHOOL;
      const code = walkin ? 'WALK-IN' : sample?.schoolCode || sample?.schoolName || 'SCHOOL';
      const name = walkin ? 'Walk-in clients' : sample?.schoolName || 'School';
      totals.push({ code, name, result: writeSheet(sheetName(code, used), students, walkin, !walkin) });
    }
  }

  const cancelledTotals = cancelled.length ? writeCancelledSheet(workbook, sheetName('CANCELLED', used), cancelled, period) : null;

  if (summary) {
    // Summary: one line per school sheet, linked to that sheet's TOTAL row, plus cancelled orders.
    summary.columns = [
      { key: 'code', width: 14 }, { key: 'name', width: 38 }, { key: 'count', width: 10 },
      ...totalsKeys.map((key) => ({ key, width: 17, style: peso })),
    ];
    summary.getCell('A1').value = `${STUDIO_INFO.name} · Overall Summary`;
    summary.getCell('A1').font = { bold: true, size: 14 };
    summary.getCell('A2').value = `Job orders dated ${period} (pictorial date, or registration date when there is none). Payments: everything received for these job orders.`;
    summary.getCell('A3').value = `Exported ${stamp.format(now)}`;
    const head = summary.getRow(5);
    head.values = ['CODE', 'SCHOOL / CLIENTS', 'CLIENTS', ...financialColumns.map(({ header }) => header)];
    head.font = { bold: true };
    head.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    head.eachCell((cell) => { cell.border = { bottom: { style: 'medium' } }; });
    const firstLine = 6;
    const ref = (sheet: string, cell: string) => `'${sheet.replace(/'/g, "''")}'!${cell}`;
    for (const { code, name, result } of totals) {
      const line = summary.addRow({ code, name });
      line.getCell('count').value = { formula: ref(result.sheet, result.countCell), result: result.count };
      for (const key of totalsKeys) {
        const column = result.columns[key];
        line.getCell(key).value = { formula: ref(result.sheet, `${column.letter}${result.row}`), result: column.result };
      }
    }
    // Cancelled orders owe nothing; money already received from them still counts as collected.
    const kept = cancelled.reduce((sum, row) => sum + row.payments.full + row.payments.additional + row.payments.down - (row.payments.refunded ?? 0), 0) / 100;
    const keptPart = (key: 'full' | 'additional' | 'down' | 'refunded') => cancelled.reduce((sum, row) => sum + (row.payments[key] ?? 0), 0) / 100;
    if (cancelledTotals) {
      const line = summary.addRow({
        code: 'CANCELLED', name: `Cancelled job orders (${cancelled.length}): money kept after refunds, nothing owed (see CANCELLED sheet)`, count: 0,
        full: keptPart('full'), additional: keptPart('additional'), down: keptPart('down'), balance: 0,
      });
      const linked = (column: keyof typeof cancelledTotals.letters, result: number) =>
        ({ formula: ref(cancelledTotals.sheet, `${cancelledTotals.letters[column]}${cancelledTotals.row}`), result });
      line.getCell('due').value = linked('kept', kept);
      line.getCell('refunded').value = linked('refunded', keptPart('refunded'));
      line.getCell('total').value = linked('kept', kept);
      line.getCell('operational').value = linked('kept', kept);
      for (const key of revenueKeys) {
        const result = cancelled.reduce((sum, order) => {
          const net = order.payments.full + order.payments.additional + order.payments.down - (order.payments.refunded ?? 0);
          return sum + allocateRevenue(net, order.revenueTerms ?? { studio: 0, mua: 0, unallocated: order.due })[key];
        }, 0) / 100;
        line.getCell(key).value = linked(key, result);
      }
    }
    const lastLine = summary.rowCount;
    summary.addRow([]);
    const grand = summary.addRow({ code: 'GRAND TOTAL' });
    for (const key of ['count', ...totalsKeys]) {
      const column = summary.getColumn(key).letter;
      const result = Array.from({ length: lastLine - firstLine + 1 }, (_, index) => summary.getRow(firstLine + index).getCell(key).value)
        .reduce<number>((sum, value) => sum + (typeof value === 'number' ? value
          : value && typeof value === 'object' && 'result' in value ? Number((value as { result: unknown }).result) || 0 : 0), 0);
      grand.getCell(key).value = lastLine >= firstLine
        ? { formula: `ROUND(SUM(${column}${firstLine}:${column}${lastLine}),2)`, result: Math.round(result * 100) / 100 }
        : 0;
    }
    grand.font = { bold: true };
    grand.eachCell((cell) => { cell.border = { top: { style: 'medium' }, bottom: { style: 'double' } }; });
    // Clients who paid more than their total (after a cheaper package) have balance 0 and are owed money back.
    const refundDue = rows.reduce((sum, row) => {
      const paid = row.payments.full + row.payments.additional + row.payments.down - (row.payments.refunded ?? 0);
      return sum + Math.max(0, paid - row.due);
    }, 0) / 100;
    const owed = summary.addRow({ name: 'Refund due: paid more than the total, still to be given back (TOTAL PAYMENT above TOTAL DUE on a client row)' });
    owed.getCell('due').value = refundDue;
    const letterOf = (key: string) => summary.getColumn(key).letter;
    const grandOf = (key: string) => {
      const value = grand.getCell(key).value;
      return typeof value === 'number' ? value : value && typeof value === 'object' && 'result' in value ? Number(value.result) || 0 : 0;
    };
    const difference = Math.round((grandOf('due') - grandOf('total') - grandOf('balance') + refundDue) * 100) / 100;
    const check = summary.addRow({ name: 'Check: TOTAL DUE − TOTAL PAYMENT − BALANCE + REFUND DUE (must be ₱0.00)' });
    check.getCell('due').value = {
      formula: `ROUND(${letterOf('due')}${grand.number}-${letterOf('total')}${grand.number}-${letterOf('balance')}${grand.number}+${letterOf('due')}${owed.number},2)`,
      result: difference,
    };
    check.getCell('name').font = { bold: true };
    summary.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    summary.headerFooter.oddFooter = `&L${STUDIO_INFO.name} · Overall Summary · ${period}&RPage &P of &N`;
  }
  return workbook;
}

export async function downloadStudentExcel(
  data: StudentExcelData,
  scope: OverallScope = { kind: 'levels' },
  range: DateRange = {},
  label = '',
) {
  const bytes = await buildStudentWorkbook(data, scope, range).xlsx.writeBuffer();
  const file = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const what = { levels: 'ByLevel', master: 'Master', school: label || 'School', walkin: 'WalkIn' }[scope.kind]
    .replace(/[^A-Za-z0-9-]+/g, '');
  const dates = range.from || range.to ? `_${range.from || 'start'}_to_${range.to || 'now'}` : '';
  downloadBlob(file, `StudioFlow-Overall-${what}${dates}-${studioDate.format(new Date())}.xlsx`);
}
