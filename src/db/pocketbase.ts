import PocketBase from 'pocketbase';

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