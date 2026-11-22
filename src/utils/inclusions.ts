// Package inclusions with sections: plain items, or titled sections holding items and (one level
// deeper) sub-sections. The server cleans the same shape (cleanInclusions in pb_hooks/studio_pricing.js).
import type { InclusionSection, PackageInclusion } from '../types';

export const isSection = (entry: PackageInclusion): entry is InclusionSection =>
  typeof entry === 'object' && entry !== null && typeof (entry as InclusionSection).title === 'string';

/** A saved inclusions value (array, JSON text, or old plain text) as a tree. */
export function parseInclusionTree(raw: unknown): PackageInclusion[] {
  let value = raw;
  for (let i = 0; i < 2 && typeof value === 'string'; i++) {
    try { value = JSON.parse((value as string) || 'null'); } catch { return (value as string).trim() ? [value as string] : []; }
  }
  if (!Array.isArray(value)) return [];
  const walk = (list: unknown[]): PackageInclusion[] => list.flatMap((entry): PackageInclusion[] => {
    if (typeof entry === 'string') return entry.trim() ? [entry] : [];
    if (entry && typeof entry === 'object' && typeof (entry as InclusionSection).title === 'string') {
      const section = entry as InclusionSection;
      return [{ title: section.title, items: walk(Array.isArray(section.items) ? section.items : []) }];
    }
    return [];
  });
  return walk(value);
}

/** Every item as one line, sections included: "Frame and Prints", "With 10x12 free frame", … */
export function inclusionLines(tree: PackageInclusion[]): string[] {
  return tree.flatMap((entry) => (isSection(entry) ? [entry.title, ...inclusionLines(entry.items)] : [entry]));
}

/** The top level only: plain items and section titles (for short summaries). */
export const topLevelLabels = (tree: PackageInclusion[]): string[] =>
  tree.map((entry) => (isSection(entry) ? entry.title : entry));

/** How many items a client gets (section titles not counted). */
export function countInclusionItems(tree: PackageInclusion[]): number {
  return tree.reduce((sum, entry) => sum + (isSection(entry) ? Math.max(1, countInclusionItems(entry.items)) : 1), 0);
}

/** The tree as saved: text trimmed, empty items and untitled empty sections dropped. */
export function cleanInclusionTree(tree: PackageInclusion[]): PackageInclusion[] {
  return tree.flatMap((entry): PackageInclusion[] => {
    if (!isSection(entry)) return entry.trim() ? [entry.trim()] : [];
    const items = cleanInclusionTree(entry.items);
    return entry.title.trim() || items.length ? [{ title: entry.title.trim(), items }] : [];
  });
}

const key = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The current tree plus new entries it lacks: same items skipped, same-titled sections merged. */
export function mergeInclusionTrees(current: PackageInclusion[], extra: PackageInclusion[]): PackageInclusion[] {
  const merged: PackageInclusion[] = current.map((e) => (isSection(e) ? { title: e.title, items: [...e.items] } : e));
  for (const entry of cleanInclusionTree(extra)) {
    if (isSection(entry)) {
      const same = merged.find((m): m is InclusionSection => isSection(m) && key(m.title) === key(entry.title));
      if (same) same.items = mergeInclusionTrees(same.items, entry.items);
      else merged.push(entry);
    } else if (!inclusionLines(merged).some((line) => key(line) === key(entry))) {
      // Skipped when the package already lists it anywhere, inside a section too.
      merged.push(entry);
    }
  }
  return merged;
}

/**
 * The inclusions the client bought: frozen on the job order, or (older orders) the package's current list.
 */
export function orderInclusionTree(reg: {
  package_snapshot?: { inclusions?: PackageInclusion[] } | null;
  expand?: { package?: { inclusions?: PackageInclusion[] | string } };
}): PackageInclusion[] {
  const sold = reg.package_snapshot?.inclusions;
  return Array.isArray(sold) ? parseInclusionTree(sold) : parseInclusionTree(reg.expand?.package?.inclusions);
}
