import { useCallback, useEffect, useRef, useState } from 'react';
import { pb } from '../../../db/pocketbase';
import { workflowApi } from '../../../hooks/useWorkflowData';
import type { CameraStatus } from '../cameraApi';
import { shotTypeAt } from '../shotTypes';
import { createEngine, UploadError, type AutoSendEngine, type EngineState } from './engine';
import {
  browserFolder, folderAccessSupported, folderPermission, isCameraFolder, pickFolder, rememberFolder, savedFolder, WRONG_FOLDER,
  type DirectoryHandle,
} from './browserFolder';
import { registerFlush, takeLinkStart } from './registry';

export type AutoSendStatus =
  | 'loading'
  /** The page is plain http: the browser hides folder access until the setting in the panel is on. */
  | 'insecure'
  /** Not Chrome or Edge. */
  | 'unsupported'
  | 'off'
  /** A folder is remembered, but the browser wants a click before the page may read it again. */
  | 'needs-permission'
  | 'running'
  /** Another tab of this browser is already sending. */
  | 'other-tab';

const prefKey = 'studioflow-auto-send';
const linksKey = 'studioflow-auto-send-links';
const deviceKey = 'studioflow-device-id';
const roundMs = 1_500;
const heartbeatMs = 5_000;
const uploadTimeoutMs = 180_000;

function readPref() {
  try { return localStorage.getItem(prefKey) === 'on'; } catch { return false; }
}
function writePref(on: boolean) {
  try { localStorage.setItem(prefKey, on ? 'on' : 'off'); } catch { /* per-device convenience only */ }
}
function deviceId() {
  try {
    let id = localStorage.getItem(deviceKey);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(deviceKey, id);
    }
    return id;
  } catch {
    return 'browser';
  }
}

/** When each camera session was linked, on this laptop's clock (kept across page reloads). */
function linkTime(key: string, stationId: string) {
  let links: Record<string, number> = {};
  try { links = JSON.parse(localStorage.getItem(linksKey) || '{}') || {}; } catch { /* start over */ }
  if (typeof links[key] === 'number') return links[key];
  const at = takeLinkStart(stationId) ?? Date.now();
  links[key] = at;
  const recent = Object.entries(links).sort(([, a], [, b]) => b - a).slice(0, 20);
  try { localStorage.setItem(linksKey, JSON.stringify(Object.fromEntries(recent))); } catch { /* this visit only */ }
  return at;
}

async function uploadShot(stationId: string, name: string, body: Blob, uploadId: string) {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), uploadTimeoutMs);
  let response: Response;
  try {
    response = await fetch(pb.buildURL(`${workflowApi}/camera-sender/${stationId}/upload?${new URLSearchParams({ name })}`), {
      method: 'POST', body, signal: abort.signal,
      headers: { Authorization: pb.authStore.token, 'Content-Type': 'application/octet-stream', 'X-Upload-Id': uploadId },
    });
  } catch (error) {
    throw new UploadError(error instanceof Error ? error.message : String(error), 0);
  } finally {
    window.clearTimeout(timer);
  }
  const reply = await response.json().catch(() => ({})) as { status?: 'saved' | 'already'; name?: string; message?: string };
  if (!response.ok) throw new UploadError(reply.message || `StudioFlow answered ${response.status}.`, response.status);
  return { status: reply.status as 'saved' | 'already', name: reply.name || name };
}

/**
 * Auto-send on this device: while the Photo Floor is open, sends the finished shots in the chosen
 * laptop folder to this device's camera on the server (engine.ts holds the rules).
 */
