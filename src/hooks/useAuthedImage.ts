import { useEffect, useState, type RefObject } from 'react';
import { pb } from '../db/pocketbase';

// Staff-only photos are fetched with the staff token and shown through object URLs. One download
// per photo is shared by everything that shows it (a gallery tile and the full-screen view), and
// the most recent ones stay ready, so opening a photo or moving to the next one is instant.
interface Entry { promise: Promise<string>; users: number; used: number; objectUrl?: string }
const entries = new Map<string, Entry>();
/** Photos kept ready after nothing shows them any more (about 3 MB each). */
const KEEP_IDLE = 24;

function acquire(url: string) {
  let entry = entries.get(url);
  if (!entry) {
    const created: Entry = {
      users: 0, used: Date.now(),
      promise: fetch(pb.buildURL(url), { headers: { Authorization: pb.authStore.token } })
        .then((response) => {
          if (!response.ok) throw new Error('Photo unavailable.');
          return response.blob();
        })
        .then((blob) => {
          created.objectUrl = URL.createObjectURL(blob);
          return created.objectUrl;
        }),
    };
    // A failed download is not kept: the next look tries again.
    created.promise.catch(() => { if (entries.get(url) === created) entries.delete(url); });
    entries.set(url, created);
    entry = created;
  }
  entry.users++;
  entry.used = Date.now();
  return entry;
}

function release(entry: Entry) {
  entry.users = Math.max(0, entry.users - 1);
  entry.used = Date.now();
  const idle = [...entries].filter(([, item]) => item.users === 0 && item.objectUrl).sort((a, b) => a[1].used - b[1].used);
  for (const [url, item] of idle.slice(0, Math.max(0, idle.length - KEEP_IDLE))) {
    URL.revokeObjectURL(item.objectUrl!);
    entries.delete(url);
  }
}

/** Starts downloading a photo now (e.g. the next one to review), so it shows at once later. */
export function prefetchAuthedImage(url: string) {
  const entry = acquire(url);
  void entry.promise.catch(() => {}).finally(() => release(entry));
}

// Loads a staff-only photo once its element scrolls near the screen.
export function useAuthedImage(url: string | null, ref: RefObject<Element | null>) {
  const [state, setState] = useState<{ url: string; objectUrl: string; failed: boolean }>();

  useEffect(() => {
    if (!url) return;
    let active = true;
    let entry: Entry | null = null;
    const observer = new IntersectionObserver(([seen]) => {
      if (!seen?.isIntersecting || entry) return;
      observer.disconnect();
      entry = acquire(url);
      entry.promise
        .then((objectUrl) => { if (active) setState({ url, objectUrl, failed: false }); })
        .catch(() => { if (active) setState({ url, objectUrl: '', failed: true }); });
    }, { rootMargin: '250px' });
    if (ref.current) observer.observe(ref.current);
    return () => {
      active = false;
      observer.disconnect();
      if (entry) release(entry);
    };
  }, [url, ref]);

  const current = state?.url === url ? state : undefined;
  return { src: current?.objectUrl ?? '', failed: current?.failed ?? false };
}
