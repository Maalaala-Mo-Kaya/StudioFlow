import PocketBase, { BaseAuthStore } from 'pocketbase';

/**
 * Two ports, kept apart by the router: the client port (8090) is the only one the guest Wi-Fi
 * can reach, served by scripts/client-gateway.cjs (kiosk build + the few calls the kiosk makes);
 * the staff port (8091) is PocketBase itself (every station, the /_/ dashboard).
 */
export const CLIENT_PORT = import.meta.env.VITE_CLIENT_PORT || '8090';
export const STAFF_PORT = import.meta.env.VITE_STAFF_PORT || '8091';

/** This build's surface: `kiosk` (served on the client port) or `staff`. Set by vite.config.ts. */
export const IS_KIOSK_BUILD = import.meta.env.VITE_SURFACE === 'kiosk';

const getBaseUrl = () => {
  const envUrl = IS_KIOSK_BUILD ? import.meta.env.VITE_CLIENT_URL : import.meta.env.VITE_PB_URL;
  if (envUrl) return envUrl;

  const port = IS_KIOSK_BUILD ? CLIENT_PORT : STAFF_PORT;
  if (typeof window === 'undefined') return `http://127.0.0.1:${port}`;
  // Each port serves its own build, so production talks to its own origin
  // (the gateway for the kiosk, PocketBase for staff), including behind HTTPS tunnels.
  if (!import.meta.env.DEV) {
    return window.location.origin;
  }
  return `${window.location.protocol}//${window.location.hostname}:${port}`;
};

/**
 * An address on the client port, for links handed to clients (QR codes): guest devices can't
 * reach the staff port.
 */
export function clientPortUrl(path: string) {
  const base = import.meta.env.VITE_CLIENT_URL
    || (typeof window === 'undefined' ? `http://127.0.0.1:${CLIENT_PORT}` : `${window.location.protocol}//${window.location.hostname}:${CLIENT_PORT}`);
  return base.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

export const pb = new PocketBase(getBaseUrl());
// Globally disable PocketBase JS SDK auto-cancellation so concurrent queries
// from navbar counters, cashier, and photographer queues never abort each other.
pb.autoCancellation(false);

/**
 * Job orders without a number yet are stored with an empty job_order_no and queue_number 0; the
 * screens expect null for "none" (types/index.ts). This used to be done by a server hook on every
 * listed record, which made a list of 2,000 job orders about four times slower; the app now does it
 * here, on every response (records, lists and their expand).
 */
function absentNumbersAsNull(value: unknown, depth = 0): void {
  if (!value || typeof value !== 'object' || depth > 6) return;
  if (Array.isArray(value)) {
    for (const item of value) absentNumbersAsNull(item, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  if (record.job_order_no === '') record.job_order_no = null;
  if (record.queue_number === 0 && 'job_order_no' in record) record.queue_number = null;
  for (const key of ['items', 'expand']) if (record[key]) absentNumbersAsNull(record[key], depth + 1);
  if (record.expand && typeof record.expand === 'object') {
    for (const nested of Object.values(record.expand as Record<string, unknown>)) absentNumbersAsNull(nested, depth + 1);
  }
}
pb.afterSend = (_response, data) => {
  absentNumbersAsNull(data);
  return data;
};

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

/**
 * The public kiosk's own client: its auth store lives in memory and is never signed in, so a
 * registration from the kiosk page is always sent as a client (a guest), even when a staff member
 * is signed in on the same browser.
 */
export const kioskPb = new PocketBase(getBaseUrl(), new BaseAuthStore());
kioskPb.autoCancellation(false);
kioskPb.afterSend = (_response, data) => {
  absentNumbersAsNull(data);
  return data;
};
