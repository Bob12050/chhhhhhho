import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Vite configuration.
// - PWA: standalone, portrait-primary, offline-capable (precache app shell).
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
      registerType: 'prompt',
      injectRegister: null, // we register/update manually so combat is never auto-reloaded
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
        globPatterns: ['**/*.{js,css,html,png,webp,woff2,json,wav,ogg,mp3}'],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
});
