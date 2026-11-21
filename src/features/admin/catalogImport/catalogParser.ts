// Turns text read from a flyer, price list or spreadsheet into draft packages and add-ons.
// Drafts are only suggestions: the admin reviews and edits them before anything is saved.
import type { RevenueCategory } from '../../../types';
import type { PackageKind } from '../useAdminData';

export interface DraftPackage {
  key: string;
  include: boolean;
  code: string;
  name: string;
  amount: number;
  inclusions: string[];
  freebies: string[];
  /** Set to add this draft's inclusions and freebies to an existing package (its id) instead of creating one. */
  mergeInto?: string;
  photoLimit: number;
  clientKind: PackageKind;
  revenue: RevenueCategory;
}

export interface DraftAddOn {
  key: string;
  include: boolean;
  code: string;
  name: string;
  amount: number;
  clientKind: PackageKind;
  revenue: RevenueCategory;
}

export interface CatalogDraft {
  packages: DraftPackage[];
  addOns: DraftAddOn[];
}

let keySeq = 0;
const nextKey = () => `draft-${Date.now().toString(36)}-${++keySeq}`;

const MAKEUP_WORDS = /\b(make[\s-]?up|grooming|hmua|mua|hair\s*(?:and|&)\s*make)/i;

export function newDraftPackage(fields: Partial<DraftPackage> = {}): DraftPackage {
  return {
    key: nextKey(), include: true, code: '', name: '', amount: 0, inclusions: [], freebies: [], photoLimit: 0,
    clientKind: 'school', revenue: 'studio', ...fields,
  };
}

export function newDraftAddOn(fields: Partial<DraftAddOn> = {}): DraftAddOn {
  const name = fields.name ?? '';
  return {
    key: nextKey(), include: true, code: '', name, amount: 0, clientKind: 'both',
    revenue: MAKEUP_WORDS.test(name) ? 'mua' : 'studio', ...fields,
  };
}

// ---------- Prices ----------

const NUM = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
/** "PHP1395", "₱ 1,395.00", "P1395", "Php. 1,395" */
const PREFIXED = new RegExp(String.raw`(?<![a-z0-9])(?:php|₱|p|pesos?)\s*[.:]?\s*${NUM}(?![\d,]*x\d)`, 'i');
/** "1,395 php", "1395 pesos" */
const SUFFIXED = new RegExp(String.raw`(?<![\w.,])${NUM}\s*(?:php|pesos?)\b`, 'i');
/** "Basic - 1,395", "Price: 1395", or a line that is only a number. */
const BARE = new RegExp(String.raw`(?:^|[-–—:=|]\s*|\.{2,}\s*|\bprice\s*)${NUM}\s*(?:only)?$`, 'i');

const toAmount = (whole: string, cents?: string) =>
  Number(whole.replace(/,/g, '')) + (cents ? Number(`0.${cents}`) : 0);

interface PriceMatch { amount: number; label: string }

/** Finds a price in a line and returns it with the rest of the line (the item's label). */
export function findPrice(line: string): PriceMatch | null {
  for (const [pattern, bare] of [[PREFIXED, false], [SUFFIXED, false], [BARE, true]] as const) {
    const match = pattern.exec(line);
    if (!match) continue;
    const amount = toAmount(match[1], match[2]);
    // A bare number is a price only if it looks like one (not "2" in "Wallet size - 2").
    if (!Number.isFinite(amount) || (bare && (amount < 50 || amount > 1_000_000))) continue;
    const label = (line.slice(0, match.index) + ' ' + line.slice(match.index + match[0].length))
      .replace(/\b(?:price|only|for only|amount|rate|php|less)\b/gi, ' ');
    return { amount, label: finish(tidy(label)) };
  }
  return null;
}

// ---------- Line cleanup ----------

const BULLETS = /[•‣⁃∙■-◿·➢➤►▶✓✔☐☑*•►▶➤✓✔☐■◆◇|]/g;

