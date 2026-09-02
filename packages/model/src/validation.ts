import type { EventBundle } from './index.js';
import { EVENT_BUNDLE_SCHEMA_VERSION } from './index.js';
import { collectMessagingIssues } from './messaging.js';

/**
 * Minimal structural validator for an {@link EventBundle}.
 *
 * Returns a list of human-readable problems. An empty list means the bundle
 * passes basic structural checks. This is intentionally lightweight in Phase 0
 * and will grow with the fixture integration work.
 */
export function collectBundleIssues(bundle: EventBundle): string[] {
  const issues: string[] = [];

  if (bundle.schemaVersion !== EVENT_BUNDLE_SCHEMA_VERSION) {
    issues.push(`schemaVersion ${bundle.schemaVersion} != ${EVENT_BUNDLE_SCHEMA_VERSION}`);
  }
  if (!bundle.id.trim()) {
    issues.push('id must be a non-empty string');
  }
  if (!bundle.name.trim()) {
    issues.push('name must be a non-empty string');
  }
  if (!bundle.timezone.trim()) {
    issues.push('timezone must be a non-empty IANA identifier');
  }
  if (!bundle.start || !bundle.end) {
    issues.push('start and end timestamps are required');
  } else if (Date.parse(bundle.start) >= Date.parse(bundle.end)) {
    issues.push('start must be strictly before end');
  }

  const activityIds = new Set<string>();
  for (const activity of bundle.activities) {
    if (activityIds.has(activity.id)) {
      issues.push(`duplicate activity id: ${activity.id}`);
    }
    activityIds.add(activity.id);
    if (!activity.title.trim()) {
      issues.push(`activity ${activity.id} has an empty title`);
    }
  }

  if (bundle.messaging) {
    issues.push(
      ...collectMessagingIssues(bundle.messaging, {
        activityIds,
        locationIds: new Set(bundle.locations.map((l) => l.id)),
        boothIds: new Set(bundle.booths.map((b) => b.id)),
        trackIds: new Set(bundle.tracks.map((t) => t.id)),
      }),
    );
  }

  return issues;
}

/**
 * Non-fatal findings: things worth fixing at the source but not worth
 * refusing the bundle for (a speaker's social link that is not a URL, an
 * activity link without a scheme).
 */
export function collectBundleWarnings(bundle: EventBundle): string[] {
  const warnings: string[] = [];
  const bad = (url: string) => {
    try {
      const parsed = new URL(url.trim());
      return (
        parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'mailto:'
      );
    } catch {
      return true;
    }
  };
  for (const person of bundle.people) {
    for (const link of person.links ?? []) {
      if (bad(link.url)) warnings.push(`person ${person.id} has a malformed link: ${link.url}`);
    }
  }
  for (const activity of bundle.activities) {
    for (const link of [...(activity.links ?? []), ...(activity.references ?? [])]) {
      if (bad(link.url)) warnings.push(`activity ${activity.id} has a malformed link: ${link.url}`);
    }
  }
  return warnings;
}

/** True when the bundle passes all structural checks. */
export function isValidEventBundle(bundle: EventBundle): boolean {
  return collectBundleIssues(bundle).length === 0;
}
