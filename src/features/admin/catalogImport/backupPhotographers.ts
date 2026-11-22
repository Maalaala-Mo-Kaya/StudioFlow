import type { CatalogItem, StaffUser } from '../../../types';
import type { CatalogBackup } from '../catalogBackup';

type BackupItem = CatalogBackup['items'][number];

export const backupMatchKey = (value: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function findBackupItem(items: CatalogItem[], backup: BackupItem) {
  return items.find((item) => item.id === backup.id) ?? items.find((item) =>
    backupMatchKey(item.name) === backupMatchKey(backup.name) && (item.category || 'other') === backup.category);
}

export const enabledBackupPhotographers = (staff: StaffUser[]) =>
  staff.filter((account) => account.role === 'photographer' && !account.disabled);

export function backupPhotographerIds(item: BackupItem) {
  return item.category === 'other' && Array.isArray(item.required_photographers) ? item.required_photographers : [];
}

export function missingBackupPhotographers(
  backup: CatalogBackup, items: CatalogItem[], update: boolean, enabledIds: ReadonlySet<string>,
) {
  const missing = new Map<string, Set<string>>();
  for (const item of backup.items) {
    const ids = backupPhotographerIds(item);
    if (!ids.length || (!update && findBackupItem(items, item))) continue;
    for (const id of ids) {
      if (enabledIds.has(id)) continue;
      const names = missing.get(id) ?? new Set<string>();
      names.add(item.name);
      missing.set(id, names);
    }
  }
  return missing;
}
