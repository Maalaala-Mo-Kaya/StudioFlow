// Turns text read from a flyer, price list or spreadsheet into draft packages and add-ons.
// Drafts are only suggestions: the admin reviews and edits them before anything is saved.
import type { PackageInclusion, PackageOptionGroup, RevenueCategory } from '../../../types';
import { inclusionLines, parseInclusionTree } from '../../../utils/inclusions';
import type { PackageKind } from '../useAdminData';

export interface DraftPackage {
  key: string;
  include: boolean;
  code: string;
  name: string;
  amount: number;
  /** Plain items and titled sections ("Colored toga w/out cap" › "1 pc - 8R", …). */
  inclusions: PackageInclusion[];
  freebies: string[];
  /** Set to add this draft's inclusions and freebies to an existing package (its id) instead of creating one. */
  mergeInto?: string;
  /** Groups the client chooses from ("Options: Toga w/ cap, Filipiniana (girls)…"). */
  optionGroups: PackageOptionGroup[];
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
    key: nextKey(), include: true, code: '', name: '', amount: 0, inclusions: [], freebies: [], optionGroups: [], photoLimit: 0,
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
    const { inclusions, freebies, optionGroups, photoLimit } = inclusionsFrom(body.map((line) => line.text), names[n]);
    packages.push(newDraftPackage({
      name: finish(names[n]),
      amount: lines[at].price!.amount,
      inclusions,
      freebies,
      optionGroups,
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
    const { inclusions, freebies, optionGroups, photoLimit } = inclusionsFrom(lines.slice(named ? start + 1 : 0).map((l) => l.text), name);
    packages.push(newDraftPackage({ name, inclusions, freebies, optionGroups, photoLimit }));
  }

  return { packages, addOns: dedupeAddOns(addOns) };
}

/**
 * Cleans a package's body lines into inclusions and freebies (lines under a "Freebies" heading, or
 * starting with "FREE"), and picks up "choose N best poses".
 */
export function inclusionsFrom(body: string[], packageName = ''): {
  inclusions: PackageInclusion[]; freebies: string[]; optionGroups: PackageOptionGroup[]; photoLimit: number;
} {
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
  const optionGroups: PackageOptionGroup[] = [];
  let options: PackageOptionGroup | null = null;
  body.forEach((line, i) => {
    const optionHeader = OPTION_HEADER.exec(line);
    if (optionHeader) {
      options = { id: optionId(), name: 'Options', pick: Number(optionHeader[1]) || 1, choices: [] };
      optionGroups.push(options);
      inFreebies = false; last = null;
      return;
    }
    // A short line naming freebies starts the freebies, even with OCR noise around it
    // ("Pe FREEBIES —" for "ADDITIONAL FREEBIES").
    if (FREEBIE_HEADER.test(line) || (/\bfreebies\b/i.test(line) && line.split(/\s+/).length <= 4)) {
      inFreebies = true; options = null; last = null; return;
    }
    if (INCLUSION_HEADER.test(line)) { inFreebies = false; options = null; last = null; return; }
    const key = lineKey(line);
    // Quantity lines may repeat across print sets ("4 pcs - 2x2" in two sections): kept here,
    // and duplicates are removed after grouping (groupQuantitySections).
    if (skip.has(i) || key.length < 2 || (seen.has(key) && !QUANTITY.test(line))) return;
    // Prints ("4 pcs - 2x2") and FREE items are never options: they end the options list.
    if (options && (QUANTITY.test(line) || FREE_ITEM.test(line))) options = null;
    if (options) {
      seen.add(key);
      addOptionChoice(options, line);
      return;
    }
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
  return {
    inclusions: groupQuantitySections(inclusions.map(finish)),
    freebies: freebies.map(finish),
    optionGroups: optionGroups.filter((group) => group.choices.length).map((group) => ({ ...group, pick: Math.min(group.pick, group.choices.length) })),
    photoLimit,
  };
}

// ---------- Inclusion sections ----------

/** "1 pc - 8R", "2 pcs - wallet sizes", "4pcs 2x2", "7 copies": a quantity of prints. */
const QUANTITY = /^\d+\s*(?:pcs?|pieces?|copies|copy|sets?)\b/i;

/**
 * A heading followed by two or more quantity lines becomes a titled section, like the flyer's
 * "COLORED TOGA W/OUT CAP" › "1 pc - 8R", "2 pcs - wallet sizes"…  Other lines stay plain items.
 */
export function groupQuantitySections(lines: string[]): PackageInclusion[] {
  const out: PackageInclusion[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let end = i + 1;
    while (end < lines.length && QUANTITY.test(lines[end])) end++;
    const heading = !QUANTITY.test(line) && !FREE_ITEM.test(line) && !/\d/.test(line.split(/\s+/)[0] || '')
      && line.split(/\s+/).length <= 8;
    if (heading && end - i - 1 >= 2) {
      const items = [...new Map(lines.slice(i + 1, end).map((item) => [lineKey(item), item])).values()];
      out.push({ title: line, items });
      i = end - 1;
    } else {
      out.push(line);
    }
  }
  // A loose line repeating an item already listed (photo captions under the prints) is dropped.
  const inSections = new Set(out.flatMap((e) => (typeof e === 'string' ? [] : e.items.map((item) => lineKey(String(item))))));
  const loose = new Set<string>();
  return out.filter((e) => {
    if (typeof e !== 'string') return true;
    const k = lineKey(e);
    if (inSections.has(k) || loose.has(k)) return false;
    loose.add(k);
    return true;
  });
}

// ---------- Package options ----------

/** "OPTIONS:", "Attire options (choose 2):", "Choices": the client picks from the lines that follow. */
const OPTION_HEADER = /^(?:(?:attire|package|available|outfit)\s+)?(?:options?|choices?)(?:\s*\(?\s*(?:choose|pick|select)\s*(?:any\s*)?(\d+)\s*\)?)?[\s:]*$/i;
/** "(girls)", "(for boys)", "- ladies": who an option is for. */
const OPTION_FOR = /\s*[-–(]\s*(?:for\s+)?(girls?|ladies|female|women|boys?|gents|gentlemen|male|men)\s*\)?\s*$/i;

let optionSeq = 0;
const optionId = () => `opt${Date.now().toString(36)}${(++optionSeq).toString(36)}`;

/** Reads one option line into a choice: the gender note becomes who it's for. */
export function optionChoice(text: string): { id: string; label: string; for: 'all' | 'female' | 'male' } {
  let label = finish(text);
  let forWhom: 'all' | 'female' | 'male' = 'all';
  const marked = OPTION_FOR.exec(label);
  if (marked) {
    forWhom = /girl|lad|fem|wom/i.test(marked[1]) ? 'female' : 'male';
    label = label.slice(0, marked.index);
  }
  label = finish(label.replace(/^(?:or|and)\s+/i, '').trim());
  return { id: optionId(), label: label.charAt(0).toUpperCase() + label.slice(1), for: forWhom };
}

/**
 * Adds an option line to a group. A line starting with "or" continues the one before it:
 * "Filipiniana" / "or glamour shots (girls)" are both for girls.
 */
function addOptionChoice(group: PackageOptionGroup, line: string) {
  const choice = optionChoice(line);
  // The same option read twice, once with junk from nearby text ("Glamour shots (girls) nk: g…"), is skipped.
  const k = lineKey(choice.label);
  if (!choice.label || group.choices.some((c) => { const ck = lineKey(c.label); return ck === k || (ck.length >= 6 && k.startsWith(ck)); })) return;
  const previous = group.choices[group.choices.length - 1];
  if (/^\s*or\b/i.test(line) && previous && previous.for === 'all' && choice.for !== 'all') previous.for = choice.for;
  group.choices.push(choice);
}

/** A spreadsheet "Options" cell: "Attire (choose 1): Toga w/ cap | Filipiniana (girls)", groups split by lines or ";". */
function optionGroupsFromCell(cell: string): PackageOptionGroup[] {
  const groups: PackageOptionGroup[] = [];
  for (const part of cell.split(/\r?\n|;/).map((p) => p.trim()).filter(Boolean)) {
    const colon = part.indexOf(':');
    const head = colon > 0 ? part.slice(0, colon) : '';
    const list = colon > 0 ? part.slice(colon + 1) : part;
    const pick = Number(/(?:choose|pick|select)\s*(\d+)/i.exec(head)?.[1]) || 1;
    const name = finish(head.replace(/\(?\s*(?:choose|pick|select)\s*\d+\s*\)?/i, '').trim()) || 'Options';
    const group: PackageOptionGroup = { id: optionId(), name, pick, choices: [] };
    for (const item of list.split(list.includes('|') ? '|' : ',').map((s) => s.trim()).filter(Boolean)) addOptionChoice(group, item);
    if (group.choices.length) groups.push({ ...group, pick: Math.min(pick, group.choices.length) });
  }
  return groups;
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
  options: /^(options?|choices?|attire options?)$/,
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
    const kind = /option|choice/.test(type) ? 'option'
      : /free/.test(type) ? 'freebie'
      : /add|extra|upgrade/.test(type) ? 'addon'
      : /incl/.test(type) ? 'inclusion'
      : /pack|pkg|bundle|promo/.test(type) ? 'package'
      : !priceText && packages.length ? 'inclusion'
      : section ?? 'package';

    if (kind === 'option') {
      // An "Option" row adds a choice to the last package's first option group ("Options").
      const last = packages[packages.length - 1];
      if (last && name) {
        if (!last.optionGroups.length) last.optionGroups.push({ id: optionId(), name: 'Options', pick: 1, choices: [] });
        addOptionChoice(last.optionGroups[0], name);
      }
      continue;
    }
    if (kind === 'inclusion' || kind === 'freebie') {
      const last = packages[packages.length - 1];
      if (last && name) {
        const isFree = kind === 'freebie' || FREE_ITEM.test(name);
        const known = isFree ? last.freebies : inclusionLines(last.inclusions);
        if (!known.some((i) => lineKey(i) === lineKey(name))) (isFree ? last.freebies : last.inclusions).push(name);
      }
      continue;
    }
    const code = cell(row, 'code').toUpperCase();
    if (kind === 'addon') {
      addOns.push(newDraftAddOn({ name, code, amount: Number.isFinite(amount) ? amount : 0,
        clientKind: parseOffered(cell(row, 'offered'), 'both') }));
      continue;
    }
    const split = (text: string) => text.split(/\r?\n|;|\||•|,(?!\d)/).map(tidy).filter(Boolean);
    const { inclusions, freebies: freeInclusions, optionGroups: listedOptions, photoLimit } = inclusionsFrom(split(cell(row, 'inclusions')), name);
    const freebies = [...freeInclusions];
    for (const item of split(cell(row, 'freebies'))) {
      if (!freebies.some((f) => lineKey(f) === lineKey(item))) freebies.push(item);
    }
    const limitCell = Number(cell(row, 'limit').replace(/[^\d]/g, ''));
    packages.push(newDraftPackage({
      name, code, amount: Number.isFinite(amount) ? amount : 0, inclusions, freebies,
      optionGroups: [...listedOptions, ...optionGroupsFromCell(cell(row, 'options'))],
      photoLimit: limitCell || photoLimit,
      clientKind: parseOffered(cell(row, 'offered'), 'school'),
    }));
  }
  return { packages, addOns };
}

// ---------- StudioFlow package files (.json) ----------

/**
 * A StudioFlow package file: { "packages": [...], "add_ons": [...] } with the catalog's own field
 * names (code, name, amount, inclusions with sections, freebies, option_groups,
 * photo_selection_limit, client_kind, revenue_category). Everything still goes through review.
 */
export function parseCatalogJson(text: string): CatalogDraft {
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    throw new Error('This file is not a StudioFlow package file (it is not valid JSON).');
  }
  const root = (Array.isArray(data) ? { packages: data } : data) as { packages?: unknown[]; add_ons?: unknown[] };
  if (!root || typeof root !== 'object' || (!Array.isArray(root.packages) && !Array.isArray(root.add_ons))) {
    throw new Error('This file has no "packages" or "add_ons" list.');
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const kind = (v: unknown, fallback: PackageKind): PackageKind => (['school', 'walkin', 'both'].includes(v as string) ? v as PackageKind : fallback);
  const revenue = (v: unknown): RevenueCategory => (v === 'mua' ? 'mua' : 'studio');
  const packages = (root.packages ?? []).flatMap((raw) => {
    const p = raw as Record<string, unknown>;
    if (!p || typeof p !== 'object' || !str(p.name)) return [];
    const groups = (Array.isArray(p.option_groups) ? p.option_groups : []) as PackageOptionGroup[];
    return [newDraftPackage({
      code: str(p.code).toUpperCase(),
      name: str(p.name),
      amount: num(p.amount),
      inclusions: parseInclusionTree(p.inclusions),
      freebies: (Array.isArray(p.freebies) ? p.freebies : []).map(str).filter(Boolean),
      optionGroups: groups.filter((g) => g && typeof g === 'object').map((g) => ({
        id: str(g.id) || optionId(),
        name: str(g.name),
        pick: Math.max(1, Math.floor(num(g.pick) || 1)),
        ...(str(g.replaces) ? { replaces: str(g.replaces), replaces_for: (['female', 'male'].includes(g.replaces_for as string) ? g.replaces_for : 'all') as 'all' | 'female' | 'male' } : {}),
        choices: (Array.isArray(g.choices) ? g.choices : []).map((c) => ({
          id: str(c?.id) || optionId(),
          label: str(c?.label),
          for: (['female', 'male'].includes(c?.for as string) ? c.for : 'all') as 'all' | 'female' | 'male',
          ...(Array.isArray(c?.items) && c.items.length ? { items: c.items.map(str).filter(Boolean) } : {}),
        })).filter((c) => c.label),
      })),
      photoLimit: Math.max(0, Math.floor(num(p.photo_selection_limit))),
      clientKind: kind(p.client_kind, 'school'),
      revenue: revenue(p.revenue_category),
    })];
  });
  const addOns = (root.add_ons ?? []).flatMap((raw) => {
    const a = raw as Record<string, unknown>;
    if (!a || typeof a !== 'object' || !str(a.name)) return [];
    return [newDraftAddOn({ code: str(a.code).toUpperCase(), name: str(a.name), amount: num(a.amount),
      clientKind: kind(a.client_kind, 'both'), ...(a.revenue_category ? { revenue: revenue(a.revenue_category) } : {}) })];
  });
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
