import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // SvelteKit's `$lib` alias, so a module that imports a sibling through it
    // can be unit-tested without the SvelteKit plugin.
    alias: { $lib: fileURLToPath(new URL('./src/lib', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    // Generate .svelte-kit/tsconfig.json before tests run.
    // Without this setup file, tests fail with "Failed to load tsconfig '.svelte-kit/tsconfig.json': Tsconfig not found".
    // See #846.
    setupFiles: ['./vitest.setup.ts'],
  },
});
