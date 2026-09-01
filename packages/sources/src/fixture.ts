import type { EventBundle, EventReference } from '@indiafoss/model';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeFossUnited } from './fossunited/normalize.js';
import type { FosuEventDoc, FosuProposalList, FosuSchedule } from './fossunited/types.js';
import type { EventSource, SourceEvent } from './types.js';

/**
 * Resolve a path relative to the repository root by walking up to the
 * `pnpm-workspace.yaml` marker. Robust regardless of where this module ends
 * up in the tree (vitest transforms, bundling, etc.).
 */
export function repoRoot(...parts: string[]): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) break;
    dir = dirname(dir);
  }
  return join(dir, ...parts);
}

/**
 * Reads captured raw fixtures (events/<eventId>/raw/*.json) and normalizes
 * them with the same adapter logic as the live source. Deterministic and
 * offline — this is the basis for fixture integration tests.
 */
export class FixtureSource implements EventSource {
  constructor(private readonly eventsDir: string = repoRoot('events')) {}

  private async loadJson<T>(file: string): Promise<T> {
    const raw = JSON.parse(await readFile(file, 'utf8')) as { message?: T } | T;
    // Captured responses are full API envelopes; unwrap `.message`.
    if (typeof raw === 'object' && raw !== null && 'message' in raw && raw.message !== undefined) {
      return (raw as { message: T }).message;
    }
    return raw as T;
  }

  async fetchEvent(ref: EventReference): Promise<SourceEvent> {
    const dir = `${this.eventsDir}/${ref.id}/raw`;
    const [event, schedule, proposalsList] = await Promise.all([
      this.loadJson<FosuEventDoc>(`${dir}/event.json`),
      this.loadJson<FosuSchedule>(`${dir}/schedule.json`),
      this.loadJson<FosuProposalList>(`${dir}/proposals.json`),
    ]);
    return {
      kind: 'fossunited',
      eventId: ref.id,
      event,
      schedule,
      proposals: proposalsList.proposals ?? [],
    };
  }

  async normalize(source: SourceEvent): Promise<EventBundle> {
    if (source.kind !== 'fossunited') {
      throw new Error(`FixtureSource cannot normalize source kind '${source.kind}'`);
    }
    return normalizeFossUnited({
      eventId: source.eventId,
      event: source.event,
      schedule: source.schedule,
      proposals: source.proposals,
    });
  }

  /** Convenience: fetch + normalize in one call (used by tests and dev tools). */
  async loadRef(ref: EventReference): Promise<EventBundle> {
    const source = await this.fetchEvent(ref);
    return this.normalize(source);
  }
}
