import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { fileURLToPath } from 'node:url'

// `npm run dev:phone` (mode "phone") serves over HTTPS on your LAN so a real
// phone can use location, notifications, and SMS-code autofill, browsers
// block those on plain http:// except for localhost.
export default defineConfig(({ mode }) => ({
  plugins: [
    ...(mode === 'phone' ? [basicSsl()] : []),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'splash/*.png'],
      manifest: {
        id: '/',
        name: 'Tether',
        short_name: 'Tether',
        description: 'Location sharing that watches out for your group on a night out.',
        theme_color: '#0f0e11',
        background_color: '#0f0e11', // launch / splash background
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['lifestyle', 'social', 'utilities'],
        icons: [
          ...[48, 72, 96, 128, 144, 152, 192, 256, 384, 512].map((n) => ({
            src: `/icons/icon-${n}.png`,
            sizes: `${n}x${n}`,
            type: 'image/png',
            purpose: 'any',
          })),
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Web push handlers (public/push-sw.js).
        importScripts: ['push-sw.js'],
      },
      // Dev SW off: it caches aggressively during development, and workbox's
      // generator breaks on paths containing an apostrophe (e.g. "'26 Projects").
      // `npm run build` in such a path has the same issue, build from a path
      // without an apostrophe (Vercel's build env is fine).
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: mode === 'phone' ? true : undefined,
  },
}))
