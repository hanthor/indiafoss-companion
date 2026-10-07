import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Vitest setup: ensure SvelteKit's .svelte-kit/tsconfig.json is generated before tests run.
 *
 * Tests may import modules that depend on SvelteKit's generated types and configs,
 * which are created in the .svelte-kit/ directory. This setup runs `svelte-kit sync`
 * to generate these files before Vitest loads any test modules.
 */

const svelteKitDir = resolve(import.meta.dirname, '.svelte-kit');

if (!existsSync(svelteKitDir)) {
  try {
    execSync('npx svelte-kit sync', {
      cwd: import.meta.dirname,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    console.warn('⚠ svelte-kit sync failed; TypeScript config may not resolve correctly:', error);
  }
}
