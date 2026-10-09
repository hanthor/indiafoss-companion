// Vitest setup: ensure SvelteKit's .svelte-kit/tsconfig.json is generated before tests run.
// This is called once before the test suite starts.

import { sync } from '@sveltejs/kit/vite';

// Generate .svelte-kit/tsconfig.json and other SvelteKit artifacts.
// Without this, tests fail with "Failed to load tsconfig '.svelte-kit/tsconfig.json': Tsconfig not found".
// See #846.
try {
  sync();
} catch (err) {
  console.warn('svelte-kit sync failed (this might be okay in some CI environments):', err);
}

export {};
