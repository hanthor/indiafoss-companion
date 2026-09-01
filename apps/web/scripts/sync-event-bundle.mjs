// Sync the normalized event bundle from events/ into the web app's static
// assets so the PWA ships it precached and offline-ready.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = join(root, 'events', 'indiafoss-2025', 'normalized', 'event-bundle.json');
const dest = join(root, 'apps', 'web', 'static', 'events', 'indiafoss-2025', 'event-bundle.json');

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`synced event bundle -> ${dest}`);
