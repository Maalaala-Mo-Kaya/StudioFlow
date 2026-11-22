// The package builder's preview: the same rendering the server does (pb_hooks/studio_catalog.js,
// render), so the admin sees exactly what clients will see. Keep the two in step.
import type {
  CatalogItem, ExchangeOption, FreebieChoice, InclusionSection, ItemPackage, PackageExchange, PackageInclusion, PackageInclusionRef, PackageOptionGroup, PackagePose,
  PackageStructure, PoseRow,
} from '../types';

export const newId = () => Math.random().toString(36).slice(2, 12);

export const emptyStructure = (): PackageStructure => ({
  frame_item: '', unlimited_shots: true, inclusions: [], freebies: [], exchanges: [], freebie_choices: [], choice_groups: [],
});

export interface Catalog {
  items: Map<string, CatalogItem>;
  sets: Map<string, ItemPackage>;
}

export const makeCatalog = (items: CatalogItem[], sets: ItemPackage[]): Catalog => ({
  items: new Map(items.map((i) => [i.id, i])),
  sets: new Map(sets.map((s) => [s.id, { ...s, items: Array.isArray(s.items) ? s.items : [] }])),
});

type Loose = Record<string, unknown>;
/** A saved pose's attire and background ids, when set. */
const looks = (e: Loose): { attire?: string; background?: string } => ({
  ...(typeof e.attire === 'string' && e.attire ? { attire: e.attire } : {}),
  // Kept without an attire too: a new pose starts on a background before its attire is chosen.
  ...(typeof e.background === 'string' && e.background ? { background: e.background } : {}),
});
const rowsOf = (value: unknown): PoseRow[] => (Array.isArray(value) ? value : [])
  .filter((r): r is PoseRow => !!r && typeof r === 'object' && typeof (r as Loose).item === 'string')
  .map((r) => ({ item: r.item, qty: qtyOf(r.qty) }));

/**
 * A saved structure, filled in where older or partial data leaves gaps. Older references to saved
 * poses ({ type: 'set' }, exchange `set`, option `set`) are copied in, as the server does.
 */
export function readStructure(raw: unknown, catalog?: Catalog): PackageStructure {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Loose;
  const fromSet = (id: unknown) => (typeof id === 'string' ? catalog?.sets.get(id) : undefined);
  const inclusions: PackageInclusionRef[] = (Array.isArray(s.inclusions) ? s.inclusions as Loose[] : []).flatMap((e): PackageInclusionRef[] => {
    if (e?.type === 'pose') return [{ type: 'pose', id: String(e.id || newId()), title: String(e.title || ''), ...looks(e), items: rowsOf(e.items) }];
    if (e?.type === 'item' && typeof e.id === 'string') return [{ type: 'item', id: e.id, qty: qtyOf(e.qty) }];
    const set = e?.type === 'set' ? fromSet(e.id) : undefined;
    return set ? [{ type: 'pose', id: set.id, title: set.name, items: rowsOf(set.items) }] : [];
  });
  const exchanges: PackageExchange[] = (Array.isArray(s.exchanges) ? s.exchanges as Loose[] : []).map((ex) => ({
    id: String(ex.id || newId()),
    name: String(ex.name || ''),
    pose: String(ex.pose || ex.set || ''),
    keep_for: (ex.keep_for as PackageExchange['keep_for']) || 'all',
    options: (Array.isArray(ex.options) ? ex.options as Loose[] : []).flatMap((o) => {
      const set = !o.title && !o.attire ? fromSet(o.set) : undefined;
      if (!o.title && !o.attire && !set) return [];
      return [{
        id: String(o.id || o.set || newId()), title: String(o.title || set?.name || ''), ...looks(o),
        for: (o.for as PackageExchange['keep_for']) || 'all', items: rowsOf(o.items ?? set?.items),
      }];
    }),
  }));
  const freebieChoices: FreebieChoice[] = (Array.isArray(s.freebie_choices) ? s.freebie_choices as Loose[] : []).flatMap((fc) =>
    (typeof fc?.item === 'string' ? [{
      id: String(fc.id || newId()), item: fc.item,
      choices: (Array.isArray(fc.choices) ? fc.choices as Loose[] : []).map((c) => ({ id: String(c.id || newId()), label: String(c.label || '') })),
    }] : []));
  return {
    frame_item: typeof s.frame_item === 'string' ? s.frame_item : '',
    unlimited_shots: s.unlimited_shots !== false,
    inclusions,
    freebies: Array.isArray(s.freebies) ? s.freebies as string[] : [],
    exchanges,
    freebie_choices: freebieChoices,
    choice_groups: Array.isArray(s.choice_groups) ? s.choice_groups as PackageOptionGroup[] : [],
  };
}

