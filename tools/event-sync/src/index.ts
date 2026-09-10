import { collectBundleWarnings, collectVenueIssues, isValidEventBundle } from '@indiafoss/model';
import type { EventBundle, EventReference, EventVenue, MessagingConfig } from '@indiafoss/model';
import { diffBundles, summarizeChanges } from '@indiafoss/schedule';
import { FixtureSource, FossUnitedSource, mergeBooths, repoRoot } from '@indiafoss/sources';
import { preserveActivityIds } from './identity.js';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const usage = `event-sync (§7)

Usage:
  event-sync sync <event-id> [--source fixture|live]
      Fetch -> normalize -> validate -> write versioned assets, diff against
      the previous revision, and refresh the manifest.
  event-sync publish <event-id>
      Copy the latest revision into the web app's static assets so the PWA
      can serve it (also done by the web app's prebuild).

Output under events/<event-id>/published/:
  manifest.json            short cache lifetime (§34)
  event.<hash>.json        hash-addressed, cache forever
  schedule.<hash>.json
  people.<hash>.json
  booths.<hash>.json
  changes.<revision>.json
`;

import { isValidEventManifest, type EventManifest } from '@indiafoss/model/contracts';
export type { EventManifest } from '@indiafoss/model/contracts';

function hash(data: string): string {
  return createHash('sha256').update(data).digest('hex').slice(0, 8);
}

export function publicEventRoute(eventId: string): string {
  const match = eventId.match(/^(.*?)-(\d{4})$/);
  return match ? `c/${match[1]}/${match[2]}` : `c/${eventId}`;
}

