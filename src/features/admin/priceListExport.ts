// The studio's price list: single items, packages (with their contents) and add-ons, downloaded
// as Excel (one sheet each), CSV (one table) or Word (a document with tables). Everything comes
// from the admin's loaded catalog; package contents are the rendered inclusions clients see.
// Every file also carries an exact, restorable copy of the catalog (catalogBackup.ts), which
// Admin → Import from File restores into an emptied system.
// Load this module with import() so exceljs and fflate stay out of the main bundle.
import ExcelJS from 'exceljs';
import { strToU8, zipSync } from 'fflate';
import type { AddOn, CatalogItem, InclusionSection, ItemPackage, Package, PackageInclusion } from '../../types';
import { BACKUP_DOCX_PART, BACKUP_MARKER, BACKUP_SHEET, encodeBackup, makeBackup } from './catalogBackup';
import { STUDIO_INFO } from '../../constants/studio';
import { parseInclusionTree, isSection } from '../../utils/inclusions';
import { packageSummary } from '../../utils/packageSummary';
import { downloadBlob } from '../../utils/downloadBlob';

export type PriceListFormat = 'xlsx' | 'csv' | 'docx';

export interface PriceListData {
  items: CatalogItem[];
  packages: Package[];
  addOns: AddOn[];
  /** Saved poses, kept in the backup copy. */
  poses: ItemPackage[];
}

const KIND_LABEL: Record<string, string> = { print: 'Print', frame: 'Frame', attire: 'Attire', background: 'Background', other: 'Other' };
const KIND_ORDER = ['print', 'frame', 'other', 'attire', 'background'];
const sellable = (kind: string) => kind === 'print' || kind === 'frame' || kind === 'other';
const offeredTo = (kind: string | undefined, fallback: 'school' | 'both') =>
  ({ school: 'School', walkin: 'Walk-in', both: 'School & walk-in' } as Record<string, string>)[kind || fallback] ?? 'School & walk-in';
