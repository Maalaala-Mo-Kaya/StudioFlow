/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `kiosk` for the client-port build, `staff` otherwise (set by vite.config.ts from the mode). */
  readonly VITE_SURFACE: 'kiosk' | 'staff';
  /** Client port (guest Wi-Fi, scripts/client-gateway.cjs). Default 8090. */
  readonly VITE_CLIENT_PORT?: string;
  /** Staff port (PocketBase). Default 8091. */
  readonly VITE_STAFF_PORT?: string;
  /** Full client-port address, when it isn't <this host>:<VITE_CLIENT_PORT>. */
  readonly VITE_CLIENT_URL?: string;
  /** Full PocketBase (staff) address, when it isn't the page origin / <this host>:<VITE_STAFF_PORT>. */
  readonly VITE_PB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