export async function syncEvent(
  eventId: string,
  source: 'fixture' | 'live' = 'fixture',
  publishedDirOverride?: string,
): Promise<EventManifest> {
  const ref: EventReference = { id: eventId, locator: publicEventRoute(eventId) };
  const sourceImpl = source === 'live' ? new FossUnitedSource() : new FixtureSource();
  const captured = await sourceImpl.fetchEvent(ref);
  // An unavailable enrichment page must not erase a previously published description.
  if (source === 'live' && captured.kind === 'fossunited') {
    const previousDetailsPath = repoRoot('events', eventId, 'raw', 'proposal-details.json');
    if (existsSync(previousDetailsPath)) {
      const previousDetails = JSON.parse(readFileSync(previousDetailsPath, 'utf8')) as Record<
        string,
        unknown
      >;
      const linked = new Set(
        Object.values(captured.schedule).flatMap((rooms) =>
          Object.values(rooms).flatMap((sessions) => sessions.map((session) => session.linked_cfp)),
        ),
      );
      const missing = Object.keys(previousDetails).filter(
        (id) => linked.has(id) && !captured.proposalDetails?.[id],
      );
      if (missing.length) {
        throw new Error(
          `Incomplete proposal capture: ${missing.length} previously available pages could not be read. Retry before publishing.`,
        );
      }
    }
  }
  const bundle = await sourceImpl.normalize(captured);

  // Merge the authored booth fixture (booths are not in the public API).
  const boothsPath = join(repoRoot('events', eventId), 'booths.json');
  if (existsSync(boothsPath)) {
    const { booths } = JSON.parse(readFileSync(boothsPath, 'utf8')) as { booths: { id: string }[] };
    mergeBooths(bundle, booths);
  }

  // Merge the organiser's Matrix rooms (FOSDEM-style, see docs/messaging.md).
  const messagingPath = join(repoRoot('events', eventId), 'messaging.json');
  if (existsSync(messagingPath)) {
    bundle.messaging = JSON.parse(readFileSync(messagingPath, 'utf8')) as MessagingConfig;
  }

  // Merge the reviewed venue arrival block (#278). The organiser's own event
  // document also carries a map link; a mismatch means the reviewed file is
  // stale, which is a warning for a human, never a reason to guess.
  const venuePath = join(repoRoot('events', eventId), 'venue-arrival.json');
  if (existsSync(venuePath)) {
    const { venue } = JSON.parse(readFileSync(venuePath, 'utf8')) as { venue: EventVenue };
    const issues = collectVenueIssues(venue);
    if (issues.length) throw new Error(`venue-arrival.json is invalid: ${issues.join('; ')}`);
    bundle.venue = venue;
    const upstreamMapLink = captured.kind === 'fossunited' ? captured.event.map_link : undefined;
    if (upstreamMapLink && upstreamMapLink !== venue.mapUrl) {
      console.warn(
        `warning: venue-arrival.json mapUrl differs from the FOSS United event map_link (${upstreamMapLink}); re-check the organiser page`,
      );
    }
  }

  const publicationPath = join(repoRoot('events', eventId), 'publication.json');
  if (existsSync(publicationPath)) {
    const publication = JSON.parse(readFileSync(publicationPath, 'utf8')) as {
      scheduleStatus?: unknown;
    };
    if (publication.scheduleStatus !== 'draft' && publication.scheduleStatus !== 'confirmed') {
      throw new Error('publication.scheduleStatus must be draft or confirmed');
    }
    bundle.sourceMetadata.scheduleStatus = publication.scheduleStatus;
  }

  if (!isValidEventBundle(bundle)) {
    throw new Error('normalized bundle failed structural validation');
  }
  for (const warning of collectBundleWarnings(bundle)) console.warn(`warning: ${warning}`);

  const publishedDir = publishedDirOverride ?? repoRoot('events', eventId, 'published');
  mkdirSync(publishedDir, { recursive: true });

  // Previous revision for diffing.
  let prevRevision = 0;
  let prevBundle: EventBundle | null = null;
  const manifestPath = join(publishedDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const prev = JSON.parse(readFileSync(manifestPath, 'utf8')) as EventManifest;
    prevRevision = prev.revision;
    const prevAsset = prev.assets['event'];
    if (prevAsset) {
      const prevPath = join(publishedDir, prevAsset);
      if (existsSync(prevPath)) prevBundle = JSON.parse(readFileSync(prevPath, 'utf8'));
    }
  }

  if (bundle.activities.length === 0) throw new Error('Refusing to publish an empty programme');
  if (prevBundle) {
    preserveActivityIds(prevBundle, bundle);
    const retained = new Set(bundle.activities.map((a) => a.id));
    const missing = prevBundle.activities.filter((a) => !retained.has(a.id)).length;
    if (prevBundle.activities.length && missing / prevBundle.activities.length > 0.25) {
      throw new Error(
        `Refusing automatic publication: ${missing} previous activities disappeared. Review the source and identity mapping.`,
      );
    }
  }
  if (!isValidEventBundle(bundle))
    throw new Error('identity reconciliation produced an invalid bundle');
  if (source === 'live' && !publishedDirOverride && captured.kind === 'fossunited') {
    const rawDir = repoRoot('events', eventId, 'raw');
    mkdirSync(rawDir, { recursive: true });
    const captures = {
      'event.json': captured.event,
      'schedule.json': captured.schedule,
      'proposals.json': { proposals: captured.proposals },
      'proposal-details.json': captured.proposalDetails,
    };
    for (const [name, value] of Object.entries(captures)) {
      writeFileSync(join(rawDir, name), JSON.stringify(value, null, 2) + '\n');
    }
    writeFileSync(
      repoRoot('events', eventId, 'activity-ids.json'),
      JSON.stringify(
        Object.fromEntries(
          bundle.activities.flatMap((a) => [
            [`row:${a.sourceId}`, a.id],
            ...(a.proposalId &&
            bundle.activities.filter((b) => b.proposalId === a.proposalId).length === 1
              ? [[`cfp:${a.proposalId}`, a.id]]
              : []),
          ]),
        ),
        null,
        2,
      ) + '\n',
    );
  }
  const eventJson = JSON.stringify(bundle, null, 2);
  const eventHash = hash(eventJson);

  // No-op sync: same content hash as the current revision — keep revision.
  if (existsSync(manifestPath) && prevBundle) {
    const prevManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as EventManifest;
    const prevAsset = prevManifest.assets['event'];
    if (prevAsset && existsSync(join(publishedDir, prevAsset))) {
      const prevAssetContent = readFileSync(join(publishedDir, prevAsset), 'utf8');
      if (hash(prevAssetContent) === eventHash) {
        console.log(`no changes for ${eventId} (rev ${prevManifest.revision} unchanged)`);
        return prevManifest;
      }
    }
  }

  const revision = prevRevision + 1;
  const changes = prevBundle ? diffBundles(prevBundle, bundle) : [];
  const changesJson = JSON.stringify(
    {
      eventId,
      revision,
      from: prevRevision,
      changes: prevBundle ? changes : undefined,
      summary: summarizeChanges(changes),
    },
    null,
    2,
  );

  // Immutable, hash-addressed assets (§34): the whole bundle plus the slices a
  // client may fetch on their own. Same content, same name, cache forever.
  const slices: Record<string, string> = {
    event: eventJson,
    schedule: JSON.stringify(
      { activities: bundle.activities, locations: bundle.locations, tracks: bundle.tracks },
      null,
      2,
    ),
    people: JSON.stringify({ people: bundle.people }, null, 2),
    booths: JSON.stringify({ booths: bundle.booths }, null, 2),
  };
  const assets: Record<string, string> = {};
  for (const [name, content] of Object.entries(slices)) {
    assets[name] = `${name}.${hash(content)}.json`;
    writeFileSync(join(publishedDir, assets[name]), content);
  }
  // The committed normalized bundle is what the app ships; keep it identical.
  if (!publishedDirOverride) {
    const normalizedDir = repoRoot('events', eventId, 'normalized');
    mkdirSync(normalizedDir, { recursive: true });
    writeFileSync(join(normalizedDir, 'event-bundle.json'), `${eventJson}\n`);
  }
  writeFileSync(join(publishedDir, `changes.${revision}.json`), changesJson);
  if (prevBundle)
    writeFileSync(join(publishedDir, `diff.${prevRevision}-${revision}.json`), changesJson);

  const manifest: EventManifest = {
    schemaVersion: 1,
    eventId,
    revision,
    generatedAt: new Date().toISOString(),
    timezone: bundle.timezone,
    ...(bundle.sourceMetadata.sourceUpdatedAt
      ? { sourceUpdatedAt: bundle.sourceMetadata.sourceUpdatedAt }
      : {}),
    assets,
  };
  if (!isValidEventManifest(manifest)) throw new Error('generated manifest failed validation');
  writeFileSync(join(publishedDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(
    `synced ${eventId} rev ${prevRevision} -> ${revision}: ${bundle.activities.length} activities, ` +
      `${bundle.people.length} people, ${bundle.booths.length} booths`,
  );
  if (changes.length > 0) {
    console.log('changes:', JSON.stringify(summarizeChanges(changes)));
    for (const change of changes.slice(0, 10)) {
      console.log(
        `  [${change.type}] ${change.title}${change.detail ? ` (${change.detail})` : ''}`,
      );
    }
  }
  return manifest;
}

export function publishEvent(eventId: string): void {
  const publishedDir = repoRoot('events', eventId, 'published');
  const manifestPath = join(publishedDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`no published manifest for ${eventId}; run 'event-sync sync ${eventId}' first`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as EventManifest;
  const destDir = repoRoot('apps', 'web', 'static', 'events', eventId);
  mkdirSync(destDir, { recursive: true });
  // Hash-less copy for the precache, plus the immutable asset the manifest names.
  copyFileSync(join(publishedDir, manifest.assets['event']!), join(destDir, 'event-bundle.json'));
  copyFileSync(
    join(publishedDir, manifest.assets['event']!),
    join(destDir, manifest.assets['event']!),
  );
  writeFileSync(join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `published ${eventId} rev ${manifest.revision} -> apps/web/static/events/${eventId}/`,
  );
  void readdirSync;
}

export async function main(): Promise<void> {
  const [, , cmd, eventId, ...rest] = process.argv;
  const sourceArg = rest.includes('--source') ? rest[rest.indexOf('--source') + 1] : 'fixture';
  if (!eventId) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  try {
    if (cmd === 'sync') {
      await syncEvent(eventId, sourceArg === 'live' ? 'live' : 'fixture');
    } else if (cmd === 'publish') {
      publishEvent(eventId);
    } else {
      console.error(usage);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  void main();
}
