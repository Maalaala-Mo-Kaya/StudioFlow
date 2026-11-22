import { useSyncExternalStore } from 'react';
import { getRealtimeClient, pb } from '../db/pocketbase';

const subscribeToAuth = (notify: () => void) => pb.authStore.onChange(notify);

export function useRealtimeClient() {
  return useSyncExternalStore(subscribeToAuth, getRealtimeClient);
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
