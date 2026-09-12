import type { EventBundle, EventReference } from '@indiafoss/model';
import { readFile } from 'node:fs/promises';
import { repoRoot } from './fixture.js';
import type { BundleLoader } from './types.js';

/**
 * Loads an already-normalized event bundle (events/<eventId>/normalized/
 * event-bundle.json). This is the fastest path for the PWA: no adapter code
 * runs on the device, the bundle is just static data.
 */
export class StaticBundleSource implements BundleLoader {
  constructor(private readonly eventsDir: string = repoRoot('events')) {}

  /** Load a normalized bundle straight from disk. */
  async loadBundle(ref: EventReference): Promise<EventBundle> {
    const raw = await readFile(`${this.eventsDir}/${ref.id}/normalized/event-bundle.json`, 'utf8');
    return JSON.parse(raw) as EventBundle;
  }
}

