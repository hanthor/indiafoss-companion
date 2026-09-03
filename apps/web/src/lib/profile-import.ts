import type { AttendeeProfile } from '@indiafoss/model';
import {
  applyImportedProfile,
  IMPORT_MESSAGES,
  importFossUnitedProfile,
  type ImportedChange,
} from '$lib/fossunited';
import { importGithubProfile } from '$lib/github';

export interface LinkedImportOutcome {
  changes: ImportedChange[];
  /** One line per source that could not be read, for the status text. */
  problems: string[];
  /** Sources that answered. */
  sources: string[];
}

/**
 * Fill the card from every public profile it links to (#96): the FOSS United
 * page when a username is set, the GitHub profile when a GitHub link is set.
 * Sources are read together; FOSS United is applied first so its name wins
 * when both know one. Nothing the attendee typed is overwritten.
 */
export async function importLinkedProfiles(profile: AttendeeProfile): Promise<LinkedImportOutcome> {
  const outcome: LinkedImportOutcome = { changes: [], problems: [], sources: [] };
  const fossu = profile.fossUnitedProfileUrl?.trim();
  const github = profile.socials.github?.trim();
  if (!fossu && !github) {
    outcome.problems.push('Add your FOSS United username or GitHub link first.');
    return outcome;
  }
  const [fossuResult, githubResult] = await Promise.all([
    fossu ? importFossUnitedProfile(fossu) : null,
    github ? importGithubProfile(github) : null,
  ]);
  if (fossuResult) {
    if (fossuResult.ok && fossuResult.profile) {
      outcome.sources.push('FOSS United');
      outcome.changes.push(...applyImportedProfile(profile, fossuResult.profile));
    } else {
      outcome.problems.push(`FOSS United: ${IMPORT_MESSAGES[fossuResult.failure ?? 'network']}`);
    }
  }
  if (githubResult) {
    if (githubResult.ok && githubResult.profile) {
      outcome.sources.push('GitHub');
      outcome.changes.push(...applyImportedProfile(profile, githubResult.profile));
    } else {
      const why: Record<string, string> = {
        'rate-limited': 'too many requests from this network right now; try again in a while.',
        'not-found': 'no such user.',
        'invalid-url': 'that is not a GitHub profile link.',
        network: 'could not reach api.github.com. Check your connection and try again.',
      };
      outcome.problems.push(`GitHub: ${why[githubResult.failure ?? 'network']}`);
    }
  }
  return outcome;
}
