/**
 * Auto-send: the Photo Floor page sends each finished shot from a folder on this laptop (the
 * folder EOS Utility saves into) to the camera's folder on the StudioFlow server, which files it
 * into the linked client's folder. This file holds the rules, with no browser APIs, so they can be
 * tested on their own (scripts/test-auto-send.mjs).
 *
 * Safety rules (the same as the Photo Sender, scripts/photo-sender/photo-sender.ps1):
 * - A shot is sent only once it has stopped changing (same size and time on two looks, and older
 *   than `settleMs`), so a file EOS is still writing is never sent half done. It is read in full
 *   before the upload starts, so a file that can't be read just waits.
 * - Each shot has an upload id (device, path, size, time). A retry of a shot that already arrived
 *   is answered "already" by the server and is not saved twice.
 * - The laptop copy is deleted only after the server has the whole file. If it can't be deleted
 *   (EOS or a preview still has it open), the shot is remembered as sent: it is never sent again,
 *   only deleted later, and it does not hold up the shots behind it.
 * - Shots wait on the laptop while no client is linked, and shots taken before the client was
 *   linked are held until someone sends them on purpose (they may belong to the previous client).
 * - A shot the server refuses (not a photo, too large) is set aside, so it doesn't block the rest.
 *   No answer, a refused login or a camera turned off stops the round; it is tried again later.
 */
import { tagOf, tagged, untagged } from '../shotTag';

export interface FolderEntry {
  /** Path inside the chosen folder ("IMG_0001.JPG", "100CANON/IMG_0002.CR3"). */
  path: string;
  name: string;
  size: number;
  /** File time, ms (this laptop's clock). */
  lastModified: number;
}

export interface SendFolder {
  list(): Promise<FolderEntry[]>;
  /** The whole file. Throws while another program is still writing it. */
  read(path: string): Promise<Blob>;
  /** Throws while another program has the file open. */
  remove(path: string): Promise<void>;
}

/** An upload the server answered with an error (status 0: no answer at all). */
export class UploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type Upload = (name: string, body: Blob, uploadId: string) => Promise<{ status: 'saved' | 'already'; name: string }>;

export type Phase = 'sending' | 'idle' | 'no-client' | 'offline' | 'refused' | 'paused';

export interface EngineState {
  phase: Phase;
  /** Shots still to send (being written, waiting for the server, or no client linked). */
  waiting: number;
  /** Shots taken before the linked client was linked: sent only through sendHeld(). */
  held: number;
  /** Sent, but the laptop copy is still open in another program; deleted later. */
  stuck: number;
  /** Shots the server refused (left on the laptop). */
  rejected: { name: string; reason: string }[];
  sent: number;
  lastSentName: string;
  lastSentAt: number | null;
  error: string;
}

export interface EngineOptions {
  folder: SendFolder;
  upload: Upload;
  /** The shot type a photo gets from the time it was taken ('' = none). */
  typeAt: (time: number) => string;
  /** When the current client was linked (this laptop's clock), or null when none is. */
  linkedSince: () => number | null;
  /** Part of every upload id, so two laptops never share one. */
  deviceId: string;
  now?: () => number;
  settleMs?: number;
}

const photoFile = /\.(jpe?g|png|webp|gif|avif)$/i;
const rawFile = /\.(3fr|arw|cr2|cr3|crw|dng|erf|iiq|kdc|mef|mos|nef|nrw|orf|pef|raf|rw2|rwl|sr2|srf|srw|x3f)$/i;
/** A shot this much older than the link is still the linked client's (clock rounding, slow writes). */
export const LINK_GRACE_MS = 5_000;

export const isPhoto = (name: string) => photoFile.test(name);
export const isSendable = (name: string) => !/^[.~$]/.test(name) && (photoFile.test(name) || rawFile.test(name));

/** A short stable hash (two FNV-1a passes), as hex. */
function hash(text: string) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code ^ (a >>> 7), 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function uploadId(deviceId: string, entry: FolderEntry) {
  return `b-${hash([deviceId, entry.path.toLowerCase(), entry.size, entry.lastModified].join('|'))}-${entry.size}`;
}

/** The name a shot is sent under: a photo gets the type it was taken with, unless it has one. */
export function sendName(entry: FolderEntry, typeAt: (time: number) => string) {
  if (!isPhoto(entry.name)) return untagged(entry.name);
  return tagOf(entry.name) ? entry.name : tagged(entry.name, typeAt(entry.lastModified));
}

const initial: EngineState = {
  phase: 'idle', waiting: 0, held: 0, stuck: 0, rejected: [], sent: 0, lastSentName: '', lastSentAt: null, error: '',
};

