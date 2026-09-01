import { readFile } from 'node:fs/promises';
import { validateVenueGraph, validateVenueMetadata } from '@indiafoss/venue';
import type { VenueGraph, VenueMetadata } from '@indiafoss/venue';

const usage = `venue-validator

Usage: venue-validator <events-dir> <event-id>

Validates events/<event-id>/venue/{venue.svg, venue.graph.json, venue.metadata.json}
against the §53 checklist and prints a human-readable report.
`;

export interface ValidationReport {
  eventId: string;
  graphIssues: string[];
  metadataIssues: string[];
  svgTargetIssues: string[];
  /** svgTargets referenced by metadata but missing from the SVG. */
  missingSvgTargets: string[];
}

export async function validateVenue(eventDir: string, eventId: string): Promise<ValidationReport> {
  const base = `${eventDir}/${eventId}/venue`;
  const graph = JSON.parse(await readFile(`${base}/venue.graph.json`, 'utf8')) as VenueGraph;
  const metadata = JSON.parse(
    await readFile(`${base}/venue.metadata.json`, 'utf8'),
  ) as VenueMetadata;
  const svg = await readFile(`${base}/venue.svg`, 'utf8');

  const graphIssues = validateVenueGraph(graph);
  const metadataIssues = validateVenueMetadata(metadata, graph);

  const svgIds = new Set([...svg.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!));
  const missingSvgTargets: string[] = [];
  for (const ref of Object.values(metadata.locations)) {
    if (ref.svgTarget && !svgIds.has(ref.svgTarget)) {
      missingSvgTargets.push(`${ref.locationId} -> #${ref.svgTarget}`);
    }
  }

  return { eventId, graphIssues, metadataIssues, svgTargetIssues: [], missingSvgTargets };
}

export function formatReport(report: ValidationReport): string {
  const lines: string[] = [`venue validation report — ${report.eventId}`];
  const sections: [string, string[]][] = [
    ['graph', report.graphIssues],
    ['metadata', report.metadataIssues],
    ['svg targets', report.missingSvgTargets.map((m) => `missing ${m}`)],
  ];
  let problems = 0;
  for (const [name, issues] of sections) {
    if (issues.length === 0) {
      lines.push(`  ✓ ${name}: ok`);
    } else {
      problems += issues.length;
      lines.push(`  ✗ ${name}:`);
      for (const issue of issues) lines.push(`      - ${issue}`);
    }
  }
  lines.push(
    problems === 0
      ? 'RESULT: PASS'
      : `RESULT: FAIL (${problems} problem${problems === 1 ? '' : 's'})`,
  );
  return lines.join('\n');
}

export async function main(): Promise<void> {
  const [, , eventsDir, eventId] = process.argv;
  if (!eventsDir || !eventId) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const report = await validateVenue(eventsDir, eventId);
  console.log(formatReport(report));
  const problems =
    report.graphIssues.length + report.metadataIssues.length + report.missingSvgTargets.length;
  process.exitCode = problems === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