const peso = (amount: number | undefined) => `₱${(Math.round((Number(amount) || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

interface ItemRow { kind: string; name: string; price: number | null; offered: string; kiosk: string }
interface PackageRow {
  code: string; name: string; price: number; offered: string; status: string; tagline: string;
  frame: string; prints: number; pick: string; freebies: string[]; options: string[];
}
interface ContentRow { code: string; pkg: string; section: string; line: string }
interface AddOnRow { code: string; name: string; price: number; offered: string; revenue: string; status: string }

/** The four lists, sorted the way the studio reads them. */
function buildPriceList({ items, packages, addOns }: PriceListData) {
  const itemRows: ItemRow[] = [...items]
    .sort((a, b) => KIND_ORDER.indexOf(a.category || 'other') - KIND_ORDER.indexOf(b.category || 'other') || byName(a, b))
    .map((item) => {
      const kind = item.category || 'other';
      return {
        kind: KIND_LABEL[kind] ?? kind,
        name: item.name,
        price: sellable(kind) ? Number(item.amount) || 0 : null,
        offered: sellable(kind) ? offeredTo(item.client_kind, 'both') : '',
        kiosk: sellable(kind) ? (item.is_active ? 'Yes' : 'No') : '',
      };
    });

  const sortedPackages = [...packages].sort((a, b) => Number(b.is_active !== false) - Number(a.is_active !== false) || byName(a, b));
  const packageRows: PackageRow[] = sortedPackages.map((pkg) => {
    const s = packageSummary(pkg);
    return {
      code: pkg.code, name: pkg.name, price: Number(pkg.amount) || 0,
      offered: offeredTo(pkg.client_kind, 'school'), status: pkg.is_active !== false ? 'Active' : 'Archived',
      tagline: s.tagline, frame: s.frame, prints: s.prints,
      pick: s.shots ? (s.pick ? `Unlimited shots, pick ${s.pick}` : 'Unlimited shots') : '',
      freebies: s.options.length ? s.freebies.map((f) => {
        const choice = s.options.find((g) => g.freebie && g.name === f.slice(0, 60));
        return choice ? `${f} (choose: ${choice.choices.map((c) => c.label).join(' / ')})` : f;
      }) : s.freebies,
      options: s.options.filter((g) => !g.freebie).map((g) => `${g.name}: ${g.replaces ? `keep ${g.replaces} or ` : ''}${g.choices.map((c) => c.label).join(' / ')}`),
    };
  });

  // Every line of every package, with where it sits: "Frame and Prints › Toga w/out cap › Colored".
  const contentRows: ContentRow[] = [];
  const walk = (pkg: Package, list: PackageInclusion[], path: string[]) => {
    for (const entry of list) {
      if (isSection(entry)) walk(pkg, (entry as InclusionSection).items, [...path, entry.title]);
      else contentRows.push({ code: pkg.code, pkg: pkg.name, section: path.join(' › '), line: entry });
    }
  };
  for (const pkg of sortedPackages) walk(pkg, parseInclusionTree(pkg.inclusions), []);

  // Add-ons kept as single items sold at the kiosk are already in the item list.
  const addOnRows: AddOnRow[] = addOns.filter((a) => !a.catalog_item).sort(byName).map((a) => ({
    code: a.code || '', name: a.name, price: Number(a.amount) || 0, offered: offeredTo(a.client_kind, 'both'),
    revenue: a.revenue_category === 'mua' ? 'Other payment (MUA)' : a.revenue_category === 'studio' ? 'Studio' : '',
    status: a.is_active !== false ? 'Active' : 'Inactive',
  }));
  return { itemRows, packageRows, contentRows, addOnRows };
}

type PriceList = ReturnType<typeof buildPriceList>;

// ---------- Excel ----------

async function toXlsx(list: PriceList, backup: string[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = STUDIO_INFO.name;
  wb.created = new Date();
  const money = '"₱"#,##0.00';
  const sheet = (name: string, columns: { header: string; key: string; width: number; money?: boolean }[], rows: object[]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = columns.map(({ header, key, width }) => ({ header, key, width }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E7C4' } };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    for (const row of rows) ws.addRow(row);
    columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      if (c.money) col.numFmt = money;
      col.alignment = { vertical: 'top', wrapText: true };
    });
  };
  sheet('Single items', [
    { header: 'Kind', key: 'kind', width: 12 }, { header: 'Item', key: 'name', width: 40 },
    { header: 'Price each', key: 'price', width: 14, money: true }, { header: 'Offered to', key: 'offered', width: 18 },
    { header: 'Sold at kiosk', key: 'kiosk', width: 13 },
  ], list.itemRows);
  sheet('Packages', [
    { header: 'Code', key: 'code', width: 14 }, { header: 'Package', key: 'name', width: 30 },
    { header: 'Price', key: 'price', width: 13, money: true }, { header: 'Offered to', key: 'offered', width: 17 },
    { header: 'Status', key: 'status', width: 10 }, { header: 'Line under the price', key: 'tagline', width: 28 },
    { header: 'Frame', key: 'frame', width: 24 }, { header: 'Prints (pcs)', key: 'prints', width: 12 },
    { header: 'Shots', key: 'pick', width: 22 }, { header: 'Freebies', key: 'freebies', width: 45 },
    { header: 'Options', key: 'options', width: 45 },
  ], list.packageRows.map((r) => ({ ...r, prints: r.prints || '', freebies: r.freebies.join('\n'), options: r.options.join('\n') })));
  sheet('Package contents', [
    { header: 'Code', key: 'code', width: 14 }, { header: 'Package', key: 'pkg', width: 30 },
    { header: 'Section', key: 'section', width: 44 }, { header: 'Inclusion', key: 'line', width: 40 },
  ], list.contentRows);
  sheet('Add-ons', [
    { header: 'Code', key: 'code', width: 14 }, { header: 'Add-on', key: 'name', width: 36 },
    { header: 'Price', key: 'price', width: 13, money: true }, { header: 'Offered to', key: 'offered', width: 17 },
    { header: 'Revenue', key: 'revenue', width: 20 }, { header: 'Status', key: 'status', width: 10 },
  ], list.addOnRows);
  // The restorable copy, on a hidden sheet (Import from File reads it).
  const hidden = wb.addWorksheet(BACKUP_SHEET, { state: 'hidden' });
  hidden.getColumn(1).width = 60;
  hidden.addRow([BACKUP_MARKER]);
  for (const chunk of backup) hidden.addRow([chunk]);
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- CSV ----------

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value);
  // Quote anything with separators; neutralise a leading formula character for spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

function toCsv(list: PriceList, backup: string[]): Blob {
  const rows: unknown[][] = [['Type', 'Kind / Section', 'Code', 'Name', 'Price', 'Offered to', 'Status', 'Details']];
  for (const r of list.itemRows) {
    rows.push(['Single item', r.kind, '', r.name, r.price === null ? '' : r.price.toFixed(2), r.offered, r.kiosk ? (r.kiosk === 'Yes' ? 'Sold at kiosk' : 'Not sold alone') : '', '']);
  }
  for (const r of list.packageRows) {
    const details = [r.tagline, r.frame && `Frame: ${r.frame}`, r.prints && `${r.prints} pcs prints`, r.pick,
      r.freebies.length && `Freebies: ${r.freebies.join('; ')}`, r.options.length && `Options: ${r.options.join('; ')}`].filter(Boolean).join(' | ');
    rows.push(['Package', '', r.code, r.name, r.price.toFixed(2), r.offered, r.status, details]);
  }
  for (const r of list.contentRows) rows.push(['Package content', r.section, r.code, r.line, '', '', '', r.pkg]);
  for (const r of list.addOnRows) rows.push(['Add-on', r.revenue, r.code, r.name, r.price.toFixed(2), r.offered, r.status, '']);
  // The restorable copy, at the end (Import from File reads these rows; keep them when editing).
  rows.push([]);
  for (const chunk of backup) rows.push([BACKUP_MARKER, chunk]);
  // BOM so Excel opens the ₱ and accents correctly.
  return new Blob(['﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

// ---------- Word (.docx: WordprocessingML zipped with fflate) ----------

const xml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (text: string, o: { bold?: boolean; size?: number; color?: string; italic?: boolean } = {}) =>
  `<w:r><w:rPr>${o.bold ? '<w:b/>' : ''}${o.italic ? '<w:i/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.size ?? 20}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
const para = (runs: string, o: { after?: number; before?: number; indent?: number; keepNext?: boolean } = {}) =>
  `<w:p><w:pPr>${o.keepNext ? '<w:keepNext/>' : ''}<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 60}"/>${o.indent ? `<w:ind w:left="${o.indent}"/>` : ''}</w:pPr>${runs}</w:p>`;
const heading = (text: string) => para(run(text, { bold: true, size: 28, color: '7A5C12' }), { before: 280, after: 120, keepNext: true });

/** A bordered table; the first row is the header. `widths` in twentieths of a point. */
function table(header: string[], rows: string[][], widths: number[], right: number[] = []) {
  const cell = (text: string, i: number, head: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="F3E7C4"/>' : ''}</w:tcPr>`
    + text.split('\n').map((line) => `<w:p><w:pPr><w:spacing w:after="0"/>${right.includes(i) ? '<w:jc w:val="right"/>' : ''}</w:pPr>${run(line, { bold: head, size: 18 })}</w:p>`).join('')
    + '</w:tc>';
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="B8A06A"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/>`
    + `<w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders>`
    + '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
    + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:tblHeader/></w:trPr>${header.map((h, i) => cell(h, i, true)).join('')}</w:tr>`
    + rows.map((r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cell(c, i, false)).join('')}</w:tr>`).join('')
    + '</w:tbl>';
}

function toDocx(list: PriceList, backup: string[]): Blob {
  const parts: string[] = [];
  parts.push(para(run(STUDIO_INFO.name, { bold: true, size: 36 }), { after: 0 }));
  parts.push(para(run(`Price list as of ${today()}`, { size: 22, color: '555555' }), { after: 0 }));
  parts.push(para(run(`${STUDIO_INFO.address} · ${STUDIO_INFO.phone}`, { size: 18, color: '777777', italic: true }), { after: 200 }));

  parts.push(heading('Packages'));
  const active = list.packageRows.filter((r) => r.status === 'Active');
  const archived = list.packageRows.filter((r) => r.status !== 'Active');
  parts.push(table(['Code', 'Package', 'Offered to', 'Price'],
    [...active, ...archived].map((r) => [r.code, r.status === 'Active' ? r.name : `${r.name} (archived)`, r.offered, peso(r.price)]),
    [1500, 4400, 2000, 1460], [3]));

  for (const r of [...active, ...archived]) {
    parts.push(para(run(`${r.name} — ${peso(r.price)}`, { bold: true, size: 24 }) + (r.status === 'Active' ? '' : run('  (archived)', { italic: true, size: 18, color: '888888' })), { before: 220, after: 40, keepNext: true }));
    if (r.tagline) parts.push(para(run(r.tagline, { italic: true, size: 18, color: '555555' }), { keepNext: true }));
    const lines = list.contentRows.filter((c) => c.code === r.code && c.pkg === r.name);
    let lastSection = '\u0000';
    for (const c of lines) {
      if (c.section !== lastSection) {
        // Lines outside a section (shots, attires) get their own heading after the prints.
        const title = c.section || (lastSection === '\u0000' ? '' : 'Shoot and other inclusions');
        if (title) parts.push(para(run(title, { bold: true, size: 18, color: '7A5C12' }), { indent: 240, after: 20, keepNext: true }));
      }
      lastSection = c.section;
      parts.push(para(run(`• ${c.line}`, { size: 18 }), { indent: c.section ? 480 : 240, after: 0 }));
    }
    if (r.options.length) parts.push(para(run('Options: ', { bold: true, size: 18 }) + run(r.options.join('; '), { size: 18 }), { indent: 240, before: 40 }));
    if (r.freebies.length) parts.push(para(run('Free: ', { bold: true, size: 18 }) + run(r.freebies.join(' · '), { size: 18 }), { indent: 240 }));
  }

  parts.push(heading('Single items'));
  const priced = list.itemRows.filter((r) => r.price !== null);
  parts.push(table(['Kind', 'Item', 'Offered to', 'Sold at kiosk', 'Price each'],
    priced.map((r) => [r.kind, r.name, r.offered, r.kiosk, r.price ? peso(r.price) : '—']), [1200, 3900, 1900, 1200, 1160], [4]));
  const looks = list.itemRows.filter((r) => r.price === null);
  if (looks.length) {
    parts.push(para(run('Attires and backgrounds (no price): ', { bold: true, size: 18 }) + run(looks.map((r) => `${r.name} (${r.kind.toLowerCase()})`).join(', '), { size: 18 }), { before: 120 }));
  }

  if (list.addOnRows.length) {
    parts.push(heading('Add-ons'));
    parts.push(table(['Add-on', 'Offered to', 'Status', 'Price'],
      list.addOnRows.map((r) => [r.code ? `${r.name} (${r.code})` : r.name, r.offered, r.status, peso(r.price)]), [4700, 2000, 1200, 1460], [3]));
  }

  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + parts.join('')
    + '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    + '</w:body></w:document>';
  const files = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
      + '</Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
      + '</Relationships>'),
    'word/document.xml': strToU8(document),
    // The restorable copy, as a custom XML data part of the document (Import from File reads it).
    'word/_rels/document.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${BACKUP_DOCX_PART}"/>`
      + '</Relationships>'),
    [BACKUP_DOCX_PART]: strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
      + `<studioflow-catalog note="${xml(BACKUP_MARKER)}">${backup.map((c) => `<chunk>${xml(c)}</chunk>`).join('')}</studioflow-catalog>`),
  };
  return new Blob([zipSync(files)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** The price list file in one format, with the restorable catalog copy inside. */
export async function priceListFile(data: PriceListData, format: PriceListFormat): Promise<Blob> {
  const list = buildPriceList(data);
  const backup = encodeBackup(makeBackup(data));
  if (format === 'xlsx') return toXlsx(list, backup);
  return format === 'csv' ? toCsv(list, backup) : toDocx(list, backup);
}

/** Builds the price list in the chosen format and downloads it. */
export async function downloadPriceList(data: PriceListData, format: PriceListFormat): Promise<void> {
  downloadBlob(await priceListFile(data, format), `StudioFlow-Price-List-${today()}.${format}`);
}

/** For tests: the rows the files are made from. */
export const priceListRows = buildPriceList;