export function createEngine(options: EngineOptions) {
  const now = options.now ?? Date.now;
  const settleMs = options.settleMs ?? 2_000;
  const seen = new Map<string, { size: number; lastModified: number }>();
  const delivered = new Map<string, string>();
  const rejected = new Map<string, { id: string; name: string; reason: string }>();
  let heldReleasedFor: number | null = null;
  let running: Promise<EngineState> | null = null;
  let state: EngineState = initial;

  async function pass(flush: boolean): Promise<EngineState> {
    let entries: FolderEntry[];
    try {
      entries = (await options.folder.list()).filter((entry) => isSendable(entry.name));
    } catch (error) {
      state = { ...state, phase: 'paused', error: `The folder can't be read: ${error instanceof Error ? error.message : String(error)}` };
      return state;
    }
    entries.sort((a, b) => a.lastModified - b.lastModified || (a.path < b.path ? -1 : Number(a.path > b.path)));
    const present = new Set(entries.map((entry) => entry.path));
    for (const map of [seen, delivered, rejected]) {
      for (const path of [...map.keys()]) if (!present.has(path)) map.delete(path);
    }

    const linked = options.linkedSince();
    let waiting = 0;
    let held = 0;
    let stuck = 0;
    let stop: UploadError | null = null;
    let { sent, lastSentName, lastSentAt } = state;
    for (const entry of entries) {
      const id = uploadId(options.deviceId, entry);
      if (delivered.has(entry.path)) {
        if (delivered.get(entry.path) === id) {
          try {
            await options.folder.remove(entry.path);
            delivered.delete(entry.path);
          } catch {
            stuck++;
          }
          continue;
        }
        // A new shot under the same name: send it like any other.
        delivered.delete(entry.path);
      }
      if (rejected.get(entry.path)?.id === id) continue;
      rejected.delete(entry.path);
      if (linked === null) { waiting++; continue; }
      if (entry.lastModified < linked - LINK_GRACE_MS && heldReleasedFor !== linked) { held++; continue; }
      if (stop) { waiting++; continue; }

      const before = seen.get(entry.path);
      seen.set(entry.path, { size: entry.size, lastModified: entry.lastModified });
      const unchanged = before?.size === entry.size && before.lastModified === entry.lastModified;
      if (entry.size <= 0 || !unchanged || (!flush && now() - entry.lastModified < settleMs)) { waiting++; continue; }

      let body: Blob;
      try {
        body = await options.folder.read(entry.path);
      } catch {
        // Still being written (or just removed): look again next time.
        waiting++;
        continue;
      }
      if (body.size !== entry.size) { waiting++; continue; }

      let reply: Awaited<ReturnType<Upload>>;
      try {
        reply = await options.upload(sendName(entry, options.typeAt), body, id);
        if (reply?.status !== 'saved' && reply?.status !== 'already') throw new UploadError('StudioFlow did not confirm the upload.', 502);
      } catch (error) {
        const failure = error instanceof UploadError ? error : new UploadError(error instanceof Error ? error.message : String(error), 0);
        if (failure.status === 400 || failure.status === 413) {
          rejected.set(entry.path, { id, name: entry.name, reason: failure.message });
          continue;
        }
        waiting++;
        stop = failure;
        continue;
      }
      seen.delete(entry.path);
      sent++;
      lastSentName = entry.name;
      lastSentAt = now();
      try {
        await options.folder.remove(entry.path);
      } catch {
        delivered.set(entry.path, id);
        stuck++;
      }
    }

    let phase: Phase = linked === null ? 'no-client' : waiting ? 'sending' : 'idle';
    let error = '';
    if (stop) {
      phase = stop.status === 0 ? 'offline' : stop.status === 401 || stop.status === 403 ? 'refused' : 'paused';
      error = stop.status === 0 ? "StudioFlow can't be reached. Shots wait on this laptop." : stop.message;
    }
    state = {
      phase, waiting, held, stuck, sent, lastSentName, lastSentAt, error,
      rejected: [...rejected.values()].map(({ name, reason }) => ({ name, reason })),
    };
    return state;
  }

  /** One look at the folder. Rounds never overlap: a second call waits for the running one. */
  function round(flush = false): Promise<EngineState> {
    if (running) return running;
    running = pass(flush).finally(() => { running = null; });
    return running;
  }

  return {
    round,
    state: () => state,
    /** Sends the shots taken before the current client was linked, too. */
    sendHeld() {
      heldReleasedFor = options.linkedSince();
    },
    /**
     * Sends every finished shot now (before the camera changes client). Resolves when none is
     * left to send; throws when they can't all go within `timeoutMs`.
     */
    async flush(timeoutMs = 15_000) {
      if (options.linkedSince() === null) return state;
      const deadline = now() + timeoutMs;
      for (;;) {
        if (running) await running;
        const result = await round(true);
        if (!result.waiting) return result;
        if (result.phase === 'offline' || result.phase === 'refused' || result.phase === 'paused' || now() >= deadline) {
          throw new Error(`${result.waiting} shot${result.waiting === 1 ? ' is' : 's are'} still on this laptop`
            + (result.error ? ` (${result.error})` : '') + '. Wait a moment and try again, or turn off Auto-send.');
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    },
  };
}

export type AutoSendEngine = ReturnType<typeof createEngine>;
