// Sync normalized event bundles and venue assets from events/ into the web
// app's static assets so the PWA ships them precached and offline-ready.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const assets = [
  {
    src: join(root, 'events', 'indiafoss-2025', 'normalized', 'event-bundle.json'),
    dest: join(root, 'apps', 'web', 'static', 'events', 'indiafoss-2025', 'event-bundle.json'),
  },
  {
    src: join(root, 'events', 'synthetic', 'venue', 'venue.svg'),
    dest: join(root, 'apps', 'web', 'static', 'venues', 'synthetic', 'venue.svg'),
  },
  {
    src: join(root, 'events', 'synthetic', 'venue', 'venue.graph.json'),
    dest: join(root, 'apps', 'web', 'static', 'venues', 'synthetic', 'venue.graph.json'),
  },
  {
    src: join(root, 'events', 'synthetic', 'venue', 'venue.metadata.json'),
    dest: join(root, 'apps', 'web', 'static', 'venues', 'synthetic', 'venue.metadata.json'),
  },
  {
    src: join(root, 'events', 'indiafoss-2026', 'venue', 'venue.svg'),
    dest: join(root, 'apps', 'web', 'static', 'venues', 'indiafoss-2026', 'venue.svg'),
  },
  {
    src: join(root, 'events', 'indiafoss-2026', 'venue', 'venue.graph.json'),
    dest: join(root, 'apps', 'web', 'static', 'venues', 'indiafoss-2026', 'venue.graph.json'),
  },
  {
    src: join(root, 'events', 'indiafoss-2026', 'venue', 'venue.metadata.json'),
    dest: join(root, 'apps', 'web', 'static', 'venues', 'indiafoss-2026', 'venue.metadata.json'),
  },
];

for (const { src, dest } of assets) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`synced ${src.split('/').slice(-3).join('/')} -> ${dest}`);
}

// The published manifest and its hash-addressed event asset ride along, so the
// app's update check finds a real immutable asset next to the precached copy.
const published = join(root, 'events', 'indiafoss-2025', 'published');
const manifestPath = join(published, 'manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const dest = join(root, 'apps', 'web', 'static', 'events', 'indiafoss-2025');
  copyFileSync(manifestPath, join(dest, 'manifest.json'));
  const asset = manifest.assets?.event;
  if (asset && existsSync(join(published, asset)))
    copyFileSync(join(published, asset), join(dest, asset));
  console.log(`synced manifest rev ${manifest.revision} (${asset})`);
}
