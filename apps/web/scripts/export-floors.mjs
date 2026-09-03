// Write the floor plans (`src/lib/venue-floors.ts`) out as JSON for the native
// Android client, which draws the same vectors with Compose. Run after
// editing the floors; the file is committed so the native build needs no
// TypeScript toolchain:
//
//   pnpm --filter @indiafoss/web floors
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOORS, FLOOR_ORDER } from '../src/lib/venue-floors.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'static', 'venues', 'indiafoss-2026', 'floors.json');
const floors = FLOOR_ORDER.map((id) => FLOORS[id]);
writeFileSync(out, JSON.stringify({ floors }, null, 0) + '\n');
console.log(`wrote ${out}: ${floors.map((f) => `${f.id} (${f.rooms.length} rooms)`).join(', ')}`);
