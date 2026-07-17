import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Vite configuration.
// - PWA: standalone, portrait-primary, offline-capable.
// - Save data lives in IndexedDB and is intentionally NOT routed through the
//   service worker cache (see CLAUDE.md / docs/TECH_DESIGN.md).
// On GitHub Pages this is a project site served under /<repo>/, so the build
// needs an absolute base. The deploy workflow sets VITE_BASE=/chhhhhhho/.
// Locally (dev / preview) we use './' so it works from the root.
const base = process.env.VITE_BASE ?? './';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registration and update checks live in core/pwa.ts
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Pixel Action RPG',
        short_name: 'PixelRPG',
        description: 'Mobile-first portrait action RPG',
        lang: 'ja',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#0e0f1a',
        theme_color: '#0e0f1a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Phaser and the authored game data ship as one bundle. Keep it
        // available offline while leaving enough room for future chapters.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Never precache index.html. GitHub Pages gives HTML a ten-minute HTTP
        // cache, and putting that response behind another cache can pin an old
        // hashed bundle on iOS even after a successful deployment.
        globPatterns: ['**/*.{js,css,woff2}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-pages-v2',
              networkTimeoutSeconds: 5,
              fetchOptions: { cache: 'no-store' },
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-images-v2',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 180, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'audio',
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-audio-v2',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 48, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
});