export function useAutoSend(camera: CameraStatus | null) {
  const [status, setStatus] = useState<AutoSendStatus>('loading');
  const [folderName, setFolderName] = useState('');
  const [engineState, setEngineState] = useState<EngineState>();
  const [problem, setProblem] = useState('');
  const handle = useRef<DirectoryHandle | null>(null);
  const engine = useRef<AutoSendEngine | null>(null);
  const releaseLock = useRef<(() => void) | null>(null);
  const station = useRef(camera);
  const linkedSince = useRef<number | null>(null);
  useEffect(() => { station.current = camera; }, [camera]);

  // When the current client was linked (null: no client). Shots from before that are held.
  const linkKey = camera?.enabled && camera.client ? `${camera.id}|${camera.client.id}|${camera.sessionStarted}` : '';
  useEffect(() => {
    linkedSince.current = linkKey && camera ? linkTime(linkKey, camera.id) : null;
  }, [linkKey, camera]);

  const stopEngine = useCallback(() => {
    engine.current = null;
    releaseLock.current?.();
    releaseLock.current = null;
  }, []);

  const startEngine = useCallback(async (folder: DirectoryHandle) => {
    stopEngine();
    // One sending tab per browser: two would read the same folder.
    const locks = navigator.locks;
    if (locks) {
      const acquired = await new Promise<boolean>((resolve) => {
        void locks.request('studioflow-auto-send', { ifAvailable: true }, (lock) => {
          if (!lock) { resolve(false); return undefined; }
          resolve(true);
          return new Promise<void>((release) => { releaseLock.current = release; });
        });
      });
      if (!acquired) { setStatus('other-tab'); return; }
    }
    handle.current = folder;
    setFolderName(folder.name);
    engine.current = createEngine({
      folder: browserFolder(folder),
      upload: (name, body, id) => {
        const current = station.current;
        if (!current) return Promise.reject(new UploadError('Choose this device’s camera first.', 409));
        return uploadShot(current.id, name, body, id);
      },
      typeAt: shotTypeAt,
      linkedSince: () => linkedSince.current,
      deviceId: deviceId(),
    });
    setProblem('');
    setStatus('running');
  }, [stopEngine]);

  // A folder remembered from last time starts again on its own when the browser still allows it.
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!window.isSecureContext) { setStatus('insecure'); return; }
      if (!folderAccessSupported()) { setStatus('unsupported'); return; }
      const saved = await savedFolder();
      if (!live) return;
      if (!saved) { setStatus('off'); return; }
      handle.current = saved;
      setFolderName(saved.name);
      if (!readPref()) { setStatus('off'); return; }
      try {
        if (await folderPermission(saved, false) === 'granted') await startEngine(saved);
        else if (live) setStatus('needs-permission');
      } catch {
        if (live) setStatus('needs-permission');
      }
    })();
    return () => { live = false; stopEngine(); };
  }, [startEngine, stopEngine]);

  // The rounds, and the heartbeat the Camera Auto-Import panel shows ("Auto-send online").
  const stationId = camera?.id;
  const enabled = !!camera?.enabled;
  useEffect(() => {
    if (status !== 'running' || !stationId || !enabled) return;
    let live = true;
    let lastBeat = 0;
    const tick = async () => {
      const current = engine.current;
      if (!current) return;
      const result = await current.round();
      if (!live) return;
      setEngineState(result);
      if (Date.now() - lastBeat < heartbeatMs) return;
      lastBeat = Date.now();
      const waiting = result.waiting + result.held + result.rejected.length;
      try {
        await pb.send(`${workflowApi}/camera-sender/${stationId}/status`, {
          method: 'POST', requestKey: null,
          body: {
            host: 'Photo Floor page', source: handle.current?.name || '', waiting, lastSentName: result.lastSentName,
            lastSentSecondsAgo: result.lastSentAt === null ? null : Math.round((Date.now() - result.lastSentAt) / 1000),
            error: result.error, via: 'browser',
          },
        });
      } catch { /* shown by the next round's upload */ }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), roundMs);
    const unregister = registerFlush(stationId, async (timeoutMs) => {
      const current = engine.current;
      if (!current) return;
      const result = await current.flush(timeoutMs);
      if (live) setEngineState(result);
    });
    return () => { live = false; window.clearInterval(timer); unregister(); };
  }, [status, stationId, enabled]);

  const choose = useCallback(async () => {
    try {
      const folder = await pickFolder();
      if (await folderPermission(folder, true) !== 'granted') {
        setProblem('The browser did not allow access to this folder.');
        return;
      }
      if (await isCameraFolder(folder)) {
        setProblem(WRONG_FOLDER);
        return;
      }
      await rememberFolder(folder);
      writePref(true);
      await startEngine(folder);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }, [startEngine]);

  const resume = useCallback(async () => {
    const folder = handle.current;
    if (!folder) { await choose(); return; }
    try {
      if (await folderPermission(folder, true) !== 'granted') {
        setProblem('The browser did not allow access to this folder. Choose it again.');
        return;
      }
      writePref(true);
      await startEngine(folder);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }, [choose, startEngine]);

  const stop = useCallback(() => {
    writePref(false);
    stopEngine();
    setEngineState(undefined);
    setStatus('off');
  }, [stopEngine]);

  const sendHeld = useCallback(() => {
    engine.current?.sendHeld();
  }, []);

  return { status, folderName, state: engineState, problem, choose, resume, stop, sendHeld };
}

export type AutoSend = ReturnType<typeof useAutoSend>;
