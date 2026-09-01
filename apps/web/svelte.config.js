import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Base path for subdirectory hosting (e.g. GitHub Pages project sites). */
const base = process.env.SVELTE_BASE ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html',
      strict: false,
    }),
    ...(base ? { paths: { base } } : {}),
  },
};

export default config;
