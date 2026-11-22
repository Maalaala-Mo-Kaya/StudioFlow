// A restorable copy of the catalog inside the exported price list (Excel, CSV or Word), so an
// emptied system can get its catalog back through Admin → Import from File. The copy is exact
// and machine-read: single items (prices, kiosk switch), saved poses, packages (with their
// structure: poses, attires, backgrounds, exchanges, freebie choices, tagline) and add-ons. The
// readable rows of the file are for people; editing them doesn't change what is restored.
// Package photos are files and are not included.
//
// Where it lives: Excel, a hidden "StudioFlow backup" sheet; CSV, rows whose first cell is the
// marker; Word, a custom XML part (customXml/studioflow-catalog.xml). Each holds the backup as
// base64 JSON in chunks ("b64:…", so spreadsheet apps never read a chunk as a formula).
// Load this module with import(): it pulls in fflate.
import { strFromU8, unzipSync } from 'fflate';
import type PocketBase from 'pocketbase';
import type { AddOn, CatalogItem, ItemPackage, Package } from '../../types';

export const BACKUP_MARKER = 'StudioFlow catalog backup (do not edit)';
export const BACKUP_SHEET = 'StudioFlow backup';
export const BACKUP_DOCX_PART = 'customXml/studioflow-catalog.xml';
const FORMAT = 'studioflow-catalog';
const CHUNK = 8000;

export interface CatalogBackup {
  format: typeof FORMAT;
  version: 1;
  exported_at: string;
  items: { id: string; name: string; category: string; amount: number; client_kind: string; is_active: boolean }[];
  poses: { id: string; name: string; items: { item: string; qty: number }[] }[];
  packages: {
    id: string; code: string; name: string; amount: number; description: string; tagline: string;
    client_kind: string; revenue_category: string; requires_mua: boolean; photo_selection_limit: number; is_active: boolean;
    structure: unknown; inclusions: unknown; freebies: unknown; option_groups: unknown;
  }[];
  add_ons: {
    id: string; code: string; name: string; amount: number; client_kind: string; revenue_category: string;
    requires_mua: boolean; default_when_no_mua: boolean; is_active: boolean;
  }[];
}

/** The catalog as the admin screen holds it, ready to embed. */
export function makeBackup(data: { items: CatalogItem[]; poses: ItemPackage[]; packages: Package[]; addOns: AddOn[] }): CatalogBackup {
  return {
    format: FORMAT, version: 1, exported_at: new Date().toISOString(),
    items: data.items.map((i) => ({
      id: i.id, name: i.name, category: i.category || 'other', amount: Number(i.amount) || 0,
      client_kind: i.client_kind || 'both', is_active: !!i.is_active,
    })),
    poses: data.poses.map((p) => ({ id: p.id, name: p.name, items: (p.items || []).map((r) => ({ item: r.item, qty: Number(r.qty) || 1 })) })),
    packages: data.packages.map((p) => ({
      id: p.id, code: p.code, name: p.name, amount: Number(p.amount) || 0, description: p.description || '', tagline: p.tagline || '',
      client_kind: p.client_kind || 'school', revenue_category: p.revenue_category || '', requires_mua: !!p.requires_mua,
      photo_selection_limit: Number(p.photo_selection_limit) || 0, is_active: p.is_active !== false,
      structure: p.structure ?? null, inclusions: p.inclusions ?? [], freebies: p.freebies ?? [], option_groups: p.option_groups ?? [],
    })),
    // Add-ons kept for a single item sold at the kiosk come back with that item.
    add_ons: data.addOns.filter((a) => !a.catalog_item).map((a) => ({
      id: a.id, code: a.code || '', name: a.name, amount: Number(a.amount) || 0, client_kind: a.client_kind || 'both',
      revenue_category: a.revenue_category || '', requires_mua: !!a.requires_mua, default_when_no_mua: !!a.default_when_no_mua,
      is_active: a.is_active !== false,
    })),
  };
}

// ---------- Encoding ----------

const toBase64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/** The backup as "b64:…" chunks, each safe in a spreadsheet cell. */
export function encodeBackup(backup: CatalogBackup): string[] {
  const b64 = toBase64(JSON.stringify(backup));
  const chunks: string[] = [];
  for (let i = 0; i < b64.length; i += CHUNK) chunks.push('b64:' + b64.slice(i, i + CHUNK));
  return chunks;
}

