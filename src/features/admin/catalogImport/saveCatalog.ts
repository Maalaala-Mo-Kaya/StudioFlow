// Saves reviewed catalog drafts. Kept apart from the React hook so the same code can be tested
// against a real PocketBase server.
import { ClientResponseError, type default as PocketBase } from 'pocketbase';
import { lineKey, type DraftAddOn, type DraftPackage } from './catalogParser';
import { parsePackageInclusions } from '../../../utils/formatters';
import { cleanOptionGroups, optionGroups } from '../../../utils/packageOptions';
import { cleanInclusionTree, mergeInclusionTrees, parseInclusionTree } from '../../../utils/inclusions';
import type { Package, PackageOptionGroup } from '../../../types';

export interface CatalogSaveResult {
  created: number;
  /** Existing packages that received a draft's inclusions and freebies ("Add to an existing package"). */
  updated: number;
  /** Drafts that were not saved, by draft key, with the server's reason. The rest were saved. */
  failed: { key: string; name: string; message: string }[];
}

function reason(err: unknown, code: string): string {
  if (err instanceof ClientResponseError) {
    const data = (err.response?.data ?? {}) as Record<string, { code?: string; message?: string }>;
    // Another save took the code between the check and the insert (the unique index caught it).
    if (data.code?.code === 'validation_not_unique') return `Code ${code.trim().toUpperCase()} was just used by another save. Change the code and save again.`;
    return Object.values(data)[0]?.message || err.message;
  }
  return err instanceof Error ? err.message : 'Could not be saved.';
}

/** The current list plus the new items it doesn't have yet (same words, ignoring case and punctuation). */
function mergeList(current: string[], extra: string[]): string[] {
  const merged = [...current];
  const seen = new Set(current.map(lineKey));
  for (const item of extra.map((i) => i.trim()).filter(Boolean)) {
    if (!seen.has(lineKey(item))) { seen.add(lineKey(item)); merged.push(item); }
  }
  return merged;
}

/**
 * The package's option groups plus the draft's: a group with the same name gets the new choices,
 * a new group is added.
 */
function mergeGroups(current: PackageOptionGroup[], extra: PackageOptionGroup[]): PackageOptionGroup[] {
  const merged = current.map((group) => ({ ...group, choices: [...group.choices] }));
  for (const group of cleanOptionGroups(extra)) {
    const same = merged.find((g) => lineKey(g.name) === lineKey(group.name));
    if (!same) { merged.push(group); continue; }
    for (const choice of group.choices) {
      if (!same.choices.some((c) => lineKey(c.label) === lineKey(choice.label))) same.choices.push(choice);
    }
  }
  return merged;
}

/**
 * Creates each package, then each add-on, one at a time and active, so the kiosk and cashier offer
 * them right away. One item failing does not stop the others; the failures are returned for retry.
 */
export async function saveCatalogDrafts(pb: PocketBase, packages: DraftPackage[], addOns: DraftAddOn[]): Promise<CatalogSaveResult> {
  const failed: CatalogSaveResult['failed'] = [];
  let created = 0;
  let updated = 0;
  for (const pkg of packages) {
    try {
      if (pkg.mergeInto) {
        // Read the package as it is now, so items another admin just added are kept.
        const current = await pb.collection('packages').getOne<Package>(pkg.mergeInto, { requestKey: null });
        await pb.collection('packages').update(pkg.mergeInto, {
          inclusions: mergeInclusionTrees(parseInclusionTree(current.inclusions), pkg.inclusions),
          freebies: mergeList(parsePackageInclusions(current.freebies), pkg.freebies),
          option_groups: mergeGroups(optionGroups(current), pkg.optionGroups),
        }, { requestKey: null });
        updated++;
        continue;
      }
      await pb.collection('packages').create({
        code: pkg.code.trim().toUpperCase(),
        name: pkg.name.trim(),
        amount: Number(pkg.amount),
        photo_selection_limit: Math.max(0, Math.floor(pkg.photoLimit || 0)),
        requires_mua: pkg.revenue === 'mua',
        client_kind: pkg.clientKind,
        revenue_category: pkg.revenue,
        inclusions: cleanInclusionTree(pkg.inclusions),
        freebies: pkg.freebies.map((item) => item.trim()).filter(Boolean),
        option_groups: cleanOptionGroups(pkg.optionGroups),
        is_active: true,
      }, { requestKey: null });
      created++;
    } catch (err) {
      failed.push({ key: pkg.key, name: pkg.name, message: reason(err, pkg.code) });
    }
  }
  for (const addOn of addOns) {
    try {
      await pb.collection('add_ons').create({
        name: addOn.name.trim(),
        code: addOn.code.trim().toUpperCase(),
        amount: Number(addOn.amount),
        requires_mua: addOn.revenue === 'mua',
        client_kind: addOn.clientKind,
        revenue_category: addOn.revenue,
        default_when_no_mua: false,
        is_active: true,
      }, { requestKey: null });
      created++;
    } catch (err) {
      failed.push({ key: addOn.key, name: addOn.name, message: reason(err, addOn.code) });
    }
  }
  return { created, updated, failed };
}
