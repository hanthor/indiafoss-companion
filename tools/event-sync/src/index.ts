import { isValidEventBundle } from '@indiafoss/model';
import type { EventBundle, EventReference, MessagingConfig } from '@indiafoss/model';
import { diffBundles, summarizeChanges } from '@indiafoss/schedule';
import { FixtureSource, FossUnitedSource, mergeBooths, repoRoot } from '@indiafoss/sources';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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

export interface EventManifest {
  schemaVersion: number;
  eventId: string;
  revision: number;
  generatedAt: string;
  sourceUpdatedAt?: string;
  assets: Record<string, string>;
}

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
  const bundle = await sourceImpl.normalize(await sourceImpl.fetchEvent(ref));

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

  if (!isValidEventBundle(bundle)) {
    throw new Error('normalized bundle failed structural validation');
  }

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

  const assets: Record<string, string> = {
    event: `event.${hash(eventJson)}.json`,
  };
  const assetNames = ['event'] as const;
  for (const name of assetNames) {
    const content = name === 'event' ? eventJson : JSON.stringify({}, null, 2);
    writeFileSync(join(publishedDir, assets[name]!), content);
  }
  writeFileSync(join(publishedDir, `changes.${revision}.json`), changesJson);
  if (prevBundle)
    writeFileSync(join(publishedDir, `diff.${prevRevision}-${revision}.json`), changesJson);

  const manifest: EventManifest = {
    schemaVersion: 1,
    eventId,
    revision,
    generatedAt: new Date().toISOString(),
    ...(bundle.sourceMetadata.sourceUpdatedAt
      ? { sourceUpdatedAt: bundle.sourceMetadata.sourceUpdatedAt }
      : {}),
    assets,
  };
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
  copyFileSync(join(publishedDir, manifest.assets['event']!), join(destDir, 'event-bundle.json'));
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

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