/** Joins "b64:…" chunks back into a backup; null when they aren't one. */
export function decodeBackup(chunks: string[]): CatalogBackup | null {
  try {
    const b64 = chunks.map((c) => c.trim()).filter((c) => c.startsWith('b64:')).map((c) => c.slice(4)).join('');
    if (!b64) return null;
    const value = JSON.parse(fromBase64(b64));
    return value && value.format === FORMAT && value.version === 1 && Array.isArray(value.items) ? value as CatalogBackup : null;
  } catch {
    return null;
  }
}

/** The backup inside a CSV's text (rows whose first cell is the marker). */
export function backupFromCsvText(text: string): CatalogBackup | null {
  const chunks = text.split(/\r?\n/).flatMap((line) => {
    const [first, second] = line.split(',');
    return first?.replace(/^"|"$/g, '') === BACKUP_MARKER && second ? [second.replace(/^"|"$/g, '')] : [];
  });
  return chunks.length ? decodeBackup(chunks) : null;
}

const unescapeXml = (text: string) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Column A of the workbook's backup sheet, read straight from the .xlsx zip (no spreadsheet
 * library needed; still works after the file is opened and saved again in Excel).
 */
function xlsxBackupCells(bytes: Uint8Array): string[] | null {
  const files = unzipSync(bytes, { filter: (f) => f.name.startsWith('xl/') && f.name.endsWith('.xml') || f.name.endsWith('.rels') });
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  const sheet = [...text('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0])
    .find((tag) => unescapeXml(/\bname="([^"]*)"/.exec(tag)?.[1] ?? '') === BACKUP_SHEET);
  const relId = sheet && /\br:id="([^"]+)"/.exec(sheet)?.[1];
  const target = relId && [...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0])
    .find((tag) => tag.includes(`Id="${relId}"`))?.match(/\bTarget="([^"]+)"/)?.[1];
  if (!target) return null;
  const sheetXml = text(target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => [...m[1].matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((t) => unescapeXml(t[1])).join(''));
  const cells: string[] = [];
  for (const m of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    if (!/\br="A\d+"/.test(attrs)) continue;
    const body = m[2] ?? '';
    if (/\bt="s"/.test(attrs)) cells.push(shared[Number(/<v>(\d+)<\/v>/.exec(body)?.[1] ?? -1)] ?? '');
    else cells.push(unescapeXml([...body.matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join('') || /<v>([^<]*)<\/v>/.exec(body)?.[1] || ''));
  }
  return cells;
}

/** Looks for a catalog backup in an uploaded file (an exported price list). */
export async function findBackupInFile(file: File): Promise<CatalogBackup | null> {
  const name = file.name.toLowerCase();
  try {
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      const text = await file.text();
      return text.includes(BACKUP_MARKER) ? backupFromCsvText(text) : null;
    }
    if (name.endsWith('.xlsx')) {
      const chunks = xlsxBackupCells(new Uint8Array(await file.arrayBuffer()));
      return chunks ? decodeBackup(chunks) : null;
    }
    if (name.endsWith('.docx')) {
      const part = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === BACKUP_DOCX_PART })[BACKUP_DOCX_PART];
      if (!part) return null;
      const chunks = [...strFromU8(part).matchAll(/<chunk>([^<]*)<\/chunk>/g)].map((m) => m[1]);
      return decodeBackup(chunks);
    }
  } catch {
    return null;
  }
  return null;
}

// ---------- Restoring ----------

export interface RestoreResult {
  created: number;
  updated: number;
  kept: number;
  failed: { what: string; name: string; message: string }[];
}

const key = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const message = (err: unknown) => {
  const data = (err as { response?: { message?: string; data?: Record<string, { message?: string }> } })?.response;
  const field = data?.data && Object.values(data.data)[0]?.message;
  return field || data?.message || (err instanceof Error ? err.message : 'Could not be saved.');
};

/** Replaces old item ids with the restored ones anywhere inside a package structure. */
function remap(value: unknown, ids: Map<string, string>): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remap(v, ids));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, ids)]));
  return value;
}

