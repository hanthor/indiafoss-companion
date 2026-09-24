import { readFileSync } from 'node:fs';

/**
 * The live 2026 programme as the app serves it. The hourly import changes it:
 * talks move, are added and are dropped, and organiser rows get new ids. A
 * spec that needs "a talk" or "a ceremony" picks one from here instead of
 * naming it, so a schedule edit never blocks its own publication.
 */
export interface LiveActivity {
  id: string;
  type: string;
  title: string;
  description?: string;
  speakerIds: string[];
  cancelled?: boolean;
}

export function live2026(): { activities: LiveActivity[] } {
  return JSON.parse(
    readFileSync(
      new URL('../static/events/indiafoss-2026/event-bundle.json', import.meta.url),
      'utf8',
    ),
  );
}

/** A talk with a speaker, as a detail page is usually opened. */
export function aTalk(): LiveActivity {
  const talk = live2026().activities.find(
    (a) => a.type === 'talk' && a.speakerIds.length > 0 && !a.cancelled,
  );
  if (!talk) throw new Error('The 2026 programme has no talk with a speaker');
  return talk;
}
