import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

/** Base path for subdirectory hosting; must match svelte.config.js. */
const base = process.env.SVELTE_BASE ?? '';

export default defineConfig({
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
      },
    }),
  ],
});
