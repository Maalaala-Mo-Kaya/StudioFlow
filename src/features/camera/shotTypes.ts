import { useSyncExternalStore } from 'react';
import { pb } from '../../db/pocketbase';
import { useWorkflowData, workflowApi } from '../../hooks/useWorkflowData';

/** A shot type from the admin's list (collection `shot_types`). */
export interface ShotType {
  id: string;
  name: string;
  /** The label written into photo file names: "IMG_0001 [TOGA CAP].JPG". */
  code: string;
  sort: number;
  active: boolean;
  /** Catalog items that stand for this type (attires, freebies). */
  items: string[];
}

export interface ShotTypeListing {
  types: ShotType[];
  /** The signed-in photographer's menu (type ids); every active type when they haven't chosen. */
  menu: string[];
}

export { SHOT_CODE_PATTERN, codeFromName, tagOf, tagged, untagged } from './shotTag';

export function useShotTypes() {
  return useWorkflowData<ShotTypeListing>('/shot-types', 30_000, true);
}

export function typeLabel(types: ShotType[] | undefined, code: string) {
  if (!code) return 'No type';
  return types?.find((type) => type.code === code)?.name ?? code;
}

/** The photographer's menu as types, in list order. */
export function menuTypes(listing: ShotTypeListing | undefined) {
  if (!listing) return [];
  const chosen = new Set(listing.menu);
  return listing.types.filter((type) => type.active && chosen.has(type.id));
}

export function saveShotMenu(ids: string[]) {
  return pb.send<ShotTypeListing>(`${workflowApi}/shot-menu`, { method: 'POST', body: { types: ids }, requestKey: null });
}

// --- The current type on this device ------------------------------------------------------------
//
// The type the next shots get. On a camera it is also saved on the server (the camera's
// shot_type), so shots that arrive through the Photo Sender get it too. Each change is kept with
// its time, so a shot auto-sent from this laptop gets the type that was on when it was taken
// (its file time), even if the photographer changed it before the file was sent.

interface TypeChange { at: number; code: string }
const storageKey = 'studioflow-shot-type';
let history: TypeChange[] = [{ at: 0, code: readSaved() }];
const listeners = new Set<() => void>();

function readSaved() {
  try { return localStorage.getItem(storageKey) || ''; } catch { return ''; }
}

export function currentShotType() {
  return history[history.length - 1].code;
}

/** Records a change of the current type (from this device or seen on the server). */
export function noteShotType(code: string, at = Date.now()) {
  if (code === currentShotType()) return;
  history = [...history.filter((change) => change.at > at - 6 * 3600_000 || change === history[history.length - 1]), { at, code }];
  try { localStorage.setItem(storageKey, code); } catch { /* per-device convenience only */ }
  for (const listener of listeners) listener();
}

/** The type that was on at `time` (ms, this device's clock). */
export function shotTypeAt(time: number) {
  let code = history[0].code;
  for (const change of history) {
    if (change.at <= time) code = change.code;
    else break;
  }
  return code;
}

export function useCurrentShotType() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, currentShotType);
}
