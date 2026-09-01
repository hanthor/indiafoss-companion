export { FossUnitedSource, FOSSU_BASE_URL } from './fossunited/index.js';
export {
  normalizeFossUnited,
  slugify,
  toIsoInKolkata,
  frappeDateTimeToIso,
  NORMALIZER_VERSION,
  FOSSU_TIMEZONE,
} from './fossunited/normalize.js';
export type {
  FosuEventDoc,
  FosuProposal,
  FosuSchedule,
  FosuScheduleSession,
  FosuSpeaker,
} from './fossunited/types.js';
export { FixtureSource, repoRoot } from './fixture.js';
export { StaticBundleSource } from './static-bundle.js';
export type { EventSource, SourceEvent, FossUnitedSourceEvent } from './types.js';

/**
 * Merge an authored booth list into a normalized bundle (booths are not
 * exposed by the FOSS United public API; see events/<id>/booths.json).
 */
export function mergeBooths<B extends { id: string }>(
  bundle: { booths: unknown[] },
  booths: B[],
): void {
  const seen = new Set(bundle.booths.map((b) => (b as { id: string }).id));
  for (const booth of booths) {
    if (!seen.has(booth.id)) {
      bundle.booths.push(booth);
      seen.add(booth.id);
    }
  }
}
