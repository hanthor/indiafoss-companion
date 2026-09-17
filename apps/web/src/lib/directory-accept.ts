import { collectConferenceDirectoryIssues } from '@indiafoss/model/contracts';
import type { ConferenceDirectory } from '@indiafoss/model/contracts';

/**
 * Decide what to keep: the candidate only when it is a valid directory for
 * this event, otherwise the previous one. Pure, so the last-good rule is
 * testable without a browser.
 */
export function acceptDirectory(
  previous: ConferenceDirectory | null,
  candidate: unknown,
  eventId: string,
): ConferenceDirectory | null {
  if (collectConferenceDirectoryIssues(candidate).length > 0) return previous;
  const directory = candidate as ConferenceDirectory;
  if (directory.eventId !== eventId) return previous;
  return directory;
}
