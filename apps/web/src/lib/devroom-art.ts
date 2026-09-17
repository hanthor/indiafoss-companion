import type { Activity } from '@indiafoss/model';

/** Official IndiaFOSS 2026 devroom patterns, keyed by programme track identity. */
export const devroomArt: Record<string, string> = {
  'devroom-android-open-source-project-aosp': 'aosp',
  'devroom-cloud-devops': 'devops',
  'devroom-compilers-programming-languages-and-systems': 'compilers',
  'devroom-documentation-technical-writing': 'docs',
  'devroom-open-design': 'design',
  'devroom-open-hardware': 'hardware',
  'devroom-real-time-operating-systems-rtos': 'rtos',
  'devroom-security': 'security',
};

/** The event whose artwork and colours these are; other events get neither. */
export const ART_EVENT_ID = 'indiafoss-2026';

/**
 * The CSS colour token for a devroom track, e.g. `var(--devroom-aosp)`, or
 * undefined for a main hall, an unknown track or another event. The values
 * live in `app.css` beside the other brand tokens (#469).
 */
export function devroomColor(trackId: string | undefined, eventId: string): string | undefined {
  if (eventId !== ART_EVENT_ID || !trackId) return undefined;
  const art = devroomArt[trackId];
  return art ? `var(--devroom-${art})` : undefined;
}

/** The devroom colour for a session: its devroom first, else its track. */
export function activityDevroomColor(activity: Activity, eventId: string): string | undefined {
  return devroomColor(activity.devroomId ?? activity.trackId, eventId);
}
