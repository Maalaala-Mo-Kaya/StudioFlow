import { pb } from '../../../db/pocketbase';

export type QrKind = 'direct' | 'protected' | 'wifi';
export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export const wifiSecurityLabels: Record<WifiSecurity, string> = {
  WPA: 'WPA / WPA2 / WPA3 Personal',
  WEP: 'WEP (legacy)',
  nopass: 'None / Open Network',
};

export const qrKindLabels: Record<QrKind, string> = {
  direct: 'Direct Link',
  protected: 'Password-Protected Link',
  wifi: 'Wi-Fi Connection',
};

export interface SavedQr {
  id: string;
  slug: string;
  kind: QrKind;
  name: string;
  created: string;
  destination: string;
  expiresOn: string;
  disabled: boolean;
  status: 'active' | 'disabled' | 'expired' | 'metadata' | 'ready';
  ssid: string;
  security: WifiSecurity | '';
  hiddenNetwork: boolean;
  hasWifiPassword: boolean;
}

type QrSettings = { kind: 'direct'; name: string; destination: string }
  | { kind: 'protected'; name: string; destination: string; password: string; confirmPassword: string; expiresOn: string }
  | { kind: 'wifi'; name: string; ssid: string; security: WifiSecurity; hiddenNetwork: boolean; wifiPassword?: string };

const api = '/api/studioflow/qr-codes';

export const listQrs = () => pb.send<SavedQr[]>(api, { method: 'GET' });

export const saveQr = (settings: QrSettings, id?: string) => pb.send<SavedQr>(
  id ? `${api}/${id}` : api, { method: id ? 'PATCH' : 'POST', body: settings },
);

export const setQrDisabled = (id: string, disabled: boolean) => pb.send<SavedQr>(
  `${api}/${id}`, { method: 'PATCH', body: { disabled } },
);

export const deleteQr = (id: string) => pb.send<void>(`${api}/${id}`, { method: 'DELETE' });

export const loadWifiPassword = (id: string) => pb.send<{ password: string }>(
  `${api}/${id}/wifi-password`, { method: 'POST' },
).then(({ password }) => password);

export const managedQrUrl = (slug: string) => pb.buildURL(`/q/${slug}`);

export function destinationUrl(input: string) {
  const raw = input.trim();
  let url: URL | undefined;
  try {
    url = new URL(raw);
  } catch {
    // Report the same validation message for the other invalid URL cases.
  }
  if (!url || !/^https?:\/\//i.test(raw) || /[\s\\]/u.test(raw) || url.username || url.password) {
    throw new Error('Enter a full HTTP or HTTPS URL without sign-in credentials.');
  }
  if (url.href.length > 1800) throw new Error('Enter a destination URL of 1,800 characters or fewer.');
  return url.href;
}

export function destinationHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

const bytes = (value: string) => new TextEncoder().encode(value).length;
// Control characters cannot be entered reliably by phone scanners.
// eslint-disable-next-line no-control-regex
const controls = /[\x00-\x1f\x7f]/u;

export function validateAccessPassword(password: string, confirmation: string, required: boolean) {
  if (!required && !password && !confirmation) return;
  if (!password.trim() || controls.test(password) || bytes(password) > 71) {
    throw new Error('Enter an access password of up to 71 bytes.');
  }
  if (password !== confirmation) throw new Error('The access passwords do not match.');
}

function escapeWifi(value: string) {
  return value.replace(/[\\;,":]/g, '\\$&');
}

export function wifiPayload({ ssid, security, hiddenNetwork }: Extract<QrSettings, { kind: 'wifi' }>, password: string) {
  if (!ssid || bytes(ssid) > 32 || controls.test(ssid)) {
    throw new Error('Enter a Wi-Fi network name of up to 32 bytes.');
  }
  if (security !== 'nopass' && (!password || controls.test(password) || bytes(password) > 128)) {
    throw new Error('Enter the Wi-Fi password, up to 128 bytes.');
  }
  const secret = security === 'nopass' ? '' : `P:${escapeWifi(password)};`;
  const hidden = hiddenNetwork ? 'H:true;' : '';
  return `WIFI:T:${security};S:${escapeWifi(ssid)};${secret}${hidden};`;
}

export function qrTitle(kind: QrKind, name: string) {
  return name.trim() || qrKindLabels[kind];
}

export function qrError(error: unknown, fallback: string) {
  const response = (error as { response?: { message?: string } } | null)?.response;
  return response?.message || fallback;
}