/** Removes bullets, frame marks and stray punctuation that OCR picks up around a line. */
export function tidy(raw: string): string {
  return raw
    .replace(BULLETS, ' ')
    .replace(/^\s*(?:[-–—+>~»«]+|[oO0©®°@](?=\s)|\(?[a-z]\)(?=\s)|\d{1,2}[.)](?=\s+\D))\s*/, '')
    .replace(/[-–—_=~»«]+\s*$/, '')
    .replace(/\s*\.{3,}\s*/g, ' - ') // dot leaders: "Soft copy ...... 300"
    // A trailing comma is kept: it shows the item continues on the next line (inclusionsFrom joins
    // them and drops the comma).
    .replace(/^[^\p{L}\p{N}(₱]+|(?<=[\p{L}\p{N})%,])[^\p{L}\p{N})%,]+$/gu, '')
    .replace(/,{2,}$/, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

/** An item as saved: no trailing comma left over from a wrapped line. */
const finish = (item: string) => item.replace(/[\s,]+$/, '');

const SMALL_WORDS = new Set(['pc', 'pcs', 'pc.', 'x', 'w/', 'of', 'to', 'in', 'a', 'on', 'or', 'by', 'up', 'is', 'id']);

/** True for lines that read like words, false for OCR noise from photos and decorations. */
export function looksLikeText(line: string): boolean {
  const alnum = line.replace(/[^\p{L}\p{N}]/gu, '');
  // Needs a letter: a bare number that isn't a price ("48") is a misread, never an inclusion.
  if (alnum.length < 2 || !/\p{L}/u.test(alnum)) return false;
  const tokens = line.split(/\s+/).filter((t) => /[\p{L}\p{N}]/u.test(t));
  const real = tokens.filter((token) => {
    const t = token.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    return /^\p{L}{3,}$/u.test(t) || /^\d+[a-z]{0,4}$/.test(t) || /^\d+x\d+$/.test(t)
      || /^\p{L}+\/\p{L}+$/u.test(t) || /^\p{L}+(?:[-'’]\p{L}+)+$/u.test(t) || /^\d+[a-z]*-\d*[a-z0-9]*$/.test(t) || SMALL_WORDS.has(t);
  });
  return real.length > 0 && real.length / tokens.length >= 0.5;
}

/** Contact details, links and fine print: never a package or an inclusion. */
const NOISE = /(facebook|fb\.com|instagram|messenger|tiktok|follow us|like us|contact|call us|text us|visit us|inquir|book now|reserve|www\.|https?:|@\w|\b0?9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\+63|terms|conditions|valid until|subject to change)/i;

const PACKAGE_WORD = /\b(package|pkg|promo|bundle|plan)\b/i;
const ADDON_HEADER = /^(?:add[\s-]*ons?|extras?|upgrades?|additionals?|optional(?:\s+items)?|other\s+(?:services|charges|items))\b/i;
const INCLUSION_HEADER = /^(?:inclusions?|includes?|inclusive of|package includes?|what'?s included)\b[\s:]*$/i;
/** "Freebies", "Additional freebies", "Free items": what follows is given free with the package. */
const FREEBIE_HEADER = /^(?:additional\s+|package\s+|with\s+)?(?:freebies?|free\s+items?|free\s+inclusions?)\b[\s:!]*$/i;
/** A line such as "FREE 10x12 FRAME" is a freebie wherever it appears in a package. */
const FREE_ITEM = /^free\b/i;
const PHOTO_LIMIT = /\b(?:choose|select|pick)\s*(?:any\s*)?(\d{1,3})\s*(?:best\s*|final\s*)?(?:poses?|shots?|photos?|pictures?|images?|shots)\b/i;

/** Key for spotting the same line twice (flyers repeat inclusions as photo captions). */
export const lineKey = (line: string) => line.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

interface Line { text: string; price: PriceMatch | null; plus: boolean }

function prepareLines(text: string): Line[] {
  const lines: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const plus = /^\s*\+/.test(raw);
    const cleaned = tidy(raw);
    if (!cleaned || NOISE.test(cleaned)) continue;
    const price = findPrice(cleaned);
    if (!price && !looksLikeText(cleaned)) continue;
    lines.push({ text: cleaned, price, plus });
  }
  return lines;
}

const hasLetters = (s: string) => (s.match(/\p{L}/gu) || []).length >= 2;

// ---------- Text → drafts ----------

/** Reads free text (OCR, a Word document, a pasted list) into packages and add-ons. */
export function parseCatalogText(text: string): CatalogDraft {
  const all = prepareLines(text);
  const packageLines: Line[] = [];
  const addOns: DraftAddOn[] = [];

  // 1. Lines under an "Add-ons" / "Extras" heading are add-ons, until a package heading.
  let inAddOns = false;
  let pendingLabel = '';
  for (const line of all) {
    // "Additional freebies" is not an add-on list, though it starts like "Additional items".
    const freebieHeader = FREEBIE_HEADER.test(line.text);
    if (!line.price && !freebieHeader && ADDON_HEADER.test(line.text) && line.text.length < 40) {
      inAddOns = true;
      pendingLabel = '';
      continue;
    }
    // A free item is never a paid add-on: it ends the add-on list (this also covers a freebies
    // heading that OCR cut short, e.g. "ADDITIONAL FRE").
    if (inAddOns && (PACKAGE_WORD.test(line.text) || freebieHeader || (!line.price && FREE_ITEM.test(line.text)))) inAddOns = false;
    if (!inAddOns) {
      packageLines.push(line);
      continue;
    }
    if (line.price && hasLetters(line.price.label)) {
      addOns.push(newDraftAddOn({ name: line.price.label, amount: line.price.amount }));
      pendingLabel = '';
    } else if (line.price && pendingLabel) {
      addOns.push(newDraftAddOn({ name: pendingLabel, amount: line.price.amount }));
      pendingLabel = '';
    } else if (!line.price) {
      pendingLabel = line.text;
    }
  }

  // 2. In the rest, a price marks a package: one that names a package, stands on its own line,
  //    or is followed by an unpriced list. Other priced lines ("+ Extra 8R - 250") are add-ons.
  const lines = packageLines;
  const anchors: number[] = [];
  lines.forEach((line, i) => {
    if (!line.price) return;
    const label = line.price.label;
    const followedByList = i + 1 < lines.length && !lines[i + 1].price;
    if (!line.plus && (PACKAGE_WORD.test(label) || !hasLetters(label) || followedByList)) {
      anchors.push(i);
    } else if (hasLetters(label)) {
      addOns.push(newDraftAddOn({ name: label, amount: line.price.amount }));
    }
  });

  const packages: DraftPackage[] = [];
  const nameStarts: number[] = [];
  const names: string[] = [];
  const nameEnds: number[] = [];

  anchors.forEach((at, n) => {
    const boundary = n === 0 ? 0 : anchors[n - 1] + 1;
    const label = lines[at].price!.label;
    if (hasLetters(label)) {
      nameStarts.push(at); nameEnds.push(at); names.push(label);
      return;
    }
    // The name is above the price: the nearest line that says "package", else the line just above.
    for (let k = at - 1; k >= boundary; k--) {
      if (!PACKAGE_WORD.test(lines[k].text) || lines[k].price) continue;
      let start = k;
      let name = lines[k].text;
      // "BASIC" / "PACKAGE" printed on two lines.
      if (/^\W*(package|pkg|promo|bundle)\W*$/i.test(name) && k - 1 >= boundary
        && !lines[k - 1].price && !/\d/.test(lines[k - 1].text) && lines[k - 1].text.split(' ').length <= 3) {
        start = k - 1;
        name = `${lines[k - 1].text} ${name}`;
      }
      nameStarts.push(start); nameEnds.push(k); names.push(name);
      return;
    }
    const above = at - 1 >= boundary ? lines[at - 1] : null;
    if (above && !above.price && !/^\d/.test(above.text) && above.text.length <= 40) {
      nameStarts.push(at - 1); nameEnds.push(at - 1); names.push(above.text);
    } else {
      nameStarts.push(at); nameEnds.push(at); names.push(`Package ${n + 1}`);
    }
  });

  anchors.forEach((at, n) => {
    const nextStart = n + 1 < anchors.length ? nameStarts[n + 1] : lines.length;
    const body = [
      ...lines.slice(nameEnds[n] + 1, at),
      ...lines.slice(at + 1, nextStart),
    ].filter((line) => !line.price);
    const { inclusions, freebies, photoLimit } = inclusionsFrom(body.map((line) => line.text), names[n]);
    packages.push(newDraftPackage({
      name: finish(names[n]),
      amount: lines[at].price!.amount,
      inclusions,
      freebies,
      photoLimit,
      revenue: MAKEUP_WORDS.test(names[n]) && !inclusions.length ? 'mua' : 'studio',
    }));
  });

  // 3. A list with no prices at all: keep it as one package to price by hand.
  //    A list that is only freebies (an "Additional freebies" panel) becomes an unnamed package
  //    holding them, for the admin to name and price or to copy into an existing package.
  if (!packages.length && !addOns.length && lines.length) {
    const nameAt = lines.findIndex((line) => PACKAGE_WORD.test(line.text) && !FREEBIE_HEADER.test(line.text));
    const named = nameAt >= 0 || !(FREEBIE_HEADER.test(lines[0].text) || FREE_ITEM.test(lines[0].text));
    const start = Math.max(0, nameAt);
    const name = named ? finish(lines[start].text) : 'Imported package';
    const { inclusions, freebies, photoLimit } = inclusionsFrom(lines.slice(named ? start + 1 : 0).map((l) => l.text), name);
    packages.push(newDraftPackage({ name, inclusions, freebies, photoLimit }));
  }

  return { packages, addOns: dedupeAddOns(addOns) };
}

/**
 * Cleans a package's body lines into inclusions and freebies (lines under a "Freebies" heading, or
 * starting with "FREE"), and picks up "choose N best poses".
 */
export function inclusionsFrom(body: string[], packageName = ''): { inclusions: string[]; freebies: string[]; photoLimit: number } {
  let photoLimit = 0;
  const skip = new Set<number>();
  body.forEach((_, i) => {
    if (photoLimit || !/\b(?:choose|select|pick)\b/i.test(body[i])) return;
    // Script fonts often split "choose / 1 / Best Pose" over several lines.
    for (let span = 1; span <= 3 && i + span <= body.length; span++) {
      const match = PHOTO_LIMIT.exec(body.slice(i, i + span).join(' '));
      if (match) {
        photoLimit = Number(match[1]);
        for (let k = i; k < i + span; k++) skip.add(k);
        return;
      }
    }
  });
  const seen = new Set([lineKey(packageName)]);
  const inclusions: string[] = [];
  const freebies: string[] = [];
  let inFreebies = false;
  let last: string[] | null = null;
  body.forEach((line, i) => {
    if (FREEBIE_HEADER.test(line)) { inFreebies = true; last = null; return; }
    if (INCLUSION_HEADER.test(line)) { inFreebies = false; last = null; return; }
    const key = lineKey(line);
    if (skip.has(i) || seen.has(key) || key.length < 2) return;
    // An item that wraps onto the next line ("…AND FILIPINIANA," / "BARONG AND COAT AND TIE").
    if (last?.length && !FREE_ITEM.test(line) && /(?:[,&+/]|\b(?:and|or|with|of))$/i.test(last[last.length - 1])) {
      last[last.length - 1] = `${last[last.length - 1]} ${line}`;
      seen.add(lineKey(last[last.length - 1]));
      return;
    }
    seen.add(key);
    last = inFreebies || FREE_ITEM.test(line) ? freebies : inclusions;
    last.push(line);
  });
  return { inclusions: inclusions.map(finish), freebies: freebies.map(finish), photoLimit };
}

function dedupeAddOns(list: DraftAddOn[]): DraftAddOn[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = `${lineKey(item.name)}:${item.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------- Spreadsheet rows → drafts ----------

const HEADERS = {
  type: /^(type|kind|category|item type)$/,
  code: /^(code|sku|item code|package code)$/,
  name: /^(name|package|package name|item|item name|add[\s-]?on|title|description|product)$/,
  price: /(price|amount|rate|cost|php|₱|peso)/,
  inclusions: /(inclusion|includes|items included|details|contents)/,
  freebies: /(freebie|free items|free)/,
  offered: /(offered|client|for|audience|availability)/,
  limit: /(limit|poses|selection|photos? to choose|best shots)/,
};

function parseOffered(value: string, fallback: PackageKind): PackageKind {
  const v = value.toLowerCase();
  if (/both|all|any|everyone/.test(v) || (/walk/.test(v) && /school|grad|student/.test(v))) return 'both';
  if (/walk/.test(v)) return 'walkin';
  if (/school|grad|student/.test(v)) return 'school';
  return fallback;
}

/**
 * Reads a table with a header row (Type, Code, Name, Price, Inclusions, Offered To, Photo Limit).
 * Returns null when no such header is found, so the caller can read the rows as plain text.
 */
export function parseCatalogRows(rows: string[][]): CatalogDraft | null {
  const norm = (cell: string) => cell.toLowerCase().replace(/[*:()]/g, '').replace(/\s+/g, ' ').trim();
  let headerAt = -1;
  const col: Partial<Record<keyof typeof HEADERS, number>> = {};
  for (let r = 0; r < Math.min(rows.length, 15) && headerAt < 0; r++) {
    const cells = rows[r].map(norm);
    const nameCol = cells.findIndex((c) => HEADERS.name.test(c));
    const priceCol = cells.findIndex((c) => HEADERS.price.test(c));
    if (nameCol < 0 || priceCol < 0) continue;
    headerAt = r;
    for (const key of Object.keys(HEADERS) as (keyof typeof HEADERS)[]) {
      const at = key === 'name' ? nameCol : key === 'price' ? priceCol
        : cells.findIndex((c, i) => i !== nameCol && i !== priceCol && HEADERS[key].test(c));
      if (at >= 0) col[key] = at;
    }
  }
  if (headerAt < 0) return null;

  const packages: DraftPackage[] = [];
  const addOns: DraftAddOn[] = [];
  let section: 'package' | 'addon' | null = null;
  const cell = (row: string[], key: keyof typeof HEADERS) => (col[key] !== undefined ? (row[col[key]!] ?? '').trim() : '');

  for (const row of rows.slice(headerAt + 1)) {
    const name = finish(tidy(cell(row, 'name')));
    const priceText = cell(row, 'price');
    const type = cell(row, 'type').toLowerCase();
    const filled = row.filter((c) => c.trim()).length;
    if (!name && !priceText) continue;

    // A heading row such as "ADD-ONS" or "PACKAGES" switches the section.
    if (filled === 1 && name && !priceText) {
      if (ADDON_HEADER.test(name)) { section = 'addon'; continue; }
      if (/^packages?$/i.test(name)) { section = 'package'; continue; }
    }

    const priceMatch = priceText ? (findPrice(priceText) ?? findPrice(`- ${priceText.replace(/[^\d.,]/g, '')}`)) : null;
    const amount = priceMatch?.amount ?? (Number(priceText.replace(/[^\d.]/g, '')) || 0);
    const kind = /free/.test(type) ? 'freebie'
      : /add|extra|upgrade/.test(type) ? 'addon'
      : /incl/.test(type) ? 'inclusion'
      : /pack|pkg|bundle|promo/.test(type) ? 'package'
      : !priceText && packages.length ? 'inclusion'
      : section ?? 'package';

    if (kind === 'inclusion' || kind === 'freebie') {
      const last = packages[packages.length - 1];
      const list = kind === 'freebie' || FREE_ITEM.test(name) ? last?.freebies : last?.inclusions;
      if (list && name && !list.some((i) => lineKey(i) === lineKey(name))) list.push(name);
      continue;
    }
    const code = cell(row, 'code').toUpperCase();
    if (kind === 'addon') {
      addOns.push(newDraftAddOn({ name, code, amount: Number.isFinite(amount) ? amount : 0,
        clientKind: parseOffered(cell(row, 'offered'), 'both') }));
      continue;
    }
    const split = (text: string) => text.split(/\r?\n|;|\||•|,(?!\d)/).map(tidy).filter(Boolean);
    const { inclusions, freebies: freeInclusions, photoLimit } = inclusionsFrom(split(cell(row, 'inclusions')), name);
    const freebies = [...freeInclusions];
    for (const item of split(cell(row, 'freebies'))) {
      if (!freebies.some((f) => lineKey(f) === lineKey(item))) freebies.push(item);
    }
    const limitCell = Number(cell(row, 'limit').replace(/[^\d]/g, ''));
    packages.push(newDraftPackage({
      name, code, amount: Number.isFinite(amount) ? amount : 0, inclusions, freebies,
      photoLimit: limitCell || photoLimit,
      clientKind: parseOffered(cell(row, 'offered'), 'school'),
    }));
  }
  return { packages, addOns };
}

// ---------- Codes ----------

const CODE_SKIP = new Set(['PACKAGE', 'PKG', 'THE', 'AND', 'OF', 'WITH', 'W', 'PROMO', 'FOR']);

/** Gives every draft without a code a unique one (PKG-BASIC, ADD-EXTRA-8R), clear of codes in use. */
export function assignCodes(draft: CatalogDraft, usedPackageCodes: Iterable<string>, usedAddOnCodes: Iterable<string>): CatalogDraft {
  const make = (name: string, prefix: string, taken: Set<string>, current: string) => {
    const wanted = current.trim().toUpperCase();
    if (wanted && !taken.has(wanted)) { taken.add(wanted); return wanted; }
    const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !CODE_SKIP.has(w));
    const base = `${prefix}-${words.slice(0, 2).join('-') || 'ITEM'}`.slice(0, 20);
    let code = wanted || base;
    for (let n = 2; taken.has(code); n++) code = `${wanted || base}-${n}`;
    taken.add(code);
    return code;
  };
  const pkgTaken = new Set([...usedPackageCodes].map((c) => c.toUpperCase()));
  const addTaken = new Set([...usedAddOnCodes].map((c) => c.toUpperCase()));
  return {
    packages: draft.packages.map((p) => ({ ...p, code: make(p.name, 'PKG', pkgTaken, p.code) })),
    addOns: draft.addOns.map((a) => ({ ...a, code: make(a.name, 'ADD', addTaken, a.code) })),
  };
}
