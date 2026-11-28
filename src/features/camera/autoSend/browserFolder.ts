/**
 * The laptop folder Auto-send reads, through the browser's File System Access API (Chrome and
 * Edge). It needs a secure page: plain http://<server>:8090 is allowed only after the browser
 * setting described in AutoSendPanel. The chosen folder is remembered in this browser
 * (IndexedDB); after a restart the browser asks once more before the page may use it again.
 */
import { isSendable, type FolderEntry, type SendFolder } from './engine';

type Permission = 'granted' | 'denied' | 'prompt';
interface DirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission(options: { mode: 'readwrite' }): Promise<Permission>;
  requestPermission(options: { mode: 'readwrite' }): Promise<Permission>;
}
type PickerWindow = Window & { showDirectoryPicker?: (options: { id?: string; mode: 'readwrite' }) => Promise<DirectoryHandle> };

/** Folders inside the chosen one that are read too (EOS can save into dated subfolders). */
const maxDepth = 2;

/**
 * A camera's watch folder on the server always holds StudioFlow's own working files. Sending from
 * it would upload its photos back into itself (and then the copies again), so it is refused.
 */
const watchFolderMarks = new Set(['.studioflow-sender.json', '.studioflow-received', '.studioflow-importing']);
export const WRONG_FOLDER = 'This is a StudioFlow camera folder on the server, not the folder EOS Utility saves into on this laptop. Choose the EOS folder.';

export async function isCameraFolder(dir: FileSystemDirectoryHandle) {
  for await (const handle of (dir as DirectoryHandle).values()) {
    if (watchFolderMarks.has(handle.name)) return true;
  }
  return false;
}

export function folderAccessSupported() {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

/** Lets the photographer pick the folder. Throws AbortError when they close the picker. */
export async function pickFolder(): Promise<DirectoryHandle> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('This browser cannot open a folder. Use Chrome or Edge.');
  return picker({ id: 'studioflow-auto-send', mode: 'readwrite' });
}

export async function folderPermission(handle: DirectoryHandle, ask: boolean): Promise<Permission> {
  const current = await handle.queryPermission({ mode: 'readwrite' });
  if (current === 'granted' || !ask) return current;
  return handle.requestPermission({ mode: 'readwrite' });
}

export function browserFolder(root: DirectoryHandle): SendFolder {
  // Where each listed file lives, so read/remove reach it without walking the tree again.
  let places = new Map<string, { dir: FileSystemDirectoryHandle; name: string; handle: FileSystemFileHandle }>();
  return {
    async list() {
      const next = new Map<string, { dir: FileSystemDirectoryHandle; name: string; handle: FileSystemFileHandle }>();
      const entries: FolderEntry[] = [];
      const walk = async (dir: DirectoryHandle, prefix: string, depth: number) => {
        for await (const handle of dir.values()) {
          if (watchFolderMarks.has(handle.name)) throw new Error(WRONG_FOLDER);
          if (/^[.~$]/.test(handle.name)) continue;
          if (handle.kind === 'directory') {
            if (depth < maxDepth) await walk(handle as unknown as DirectoryHandle, `${prefix}${handle.name}/`, depth + 1);
            continue;
          }
          if (!isSendable(handle.name)) continue;
          let file: File;
          try {
            file = await (handle as FileSystemFileHandle).getFile();
          } catch {
            continue; // removed or held exclusively right now: seen on a later look
          }
          const path = prefix + handle.name;
          next.set(path, { dir, name: handle.name, handle: handle as FileSystemFileHandle });
          entries.push({ path, name: handle.name, size: file.size, lastModified: file.lastModified });
        }
      };
      await walk(root, '', 0);
      places = next;
      return entries;
    },
    async read(path) {
      const place = places.get(path);
      if (!place) throw new Error('The shot is no longer in the folder.');
      // Read in full first: a file that changes or is locked fails here, not halfway through the upload.
      const file = await place.handle.getFile();
      return new Blob([await file.arrayBuffer()], { type: file.type || 'application/octet-stream' });
    },
    async remove(path) {
      const place = places.get(path);
      if (!place) return;
      await place.dir.removeEntry(place.name);
      places.delete(path);
    },
  };
}

// --- The remembered folder (IndexedDB, this browser only) ----------------------------------------

const dbName = 'studioflow-auto-send';
const storeName = 'folders';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function savedFolder(): Promise<DirectoryHandle | null> {
  try { return (await withStore('readonly', (store) => store.get('folder'))) as DirectoryHandle ?? null; } catch { return null; }
}

export async function rememberFolder(handle: DirectoryHandle | null) {
  try {
    await withStore<unknown>('readwrite', (store) => (handle ? store.put(handle, 'folder') : store.delete('folder')) as IDBRequest<unknown>);
  } catch { /* remembered for this visit only */ }
}

export type { DirectoryHandle };
