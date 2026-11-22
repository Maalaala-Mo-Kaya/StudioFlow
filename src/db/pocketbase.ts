import PocketBase, { BaseAuthStore } from 'pocketbase';

const getBaseUrl = () => {
  const envUrl = import.meta.env?.VITE_PB_URL || import.meta.env?.PB_URL;
  if (envUrl) return envUrl;

  if (typeof window === 'undefined') return 'http://127.0.0.1:8090';
  // If Vite dev server or different port, point to PocketBase backend port 8090
  if (window.location.port === '8090') {
    return window.location.origin;
  }
  return `${window.location.protocol}//${window.location.hostname}:8090`;
};

export const pb = new PocketBase(getBaseUrl());
// Globally disable PocketBase JS SDK auto-cancellation so concurrent queries
// from navbar counters, cashier, and photographer queues never abort each other.
pb.autoCancellation(false);

function createRealtimeClient(token: string) {
  const auth = new BaseAuthStore();
  auth.save(token);
  return new PocketBase(pb.baseURL, auth);
}

// PocketBase binds an SSE connection to the token from its first subscription POST.
// Keep that token fixed while the old connection and its pending requests wind down.
let realtimeToken = pb.authStore.token;
let realtimeClient = createRealtimeClient(realtimeToken);

export const getRealtimeClient = () => realtimeClient;

function stopRealtime() {
  void realtimeClient.realtime.unsubscribe().catch(console.error);
}

pb.authStore.onChange((token) => {
  if (token === realtimeToken) return;
  stopRealtime();
  realtimeToken = token;
  realtimeClient = createRealtimeClient(token);
});

export function clearStudioAuth() {
  stopRealtime();
  pb.authStore.clear();
}
