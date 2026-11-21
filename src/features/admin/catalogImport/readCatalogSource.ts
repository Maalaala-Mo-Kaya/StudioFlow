// Reads an uploaded flyer photo, spreadsheet, Word document or text file into text (and, for
// spreadsheets with a header row, straight into drafts). Everything runs in the browser with no
// internet: the OCR engine and its English model are served from /ocr/ (scripts/copy-ocr-assets.cjs).
import { findPrice, lineKey, parseCatalogRows, parseCatalogText, tidy, type CatalogDraft } from './catalogParser';

export type SourceKind = 'image' | 'sheet' | 'doc' | 'text';

export interface ReadResult {
  kind: SourceKind;
  /** The text the drafts came from; the admin can correct it and read it again. */
  text: string;
  draft: CatalogDraft;
}

export type ProgressFn = (label: string, fraction: number) => void;

export const ACCEPTED_FILES = 'image/*,.xlsx,.csv,.docx,.txt';

export function sourceKind(file: File): SourceKind | null {
  const name = file.name.toLowerCase();
  if (file.type.startsWith('image/')) return 'image';
  if (name.endsWith('.xlsx') || name.endsWith('.csv')) return 'sheet';
  if (name.endsWith('.docx')) return 'doc';
  if (name.endsWith('.txt')) return 'text';
  return null;
}

export async function readCatalogSource(file: File, onProgress: ProgressFn): Promise<ReadResult> {
  const kind = sourceKind(file);
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.doc') || lower.endsWith('.xls')) {
    throw new Error(`"${file.name}" is an older Office format. Open it and save it as ${lower.endsWith('.doc') ? '.docx' : '.xlsx'} first.`);
  }
  if (!kind) throw new Error(`"${file.name}" can't be read. Use a photo, an Excel (.xlsx / .csv), a Word (.docx) or a text file.`);

  if (kind === 'image') {
    const text = await readImageText(file, onProgress);
    return { kind, text, draft: parseCatalogText(text) };
  }
  if (kind === 'sheet') {
    onProgress('Reading the spreadsheet', 0.3);
    const rows = lower.endsWith('.csv') ? parseCsv(await file.text()) : await readWorkbookRows(file);
    const text = rows.map((row) => row.map((c) => c.trim()).filter(Boolean).join(' - ')).filter(Boolean).join('\n');
    return { kind, text, draft: parseCatalogRows(rows) ?? parseCatalogText(text) };
  }
  if (kind === 'doc') {
    onProgress('Reading the document', 0.3);
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const text = value.replace(/\n{3,}/g, '\n\n').trim();
    return { kind, text, draft: parseCatalogText(text) };
  }
  const text = await file.text();
  return { kind, text, draft: parseCatalogText(text) };
}

// ---------- Spreadsheets ----------

async function readWorkbookRows(file: File): Promise<string[][]> {
  const { default: { Workbook } } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const rows: string[][] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cell.text ?? ''; });
      rows.push(Array.from(cells, (c) => c ?? ''));
    });
  });
  return rows;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** An Excel template with the columns the importer understands, filled with an example. */
export async function downloadCatalogTemplate() {
  const { default: { Workbook } } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Catalog');
  sheet.columns = [
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Code', key: 'code', width: 14 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Price', key: 'price', width: 10 },
    { header: 'Inclusions', key: 'inclusions', width: 60 },
    { header: 'Freebies', key: 'freebies', width: 50 },
    { header: 'Offered To', key: 'offered', width: 12 },
    { header: 'Photo Limit', key: 'limit', width: 12 },
  ];
  sheet.addRows([
    { type: 'Package', code: 'PKG-BASIC', name: 'Basic Package', price: 1395,
      inclusions: '15 pcs hard printout copy; Colored toga w/out cap; 1 pc - 8R; 2 pcs - wallet size; 4 pcs - 2x2; 8 pcs - 1x1',
      freebies: 'Free 10x12 frame; Free family picture; Free raw copies (unedited pictures)',
      offered: 'School', limit: 1 },
    { type: 'Inclusion', name: 'Another inclusion for the package above (optional)' },
    { type: 'Freebie', name: 'Another freebie for the package above (optional)' },
    { type: 'Add-on', code: 'ADD-8R', name: 'Extra 8R print', price: 150, offered: 'Both' },
  ]);
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn('inclusions').alignment = { wrapText: true };
  sheet.getColumn('freebies').alignment = { wrapText: true };
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'StudioFlow catalog template.xlsx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Photos (OCR) ----------

interface OcrLine { text: string; confidence: number; y: number; x: number }

/**
 * Flyers are usually gold or white lettering on dark, busy artwork, which OCR reads poorly as is,
 * and how well a line reads changes with the picture's size. So cleaned-up copies are read at two
 * sizes (grayscale with the text made dark on light, and pure black and white) and their confident
 * lines are merged in top-to-bottom order.
 */
