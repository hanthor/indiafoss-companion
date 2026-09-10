// Verify the generated registration, not just the source config: project-site
// builds must fetch /<project>/sw.js, never /<project>sw.js.
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const build = new URL('../build/', import.meta.url);
const base = (process.env.SVELTE_BASE ?? '').replace(/\/+$/, '');
const scope = `${base}/`;
const worker = `${scope}sw.js`;
const files = readdirSync(build, { recursive: true }).filter((file) => file.endsWith('.js'));
assert(
  files.some((file) => readFileSync(new URL(file, build), 'utf8').includes(worker)),
  `No generated registration for ${worker}`,
);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', build), 'utf8'));
assert.equal(manifest.scope, scope);
assert.equal(manifest.start_url, scope);
const sw = readFileSync(new URL('sw.js', build), 'utf8');
assert(
  !/url:["'][^"']*events\/[^/"']+\/manifest\.json["']/.test(sw),
  'Event manifests must not be precached: update checks need a network response',
);
console.log(`PWA registration and manifest use ${scope}`);
