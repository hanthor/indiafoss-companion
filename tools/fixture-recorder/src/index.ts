import { isValidEventBundle } from '@indiafoss/model';
import { FixtureSource, FossUnitedSource, mergeBooths, repoRoot } from '@indiafoss/sources';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const usage = `fixture-recorder

Commands:
  normalize <event-id>   Normalize captured raw fixtures into the committed
                         normalized bundle (events/<id>/normalized/event-bundle.json)
  verify <event-id>      Load + validate the normalized bundle, print a summary
  capture-details <id>   Capture public proposal detail pages into raw/
`;

async function normalize(eventId: string): Promise<void> {
  const source = new FixtureSource();
  const bundle = await source.loadRef({ id: eventId, locator: '' });

  // Merge the authored booth fixture (booths are not in the public API).
  const boothsPath = `${repoRoot('events', eventId, 'booths.json')}`;
  try {
    const { booths } = JSON.parse(await readFile(boothsPath, 'utf8')) as {
      booths: { id: string }[];
    };
    mergeBooths(bundle, booths);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'ENOENT') throw error;
  }

  const issues = isValidEventBundle(bundle) ? [] : ['bundle failed structural validation'];
  if (issues.length > 0) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
    return;
  }

  const outDir = repoRoot('events', eventId, 'normalized');
  await mkdir(outDir, { recursive: true });
  await writeFile(`${outDir}/event-bundle.json`, JSON.stringify(bundle, null, 2) + '\n');

  console.log(`normalized ${eventId}:`);
  console.log(`  activities: ${bundle.activities.length}`);
  console.log(`  people:     ${bundle.people.length}`);
  console.log(`  locations:  ${bundle.locations.length}`);
  console.log(`  tracks:     ${bundle.tracks.length}`);
  console.log(`  booths:     ${bundle.booths.length}`);
  console.log(`  wrote events/${eventId}/normalized/event-bundle.json`);
}

async function verify(eventId: string): Promise<void> {
  const source = new FixtureSource();
  const bundle = await source.loadRef({ id: eventId, locator: '' });
  console.log(
    `${eventId}: ${bundle.activities.length} activities, ${bundle.people.length} people, ` +
      `${bundle.locations.length} locations, ${bundle.tracks.length} tracks`,
  );
  if (!isValidEventBundle(bundle)) {
    console.error('validation FAILED');
    process.exitCode = 1;
  }
}

async function captureDetails(eventId: string): Promise<void> {
  const match = eventId.match(/^(.*?)-(\d{4})$/);
  const locator = match ? `c/${match[1]}/${match[2]}` : `c/${eventId}`;
  const source = new FossUnitedSource();
  const fetched = await source.fetchEvent({ id: eventId, locator });
  if (fetched.kind !== 'fossunited') throw new Error('unexpected source kind');
  const out = repoRoot('events', eventId, 'raw', 'proposal-details.json');
  await writeFile(out, JSON.stringify(fetched.proposalDetails, null, 2) + '\n');
  console.log(
    `captured ${Object.keys(fetched.proposalDetails).length} proposal detail pages -> ${out}`,
  );
}

export async function main(): Promise<void> {
  const [cmd, eventId] = process.argv.slice(2);
  if (cmd === 'normalize' && eventId) {
    await normalize(eventId);
  } else if (cmd === 'verify' && eventId) {
    await verify(eventId);
  } else if (cmd === 'capture-details' && eventId) {
    await captureDetails(eventId);
  } else {
    console.error(usage);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
