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

  if (bundle.messaging) issues.push(...collectMessagingIssues(bundle.messaging));

  return issues;
}

/** True when the bundle passes all structural checks. */
export function isValidEventBundle(bundle: EventBundle): boolean {
  return collectBundleIssues(bundle).length === 0;
}
