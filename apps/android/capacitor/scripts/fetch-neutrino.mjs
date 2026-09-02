// Fetch the Neutrino bindings .aar that neutrino-bindings.yml built from source
// and attached to a release, so building the P2P variant needs no credentials.
//
// Upstream publishes the same artifact to GitHub Packages, but GitHub Packages
// refuses anonymous Maven reads (401) even for a public repository, which would
// force every contributor to hold a personal access token. Release assets are
// served anonymously, so we build it ourselves and read it from there.
//
// Missing or unreachable is not an error: material3.mjs then patches the plain
// companion, exactly as it did when the token was absent.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const pin = JSON.parse(readFileSync(join(root, 'neutrino', 'version.json'), 'utf8'));
const libs = join(root, 'neutrino', 'libs');
const aar = join(libs, `neutrino-bindings-${pin.version}.aar`);

if (existsSync(aar)) {
  console.log(`neutrino: bindings ${pin.version} already present`);
  process.exit(0);
}

const repo = process.env.GITHUB_REPOSITORY ?? 'hanthor/indiafoss-companion';
const base = `https://github.com/${repo}/releases/download/neutrino-bindings-${pin.version}`;
const name = `neutrino-bindings-${pin.version}.aar`;

async function get(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

try {
  const [body, checksum] = await Promise.all([
    get(`${base}/${name}`),
    get(`${base}/${name}.sha256`).then((b) => b.toString('utf8')),
  ]);
  // The asset is a binary this build will compile into an APK; check it against
  // the checksum published beside it before trusting it.
  const expected = checksum.trim().split(/\s+/)[0];
  const actual = createHash('sha256').update(body).digest('hex');
  if (expected !== actual) {
    throw new Error(`checksum mismatch: expected ${expected}, got ${actual}`);
  }
  mkdirSync(libs, { recursive: true });
  writeFileSync(aar, body);
  console.log(`neutrino: fetched bindings ${pin.version} (${body.length} bytes, sha256 ok)`);
} catch (error) {
  console.log(`neutrino: bindings ${pin.version} unavailable (${error.message})`);
  console.log(
    'neutrino: building the plain companion — run the "Neutrino bindings" workflow to publish them',
  );
}
