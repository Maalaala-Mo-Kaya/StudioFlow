import { Workbook } from 'exceljs';
import { formatCurrency } from '../../utils/formatters';

interface CatalogColumn {
  id: string;
  code: string;
  name: string;
  amount: number;
}

interface StudentExcelRow {
  level: 'college' | 'shs';
  date: string;
  jobOrder: string;
  course: string;
  name: string;
  packageId: string;
  packageCode: string;
  packageAmount: number;
  addOns: Record<string, number>;
  due: number;
  payments: { full: number; additional: number; down: number };
}

export interface StudentExcelData {
  packages: CatalogColumn[];
  addOns: CatalogColumn[];
  rows: StudentExcelRow[];
}

const studentColumns = [
  { key: 'date', header: 'DATE OF PICTORIAL', width: 16, style: { numFmt: 'dd-mmm-yy' } },
  { key: 'jobOrder', header: 'STUDIO #', width: 12, style: { numFmt: '@' } },
  { key: 'course', header: 'COURSE', width: 14 },
  { key: 'name', header: 'NAME', width: 32 },
  { key: 'packageCode', header: 'PACKAGE CODE', width: 15 },
];
const financialColumns = [
  { key: 'full', header: 'FULL PAYMENT' },
  { key: 'additional', header: 'ADDITIONAL PAYMENT' },
  { key: 'down', header: 'DOWN PAYMENT' },
  { key: 'total', header: 'TOTAL PAYMENT' },
  { key: 'balance', header: 'BALANCE' },
];
const peso = { numFmt: '"₱"#,##0.00;-"₱"#,##0.00' };
const studioDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
});
const catalogWidth = (name: string) => Math.min(44, Math.max(24, Math.ceil(name.length / 2) + 4));

function pictorialDate(value: string) {
  if (!value) return null;
  const date = new Date(value.replace(' ', 'T'));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(studioDate.formatToParts(date).map(({ type, value }) => [type, Number(value)]));
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

export function buildStudentWorkbook({ packages, addOns, rows }: StudentExcelData) {
  const workbook = new Workbook();
  workbook.calcProperties.fullCalcOnLoad = true;
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
  const catalogColumns = [...packageColumns, ...addOnColumns];
  const moneyColumns = [...catalogColumns, ...financialColumns];
  const definitions = [
    ...studentColumns,
    ...catalogColumns,
    ...financialColumns.map((column) => ({ ...column, width: 17, style: peso })),
  ];

  for (const [level, title] of [['college', 'COLLEGE OVERALL'], ['shs', 'SHS OVERALL']]) {
    const sheet = workbook.addWorksheet(title, {
      views: [{ state: 'frozen', xSplit: studentColumns.length, ySplit: 1 }],
      properties: { tabColor: { argb: 'FFC9A227' } },
    });
    sheet.columns = definitions;
    const header = sheet.getRow(1);
    header.height = 76;
    header.eachCell((cell, column) => {
      const details = column <= studentColumns.length;
      cell.font = { bold: true, color: { argb: details ? 'FFFFFFFF' : 'FF0A0A0A' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: details ? 'FF0A0A0A' : 'FFC9A227' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    const amounts = new Map<string, number>();
    const counts = new Map<string, number>();
    const students = rows.filter((row) => row.level === level);
    for (const student of students) {
      const { full, additional, down } = student.payments;
      const total = full + additional + down;
      const balance = Math.max(0, student.due - total);
      const charges: Record<string, number> = {};
      if (student.packageId) charges[`package:${student.packageId}`] = student.packageAmount;
      for (const [id, amount] of Object.entries(student.addOns)) charges[`addon:${id}`] = amount;
      const amountsInRow = { ...charges, full, additional, down, total, balance };
      for (const [key, amount] of Object.entries(amountsInRow)) amounts.set(key, (amounts.get(key) ?? 0) + amount);
      for (const key of Object.keys(charges)) counts.set(key, (counts.get(key) ?? 0) + 1);

      const row = sheet.addRow({
        date: pictorialDate(student.date), jobOrder: student.jobOrder, course: student.course,
        name: student.name, packageCode: student.packageCode,
        ...Object.fromEntries(Object.entries(amountsInRow).map(([key, cents]) => [key, cents / 100])),
      });
      const fullCell = row.getCell('full').address;
      const downCell = row.getCell('down').address;
      const totalCell = row.getCell('total');
      totalCell.value = { formula: `ROUND(SUM(${fullCell}:${downCell}),2)`, result: total / 100 };
      row.getCell('balance').value = {
        formula: `MAX(0,ROUND(${student.due / 100}-${totalCell.address},2))`,
        result: balance / 100,
      };
    }

    const lastStudent = students.length + 1;
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lastStudent, column: definitions.length },
    };
    // Excel can extend an AutoFilter to contiguous rows when opening the file.
    sheet.addRow([]).height = 8;
    const totalRow = sheet.addRow({ name: 'TOTAL AMOUNT' });
    const countRow = sheet.addRow({ name: 'NO. STUDENTS' });
    const range = (key: string) => {
      const { letter } = sheet.getColumn(key);
      return `${letter}2:${letter}${lastStudent}`;
    };
    for (const { key } of moneyColumns) {
      const result = (amounts.get(key) ?? 0) / 100;
      totalRow.getCell(key).value = students.length ? { formula: `ROUND(SUM(${range(key)}),2)`, result } : 0;
    }
    countRow.getCell('jobOrder').value = students.length
      ? { formula: `COUNTA(${range('name')})`, result: students.length }
      : 0;
    for (const { key } of catalogColumns) {
      const cell = countRow.getCell(key);
      cell.value = students.length ? { formula: `COUNT(${range(key)})`, result: counts.get(key) ?? 0 } : 0;
      cell.numFmt = '0';
    }
    countRow.getCell('jobOrder').numFmt = '0';
    for (const row of [totalRow, countRow]) {
      row.height = 20;
      for (let column = 1; column <= definitions.length; column++) {
        const cell = row.getCell(column);
        cell.font = { bold: true, color: { argb: 'FF0A0A0A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4E7B7' } };
      }
    }
  }
  return workbook;
}

export async function downloadStudentExcel(data: StudentExcelData) {
  const bytes = await buildStudentWorkbook(data).xlsx.writeBuffer();
  const file = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = `StudioFlow-Overall-${studioDate.format(new Date())}.xlsx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
