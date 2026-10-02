import { fileURLToPath } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    // Include SvelteKit plugin to generate .svelte-kit/ directory and resolve SvelteKit imports.
    // This is necessary for tests to load tsconfig and other SvelteKit artifacts.
    sveltekit(),
  ],
  resolve: {
    // SvelteKit's `$lib` alias, so a module that imports a sibling through it
    // can be unit-tested without additional config.
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
