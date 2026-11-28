import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Two builds from one source: the staff app (default mode -> dist/, published to pb_public/ and
// served by PocketBase on the staff port 8091) and the kiosk (`--mode kiosk` -> dist-kiosk/,
// published to pb_public_kiosk/ and served by scripts/client-gateway.cjs on the client port 8090).
export default defineConfig(({ mode }) => {
  const kiosk = mode === 'kiosk'
  return {
    plugins: [
      react(), tailwindcss(),
      babel({ presets: [reactCompilerPreset()] })
    ],
    define: {
      'import.meta.env.VITE_SURFACE': JSON.stringify(kiosk ? 'kiosk' : 'staff'),
    },
    build: {
      outDir: kiosk ? 'dist-kiosk' : 'dist',
    },
    server: {
      port: kiosk ? 5174 : 5173,
      strictPort: true,
    },
  }
})
