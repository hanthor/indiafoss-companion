// Sync normalized event bundles and venue assets from events/ into the web
// app's static assets so the PWA ships them precached and offline-ready.
import { copyFileSync, mkdirSync } from 'node:fs';
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