/** Another package's contents for a new one: fresh pose and option ids, exchanges kept on their poses. */
export function copyStructure(structure: PackageStructure): PackageStructure {
  const ids = new Map<string, string>();
  const inclusions = structure.inclusions.map((e) => {
    if (e.type !== 'pose') return { ...e };
    const id = newId();
    ids.set(e.id, id);
    return { ...e, id, items: e.items.map((r) => ({ ...r })) };
  });
  return {
    ...structure,
    inclusions,
    freebies: [...structure.freebies],
    exchanges: structure.exchanges.filter((ex) => ids.has(ex.pose)).map((ex) => ({
      ...ex, id: newId(), pose: ids.get(ex.pose)!,
      options: ex.options.map((o) => ({ ...o, id: newId(), items: o.items.map((r) => ({ ...r })) })),
    })),
    freebie_choices: structure.freebie_choices.map((fc) => ({ ...fc, id: newId(), choices: fc.choices.map((c) => ({ ...c, id: newId() })) })),
    choice_groups: [...structure.choice_groups],
  };
}

/** A new pose from a saved pose (a copy: later changes to either don't touch the other). */
export const poseFromSaved = (set: ItemPackage): PackagePose => ({
  type: 'pose', id: newId(), title: set.name, items: set.items.map((r) => ({ item: r.item, qty: qtyOf(r.qty) })),
});

const qtyOf = (qty: unknown) => Math.max(1, Math.floor(Number(qty) || 1));

/** "1 pc - 11R" for prints; "2 × Toga" or "Toga" for other items. */
export function itemLine(item: CatalogItem, qty: number): string {
  const n = qtyOf(qty);
  if (item.category === 'print') return `${n} ${n === 1 ? 'pc' : 'pcs'} - ${item.name}`;
  return n > 1 ? `${n} × ${item.name}` : item.name;
}

export function rowLines(rows: PoseRow[], catalog: Catalog): string[] {
  return rows.flatMap((entry) => {
    const item = catalog.items.get(entry.item);
    return item ? [itemLine(item, entry.qty)] : [];
  });
}

/** A pose's print rows only (an exchange option takes the prints, not the exchanged attire's own items). */
export const printRows = (rows: PoseRow[], catalog: Catalog): PoseRow[] =>
  rows.filter((r) => catalog.items.get(r.item)?.category === 'print');

/** How many hard copies a pose's rows add to "N pcs hard printout copy". */
export const rowPrints = (rows: PoseRow[], catalog: Catalog): number =>
  rows.reduce((sum, entry) => sum + (catalog.items.get(entry.item)?.category === 'print' ? qtyOf(entry.qty) : 0), 0);

export const setPrints = (set: ItemPackage, catalog: Catalog): number => rowPrints(set.items, catalog);

/** The total hard copies of a package (its poses and print items). */
export function totalPrints(structure: PackageStructure, catalog: Catalog): number {
  return structure.inclusions.reduce((sum, entry) => {
    if (entry.type === 'pose') return sum + rowPrints(entry.items, catalog);
    return sum + (catalog.items.get(entry.id)?.category === 'print' ? qtyOf(entry.qty) : 0);
  }, 0);
}

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/** "Toga w/out cap · Colored" from the pose's attire and background; its typed title otherwise. */
export function poseTitle(pose: { title: string; attire?: string; background?: string }, catalog: Catalog): string {
  const attire = pose.attire ? catalog.items.get(pose.attire) : undefined;
  if (!attire) return pose.title;
  const background = pose.background ? catalog.items.get(pose.background) : undefined;
  return background ? `${attire.name} · ${background.name}` : attire.name;
}

/** A pose as clients see it: a titled list, or a plain line when it is just itself ("Filipiniana"). */
const poseNode = (title: string, lines: string[]): PackageInclusion =>
  (!lines.length || (lines.length === 1 && key(lines[0]) === key(title)) ? title : { title, items: lines });