/**
 * Restores a backup through the normal API (so every server rule applies), in order: single
 * items, saved poses, packages, add-ons. Records are matched to what is already there (by id,
 * then by name / code); missing ones are created, keeping their old id when it is free, so
 * packages point at the right items. Existing ones are left as they are unless `update` is set.
 */
export async function restoreCatalog(pb: PocketBase, backup: CatalogBackup, update: boolean,
  onProgress?: (label: string, fraction: number) => void): Promise<RestoreResult> {
  const result: RestoreResult = { created: 0, updated: 0, kept: 0, failed: [] };
  const total = backup.items.length + backup.poses.length + backup.packages.length + backup.add_ons.length || 1;
  let done = 0;
  const step = (label: string) => onProgress?.(label, ++done / total);
  const opts = { requestKey: null };
  const [items, poses, packages, addOns] = await Promise.all([
    pb.collection('catalog_items').getFullList<CatalogItem>(opts),
    pb.collection('item_packages').getFullList<ItemPackage>(opts),
    pb.collection('packages').getFullList<Package>(opts),
    pb.collection('add_ons').getFullList<AddOn>(opts),
  ]);

  /** Create (keeping the id when free) or, if asked, update an existing record. */
  const put = async <T extends { id: string }>(collection: string, what: string, name: string, found: T | undefined, id: string, body: Record<string, unknown>) => {
    try {
      if (found) {
        if (update) { await pb.collection(collection).update(found.id, body, opts); result.updated++; } else result.kept++;
        return found.id;
      }
      const taken = [items, poses, packages, addOns].some((list) => (list as { id: string }[]).some((r) => r.id === id));
      const created = await pb.collection(collection).create<T>(taken ? body : { id, ...body }, opts);
      result.created++;
      return created.id;
    } catch (err) {
      result.failed.push({ what, name, message: message(err) });
      return found?.id;
    }
  };

  const itemIds = new Map<string, string>();
  for (const b of backup.items) {
    step('Single items');
    const found = items.find((r) => r.id === b.id) ?? items.find((r) => key(r.name) === key(b.name) && (r.category || 'other') === b.category);
    const body = { name: b.name, category: b.category, amount: b.amount, client_kind: b.client_kind, is_active: b.is_active && b.amount > 0 };
    const id = await put('catalog_items', 'Single item', b.name, found, b.id, body);
    if (id) itemIds.set(b.id, id);
  }

  for (const b of backup.poses) {
    step('Saved poses');
    const rows = b.items.map((r) => ({ item: itemIds.get(r.item) ?? r.item, qty: r.qty }));
    const sig = (list: { item: string; qty: number }[]) => JSON.stringify(list.map((r) => [r.item, r.qty]).sort());
    const found = poses.find((r) => r.id === b.id) ?? poses.find((r) => key(r.name) === key(b.name) && sig(r.items || []) === sig(rows));
    await put('item_packages', 'Saved pose', b.name, found, b.id, { name: b.name, items: rows, is_active: true });
  }

  for (const b of backup.packages) {
    step('Packages');
    const found = packages.find((r) => r.id === b.id) ?? packages.find((r) => key(r.code) === key(b.code));
    const contents = b.structure
      ? { structure: remap(b.structure, itemIds) }
      : { inclusions: b.inclusions, freebies: b.freebies, option_groups: b.option_groups };
    await put('packages', 'Package', `${b.name} (${b.code})`, found, b.id, {
      code: b.code, name: b.name, amount: b.amount, description: b.description, tagline: b.tagline,
      client_kind: b.client_kind, revenue_category: b.revenue_category, requires_mua: b.requires_mua,
      photo_selection_limit: b.photo_selection_limit, is_active: b.is_active, ...contents,
    });
  }

  for (const b of backup.add_ons) {
    step('Add-ons');
    const found = addOns.find((r) => r.id === b.id)
      ?? addOns.find((r) => !r.catalog_item && (b.code ? key(r.code || '') === key(b.code) : key(r.name) === key(b.name)));
    await put('add_ons', 'Add-on', b.name, found, b.id, {
      code: b.code, name: b.name, amount: b.amount, client_kind: b.client_kind, revenue_category: b.revenue_category,
      requires_mua: b.requires_mua, default_when_no_mua: b.default_when_no_mua, is_active: b.is_active,
    });
  }
  return result;
}
