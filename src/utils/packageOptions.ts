// Package options on screen. The server checks the same rules (pb_hooks/studio_package_options.js):
// keep them in step.
import type { ChosenPackageOptions, Gender, Package, PackageOptionChoice, PackageOptionGroup } from '../types';

/** What the kiosk and admin send: the chosen choice ids per group id. */
export type OptionPicks = Record<string, string[]>;

export const OPTION_FOR_LABELS: Record<PackageOptionChoice['for'], string> = { all: 'Everyone', female: 'Female', male: 'Male' };

/** The id of the "keep the included one" choice in a group that exchanges an inclusion. */
export const KEEP_CHOICE = 'keep';

/** A package's option groups (empty when it has none). */
export function optionGroups(pkg: Pick<Package, 'option_groups'> | null | undefined): PackageOptionGroup[] {
  const groups = pkg?.option_groups;
  return Array.isArray(groups) ? groups.filter((g) => g && Array.isArray(g.choices) && g.choices.length) : [];
}

/**
 * The choices a client of this gender can pick. A group that exchanges an inclusion offers
 * keeping it first ("keep"), to everyone.
 */
export function availableChoices(group: PackageOptionGroup, gender: Gender | '' | undefined): PackageOptionChoice[] {
  const own = group.choices.filter((c) => c.for === 'all' || !c.for || c.for === gender);
  const keepFor = group.replaces_for || 'all';
  const canKeep = group.replaces && (keepFor === 'all' || keepFor === gender);
  return canKeep ? [{ id: KEEP_CHOICE, label: group.replaces!, for: keepFor, keep: true }, ...own] : own;
}

/** Picks used before the client chooses (same as the server): keep, or the only choices offered. */
export function defaultPicks(group: PackageOptionGroup, gender: Gender | '' | undefined): string[] {
  if (!group.replaces) return [];
  const offered = availableChoices(group, gender);
  if (offered.some((c) => c.keep)) return [KEEP_CHOICE];
  const need = Math.min(group.pick || 1, offered.length);
  return offered.length === need ? offered.map((c) => c.id) : [];
}

/** How many choices the client must pick in a group. */
export function requiredPicks(group: PackageOptionGroup, gender: Gender | '' | undefined): number {
  return Math.min(group.pick || 1, availableChoices(group, gender).length);
}

/**
 * Drops picks that no longer apply (another package, or a gender the choice isn't for). A group
 * that exchanges an inclusion starts on "keep", like the server.
 */
export function keepValidPicks(groups: PackageOptionGroup[], gender: Gender | '' | undefined, picks: OptionPicks): OptionPicks {
  const kept: OptionPicks = {};
  for (const group of groups) {
    const allowed = new Set(availableChoices(group, gender).map((c) => c.id));
    const sent = picks[group.id] ?? defaultPicks(group, gender);
    const ids = sent.filter((id) => allowed.has(id)).slice(0, requiredPicks(group, gender));
    if (ids.length) kept[group.id] = ids;
  }
  return kept;
}

/** The first group still missing picks, with a message for the client; null when all are chosen. */
export function missingPicks(groups: PackageOptionGroup[], gender: Gender | '' | undefined, picks: OptionPicks): string | null {
  for (const group of groups) {
    const need = requiredPicks(group, gender);
    if (need && (picks[group.id] || []).length !== need) {
      return `${group.name}: choose ${need} option${need === 1 ? '' : 's'}.`;
    }
  }
  return null;
}

/** The body sent to the server. */
export const picksPayload = (picks: OptionPicks) =>
  Object.entries(picks).map(([group, choices]) => ({ group, choices }));

/** Saved picks back into the editable form (for Edit Client). */
export function picksFromSaved(saved: ChosenPackageOptions[] | null | undefined): OptionPicks {
  const picks: OptionPicks = {};
  for (const item of Array.isArray(saved) ? saved : []) picks[item.group_id] = item.choices.map((c) => c.id);
  return picks;
}

/** "Filipiniana (1 pc - 3R, 2 pcs - wallet)": a choice with what it comes with. */
export const choiceText = (choice: { label: string; items?: string[] }) =>
  choice.items?.length ? `${choice.label} (${choice.items.join(', ')})` : choice.label;

/**
 * "Attire: Filipiniana (1 pc - 3R) instead of Colored toga w/out cap" for cards and lists.
 * Keeping the included one reads "Attire: Colored toga w/out cap (kept)".
 */
export function chosenOptionLines(saved: ChosenPackageOptions[] | null | undefined): string[] {
  return (Array.isArray(saved) ? saved : [])
    .filter((item) => item.choices?.length)
    .map((item) => {
      const kept = item.choices.every((c) => c.keep);
      if (kept) return `${item.group}: ${item.replaces ?? item.choices[0].label} (kept)`;
      const picked = item.choices.filter((c) => !c.keep).map(choiceText).join(', ');
      return item.replaces && !item.choices.some((c) => c.keep)
        ? `${item.group}: ${picked} instead of ${item.replaces}`
        : `${item.group}: ${picked}`;
    });
}

/** Groups as saved: empty choices and groups dropped (the server cleans them again). */
export const cleanOptionGroups = (groups: PackageOptionGroup[]): PackageOptionGroup[] =>
  groups
    .map((g) => ({
      ...g,
      name: g.name.trim(),
      replaces: g.replaces?.trim() || undefined,
      replaces_for: g.replaces?.trim() ? (g.replaces_for || 'all') : undefined,
      choices: g.choices
        .map((c) => ({ ...c, label: c.label.trim(), items: (c.items ?? []).map((i) => i.trim()).filter(Boolean) }))
        .filter((c) => c.label),
    }))
    .filter((g) => g.name || g.choices.length);