/** What clients see: inclusions (with Frame and Prints), freebies and option groups. */
export function renderPackage(structure: PackageStructure, catalog: Catalog, photoLimit: number): {
  inclusions: PackageInclusion[]; freebies: string[]; optionGroups: PackageOptionGroup[];
} {
  const frame = structure.frame_item ? catalog.items.get(structure.frame_item) : undefined;
  const framePrints: PackageInclusion[] = [];
  const others: PackageInclusion[] = [];
  const poses = new Map<string, PackagePose>();
  // Print poses of one attire share a section: "Toga w/out cap" › "Colored" › 1 pc - 11R.
  const attireGroups = new Map<string, InclusionSection>();
  const shot = (name: string) => { if (!others.some((o) => typeof o === 'string' && key(o) === key(name))) others.push(name); };
  let prints = 0;
  for (const entry of structure.inclusions) {
    if (entry.type === 'pose') {
      const title = poseTitle(entry, catalog);
      // Not named yet (the attire is still being chosen): nothing to show.
      if (!title.trim()) continue;
      poses.set(entry.id, { ...entry, title });
      const lines = rowLines(entry.items, catalog);
      const count = rowPrints(entry.items, catalog);
      prints += count;
      const attire = entry.attire ? catalog.items.get(entry.attire) : undefined;
      if (attire) {
        shot(attire.name);
        if (!count) continue;
        let group = attireGroups.get(attire.id);
        if (!group) { group = { title: attire.name, items: [] }; attireGroups.set(attire.id, group); framePrints.push(group); }
        const background = entry.background ? catalog.items.get(entry.background) : undefined;
        if (background) group.items.push({ title: background.name, items: lines });
        else group.items.push(...lines);
        continue;
      }
      if (count) framePrints.push(poseNode(title, lines));
      else { const node = poseNode(title, lines); if (typeof node === 'string') shot(node); else others.push(node); }
    } else {
      const item = catalog.items.get(entry.id);
      if (!item) continue;
      if (item.category === 'print') {
        prints += qtyOf(entry.qty);
        framePrints.push(itemLine(item, entry.qty));
      } else {
        shot(itemLine(item, entry.qty));
      }
    }
  }
  const inclusions: PackageInclusion[] = [];
  if (frame || prints) {
    const head: string[] = [];
    if (frame) head.push(/^with\b/i.test(frame.name) ? frame.name : `With ${frame.name}`);
    if (prints) head.push(`${prints} pcs hard printout copy`);
    inclusions.push({ title: 'Frame and Prints', items: [...head, ...framePrints] });
  }
  if (structure.unlimited_shots) {
    const n = Math.max(0, Math.floor(photoLimit || 0));
    inclusions.push(n ? `Unlimited shots (choose your best ${n})` : 'Unlimited shots');
  }
  inclusions.push(...others);

  const freebies = structure.freebies.flatMap((id) => {
    const item = catalog.items.get(id);
    return item ? [item.name] : [];
  });

  const optionGroups: PackageOptionGroup[] = [];
  for (const ex of structure.exchanges) {
    const target = poses.get(ex.pose);
    // An option is the exchanged pose in another attire: same prints and background.
    const like = (o: ExchangeOption) => (target ? { ...o, background: o.attire ? target.background : undefined, items: printRows(target.items, catalog) } : o);
    const choices = ex.options.map(like).filter((o) => poseTitle(o, catalog).trim()).map((o) => {
      const lines = rowLines(o.items, catalog);
      return { id: o.id, label: poseTitle(o, catalog).trim(), for: o.for || 'all', ...(lines.length ? { items: lines } : {}) };
    });
    if (!target || !choices.length) continue;
    optionGroups.push({ id: ex.id, name: ex.name || 'Options', pick: 1, replaces: target.title, replaces_for: ex.keep_for || 'all', choices });
  }
  for (const fc of structure.freebie_choices) {
    const item = structure.freebies.includes(fc.item) ? catalog.items.get(fc.item) : undefined;
    const choices = fc.choices.filter((c) => c.label.trim()).map((c) => ({ id: c.id, label: c.label.trim(), for: 'all' as const }));
    if (!item || choices.length < 2) continue;
    optionGroups.push({ id: fc.id, name: item.name.slice(0, 60), pick: 1, freebie: true, choices });
  }
  optionGroups.push(...structure.choice_groups);
  return { inclusions, freebies, optionGroups };
}

/** "11R × 1 · Wallet size × 2" for lists. */
export const rowSummary = (rows: PoseRow[], catalog: Catalog): string =>
  rows.map((entry) => {
    const item = catalog.items.get(entry.item);
    return item ? `${item.name} × ${qtyOf(entry.qty)}` : '';
  }).filter(Boolean).join(' · ') || 'No items yet';

export const setSummary = (set: ItemPackage, catalog: Catalog): string => rowSummary(set.items, catalog);
