import type { Activity, Booth, EventBundle, Person } from '@indiafoss/model';

export type SearchKind = 'activity' | 'person' | 'booth';

export interface SearchHit {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  score: number;
  /** For person hits: ids of activities they speak at. */
  relatedIds?: string[];
}

/**
 * Deterministic, documented ranking model (§31). A query token matches a
 * field at one of three levels; each level carries a weight:
 *
 *   exact match       100% of the field weight
 *   prefix match       60%
 *   contains match     30%
 *
 * Field weights (exact):
 *   title match       100
 *   speaker name       30
 *   tag                20
 *   location / track   15
 *   description         8
 *
 * Every query token contributes its best field score; a hit must match at
 * least one token. Results are ranked by score, then title.
 */
export const SEARCH_WEIGHTS = {
  title: 100,
  speaker: 30,
  tag: 20,
  location: 15,
  description: 8,
} as const;

type MatchLevel = 'exact' | 'prefix' | 'contains' | 'none';

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function tokenize(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** Best token contribution for a field with the given exact weight. */
function fieldScore(tokens: string[], field: string | undefined, exactWeight: number): number {
  if (!field) return 0;
  const norm = normalize(field);
  const words = norm.split(/[^a-z0-9]+/).filter((w) => w.length > 0);
  const rank = (l: MatchLevel): number =>
    l === 'exact' ? 3 : l === 'prefix' ? 2 : l === 'contains' ? 1 : 0;
  let best = 0;
  for (const token of tokens) {
    let level: MatchLevel = 'none';
    for (const word of words) {
      const candidate: MatchLevel =
        word === token
          ? 'exact'
          : word.startsWith(token)
            ? 'prefix'
            : word.includes(token)
              ? 'contains'
              : 'none';
      if (rank(candidate) > rank(level)) level = candidate;
      if (level === 'exact') break;
    }
    // Fallback for tokens that span words (e.g. "open hardware").
    if (level === 'none' && norm.includes(token)) level = 'contains';
    const w =
      level === 'exact'
        ? exactWeight
        : level === 'prefix'
          ? exactWeight * 0.6
          : level === 'contains'
            ? exactWeight * 0.3
            : 0;
    if (w > best) best = w;
  }
  return best;
}

interface Scored {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle?: string;
  score: number;
  relatedIds?: string[];
}

function scoreActivity(
  a: Activity,
  people: Person[],
  locations: Map<string, string>,
  tracks: Map<string, string>,
  tokens: string[],
): Scored | null {
  const speakerNames = a.speakerIds
    .map((id) => people.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n));
  const locationName = a.locationId ? locations.get(a.locationId) : undefined;
  const trackName = a.trackId ? tracks.get(a.trackId) : undefined;

  let score = 0;
  score += fieldScore(tokens, a.title, SEARCH_WEIGHTS.title);
  for (const name of speakerNames) {
    score += fieldScore(tokens, name, SEARCH_WEIGHTS.speaker);
  }
  for (const tag of a.tags) {
    score += fieldScore(tokens, tag, SEARCH_WEIGHTS.tag);
  }
  if (locationName) score += fieldScore(tokens, locationName, SEARCH_WEIGHTS.location);
  if (trackName && trackName !== locationName) {
    score += fieldScore(tokens, trackName, SEARCH_WEIGHTS.location);
  }
  if (a.description) score += fieldScore(tokens, a.description, SEARCH_WEIGHTS.description);

  if (score <= 0) return null;
  return {
    kind: 'activity',
    id: a.id,
    title: a.title,
    subtitle: a.subtitle ?? speakerNames[0] ?? locationName,
    score,
  };
}

function scorePerson(p: Person, tokens: string[]): Scored | null {
  let score = 0;
  score += fieldScore(tokens, p.name, SEARCH_WEIGHTS.title);
  if (p.bio) score += fieldScore(tokens, p.bio, SEARCH_WEIGHTS.description);
  for (const link of p.links) {
    score += fieldScore(tokens, link.url, SEARCH_WEIGHTS.location);
  }
  if (score <= 0) return null;
  return { kind: 'person', id: p.id, title: p.name, subtitle: p.bio?.slice(0, 80), score };
}

function scoreBooth(b: Booth, tokens: string[]): Scored | null {
  let score = 0;
  score += fieldScore(tokens, b.name, SEARCH_WEIGHTS.title);
  score += fieldScore(tokens, b.category, SEARCH_WEIGHTS.tag);
  if (b.description) score += fieldScore(tokens, b.description, SEARCH_WEIGHTS.description);
  for (const tag of b.tags) score += fieldScore(tokens, tag, SEARCH_WEIGHTS.tag);
  if (score <= 0) return null;
  return { kind: 'booth', id: b.id, title: b.name, subtitle: b.category, score };
}

export interface SearchOptions {
  limit?: number;
  include?: SearchKind[];
}

/**
 * Local, offline search across activities, people and booths (§31).
 * Pure function — no remote requests, deterministic output.
 */
export function searchEvent(
  bundle: EventBundle,
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const { limit = 25, include = ['activity', 'person', 'booth'] } = options;
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const locations = new Map(bundle.locations.map((l) => [l.id, l.name]));
  const tracks = new Map(bundle.tracks.map((t) => [t.id, t.name]));
  const people = bundle.people;

  const results: Scored[] = [];

  if (include.includes('activity')) {
    for (const a of bundle.activities) {
      const hit = scoreActivity(a, people, locations, tracks, tokens);
      if (hit) results.push(hit);
    }
  }
  if (include.includes('person')) {
    for (const p of bundle.people) {
      const hit = scorePerson(p, tokens);
      if (hit) results.push(hit);
    }
  }
  if (include.includes('booth')) {
    for (const b of bundle.booths) {
      const hit = scoreBooth(b, tokens);
      if (hit) results.push(hit);
    }
  }

  for (const r of results) {
    if (r.kind === 'person') {
      r.relatedIds = bundle.activities.filter((a) => a.speakerIds.includes(r.id)).map((a) => a.id);
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Convenience: just activities, e.g. for schedule autocomplete. */
export function searchActivities(bundle: EventBundle, query: string, limit = 25): SearchHit[] {
  return searchEvent(bundle, query, { limit, include: ['activity'] });
}
