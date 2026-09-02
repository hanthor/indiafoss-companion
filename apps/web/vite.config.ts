import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

/** Base path for subdirectory hosting; must match svelte.config.js. */
const base = process.env.SVELTE_BASE ?? '';

export default defineConfig({
  optimizeDeps: {
    // The crypto WASM glue resolves its .wasm via import.meta.url; keep it out of the pre-bundler.
    exclude: ['@matrix-org/matrix-sdk-crypto-wasm'],
  },
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      base: base || '/',
      injectRegister: false,
      kit: {
        // SPA mode: adapter-static fallback is build/index.html.
        adapterFallback: 'index.html',
      },
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
      ],
      manifest: {
        name: 'IndiaFOSS Companion',
        short_name: 'IndiaFOSS',
        description: 'Offline-first companion for the IndiaFOSS conference',
        theme_color: '#18222a',
        background_color: '#18222a',
        display: 'standalone',
        start_url: base || '/',
        scope: base || '/',
        // A shared friend link, Matrix link or pasted card lands in the scan preview.
        share_target: {
          action: `${base || ''}/scan`,
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,json,woff2}'],
        // The 7.8 MB E2EE WASM is fetched on first sign-in and then kept for offline use.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: { cacheName: 'matrix-crypto-wasm', expiration: { maxEntries: 2 } },
          },
        ],
      },
    }),
  ],
});
