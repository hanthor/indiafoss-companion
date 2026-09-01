// Patch the generated service worker so the SPA shell is in the precache.
//
// vite-plugin-pwa globs .svelte-kit/output/client, which never contains the
// adapter-static fallback page, and `/index.html` is a 404 on static hosts
// that serve the SPA at the base path. So we precache the base path itself
// (e.g. `/` or `/indiafoss-app/`) with a content-hash revision and point the
// navigation fallback at it. Without this, offline navigations fail (§34, §52).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'build');
const swPath = join(root, 'sw.js');
const shellPath = join(root, 'index.html');

const sw = readFileSync(swPath, 'utf8');
const shell = readFileSync(shellPath, 'utf8');
const revision = createHash('sha256').update(shell).digest('hex').slice(0, 8);

// The fallback URL must be the deployed base path itself. For GitHub Pages
// project sites this is /<repository>/; for root hosting it is /. The
// generated handler may still mention index.html because adapter-static runs
// after the PWA plugin.
const bound = sw.match(/createHandlerBoundToURL\("([^"]+)"\)/);
if (!bound) {
  console.error('sw.js: createHandlerBoundToURL not found — aborting patch');
  process.exit(1);
}
const configuredBase = (process.env.SVELTE_BASE ?? '').replace(/\/+$/, '');
const shellRoute = configuredBase ? `${configuredBase}/` : '/';
const entry = `{url:"${shellRoute}",revision:"${revision}"}`;

if (sw.includes(`url:"${shellRoute}"`)) {
  console.log(`sw.js: shell already precached at ${shellRoute}`);
  process.exit(0);
}

const patchedSw = sw.replace(bound[0], `createHandlerBoundToURL("${shellRoute}")`);
const marker = 'precacheAndRoute([';
const idx = patchedSw.indexOf(marker);
if (idx === -1) {
  console.error('sw.js: precacheAndRoute marker not found — aborting patch');
  process.exit(1);
}
const insertAt = idx + marker.length;
const result = patchedSw.slice(0, insertAt) + entry + ',' + patchedSw.slice(insertAt);
writeFileSync(swPath, result);
console.log(`sw.js: precached shell at ${shellRoute} (rev ${revision})`);