async function readImageText(file: File, onProgress: ProgressFn): Promise<string> {
  onProgress('Preparing the photo', 0.02);
  const bitmap = await createImageBitmap(file);
  const large = prepareImage(bitmap, 3600);
  const small = prepareImage(bitmap, 2600);
  bitmap.close();
  const { createWorker, PSM } = await import('tesseract.js');
  const base = new URL('ocr/', document.baseURI).href;
  const passes: { canvas: HTMLCanvasElement; scale: number; psm: (typeof PSM)[keyof typeof PSM] }[] = [
    { canvas: large.gray, scale: large.scale, psm: PSM.SPARSE_TEXT },
    { canvas: large.binary, scale: large.scale, psm: PSM.AUTO },
    { canvas: small.gray, scale: small.scale, psm: PSM.SPARSE_TEXT },
  ];
  let pass = 0;
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath: base.replace(/\/$/, ''),
    gzip: false,
    logger: (m) => {
      if (m.status === 'recognizing text') {
        onProgress(`Reading text from the photo (pass ${pass + 1} of ${passes.length})`, 0.1 + 0.9 * ((pass + m.progress) / passes.length));
      } else if (pass === 0) {
        onProgress('Loading the text reader', 0.05);
      }
    },
  });
  try {
    const lines: OcrLine[] = [];
    for (; pass < passes.length; pass++) {
      await worker.setParameters({ tessedit_pageseg_mode: passes[pass].psm });
      const { canvas, scale } = passes[pass];
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: false });
      for (const block of data.blocks ?? []) {
        for (const paragraph of block.paragraphs) {
          for (const line of paragraph.lines) {
            const text = line.text.replace(/\s+/g, ' ').trim();
            if (text && line.confidence >= 60) {
              // Positions in the original photo's pixels, so passes at different sizes line up.
              lines.push({ text, confidence: line.confidence, y: (line.bbox.y0 + line.bbox.y1) / 2 / scale, x: line.bbox.x0 / scale });
            }
          }
        }
      }
    }
    return mergeLines(lines);
  } finally {
    await worker.terminate();
  }
}

const isSubsequence = (short: string, long: string) => {
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i === short.length;
};

const letters = (key: string) => key.replace(/[^\p{L}]/gu, '');

/** Two keys of 8+ characters that differ in at most a sixth of their characters (edit distance). */
function similar(a: string, b: string): boolean {
  const longest = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) < 8 || Math.abs(a.length - b.length) > longest / 6) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length] <= longest / 6;
}

/** Keeps the best reading of each line, drops fragments of longer lines, and orders them top to bottom. */
function mergeLines(lines: OcrLine[]): string {
  // Compare lines without bullets and frame marks: "o 4 pcs - 2x2" and "© 4 pcs - 2x2" are one line.
  // Near-identical readings ("PRINTOUT COPY" / "PRINTOUT CopPY") count as one line too.
  const best = new Map<string, OcrLine>();
  for (const line of [...lines].sort((a, b) => b.confidence - a.confidence)) {
    const key = lineKey(tidy(line.text));
    if (key.length < 2) continue;
    if (best.has(key) || [...best.keys()].some((other) => similar(key, other))) continue;
    best.set(key, line);
  }
  const keys = [...best.keys()];
  const redundant = (key: string) => keys.some((other) => {
    if (other === key) return false;
    // A fragment of a longer line, such as a photo caption read in part ("1pc" / "1lpc-8r", "6 wall").
    if (key.length <= 10 && other.length > key.length
      && (isSubsequence(key, other) || (letters(key).length >= 3 && letters(other).includes(letters(key))))) return true;
    // The same line with stray marks read beside it ("Nosos® | ® Colored Toga w/out cap").
    return other.length >= 6 && key.includes(other) && key.length - other.length <= 8;
  });
  // A line with a price is never dropped: losing a price costs more than a duplicate.
  const kept = [...best.entries()]
    .filter(([key, line]) => findPrice(tidy(line.text)) || !redundant(key))
    .map(([, line]) => line);
  kept.sort((a, b) => (Math.abs(a.y - b.y) < 8 ? a.x - b.x : a.y - b.y));
  return kept.map((line) => line.text).join('\n');
}

/** Draws the photo with its longest side at `longSide` px (at most 2.5×) as grayscale and black-and-white copies. */
function prepareImage(bitmap: ImageBitmap, longSide: number): { gray: HTMLCanvasElement; binary: HTMLCanvasElement; scale: number } {
  const scale = Math.min(2.5, longSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const gray = document.createElement('canvas');
  gray.width = width;
  gray.height = height;
  const ctx = gray.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const dark = sum / (px.length / 4) < 110;

  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < px.length; i += 4) {
    // On a dark flyer the brightest channel picks out gold and white lettering; invert it so the
    // text ends up dark on light, the way OCR expects.
    const v = dark
      ? 255 - Math.max(px[i], px[i + 1], px[i + 2])
      : Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
    px[i] = px[i + 1] = px[i + 2] = v;
    histogram[v]++;
  }
  ctx.putImageData(image, 0, 0);

  const threshold = otsu(histogram, px.length / 4);
  const binary = document.createElement('canvas');
  binary.width = width;
  binary.height = height;
  const bctx = binary.getContext('2d')!;
  for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = px[i] > threshold ? 255 : 0;
  bctx.putImageData(image, 0, 0);
  return { gray, binary, scale };
}

/** Otsu's method: the gray level that best splits text from background. */
function otsu(histogram: number[], total: number): number {
  let sumAll = 0;
  histogram.forEach((count, level) => { sumAll += level * count; });
  let sumBack = 0;
  let weightBack = 0;
  let bestLevel = 127;
  let bestVariance = 0;
  for (let level = 0; level < 256; level++) {
    weightBack += histogram[level];
    if (!weightBack) continue;
    const weightFore = total - weightBack;
    if (!weightFore) break;
    sumBack += level * histogram[level];
    const meanBack = sumBack / weightBack;
    const meanFore = (sumAll - sumBack) / weightFore;
    const variance = weightBack * weightFore * (meanBack - meanFore) ** 2;
    if (variance > bestVariance) { bestVariance = variance; bestLevel = level; }
  }
  return bestLevel;
}
