import { useSyncExternalStore } from 'react';
import { getRealtimeClient, pb } from '../db/pocketbase';

const subscribeToAuth = (notify: () => void) => pb.authStore.onChange(notify);

export function useRealtimeClient() {
  return useSyncExternalStore(subscribeToAuth, getRealtimeClient);
}

/**
 * Turns a burst of live events into one reload. One payment, for example, sends several events (the
 * payment, the job order's new balance, its queue number): without this, a screen that reloads a
 * whole list would do it once per event. The reload runs `wait` ms after the last event (and at most
 * `maxWait` ms after the first), never while the previous one is still running; an event during a
 * reload schedules one more afterwards. `cancel` stops a pending one (on unmount).
 */
export function coalesce(run: () => unknown, wait = 300, maxWait = 1_500) {
  let timer: number | undefined;
  let firstAt = 0;
  let running = false;
  let again = false;
  const fire = async () => {
    timer = undefined;
    firstAt = 0;
    if (running) { again = true; return; }
    running = true;
    try {
      await run();
    } finally {
      running = false;
      if (again) { again = false; schedule(); }
    }
  };
  const schedule = () => {
    const now = Date.now();
    if (!firstAt) firstAt = now;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void fire(), Math.max(0, Math.min(wait, firstAt + maxWait - now)));
  };
  return Object.assign(schedule, { cancel: () => { window.clearTimeout(timer); timer = undefined; firstAt = 0; } });
}

export function mountSubscription<T>(
  subscribe: (listener: (event: T) => void) => Promise<() => Promise<void>>,
  listener: (event: T) => void,
) {
  let mounted = true;
  const subscription = subscribe((event) => { if (mounted) listener(event); });
  void subscription.catch((error) => { if (mounted) console.error('Could not subscribe to realtime updates:', error); });
  return () => {
    mounted = false;
    void subscription.then((stop) => stop()).catch(() => { /* the subscription has already failed or closed */ });
  };
}
