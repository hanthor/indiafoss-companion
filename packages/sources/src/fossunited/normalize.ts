import type {
  Activity,
  ActivityType,
  EventBundle,
  Location,
  Person,
  Track,
} from '@indiafoss/model';
import { EVENT_BUNDLE_SCHEMA_VERSION } from '@indiafoss/model';
import type {
  FosuEventDoc,
  FosuProposal,
  FosuProposalDetail,
  FosuSchedule,
  FosuSpeaker,
} from './types.js';

/** Timezone is explicit; never infer from the browser/runtime. */
export const FOSSU_TIMEZONE = 'Asia/Kolkata';
/** IST is UTC+05:30 with no DST, so a fixed offset is safe. */
const TZ_OFFSET = '+05:30';

export const NORMALIZER_VERSION = '0.1.0';

const HALL_TO_KIND: Record<string, Location['kind']> = {
  'Food Area': 'food',
};

const CATEGORY_TO_TYPE: Record<string, ActivityType | undefined> = {
  Break: 'meal',
  'Opening Note': 'keynote',
  Talk: 'talk',
  'Lightning Talk': 'lightning-talk',
  Other: undefined,
};

const SESSION_TYPE_TO_TYPE: Record<string, ActivityType> = {
  Talk: 'talk',
  'Invited Talk': 'talk',
  Keynote: 'keynote',
  'Lightning Talk': 'lightning-talk',
  'Birds of Feather(BoF)': 'bof',
  BoF: 'bof',
  'Panel Discussion': 'panel',
  Workshop: 'workshop',
};

/** Convert "2025-09-20" + "8:00:00" to an ISO instant in Asia/Kolkata. */
export function toIsoInKolkata(date: string, time: string): string {
  const [h, m, s] = time.split(':');
  const hh = (h ?? '0').padStart(2, '0');
  const mm = (m ?? '0').padStart(2, '0');
  const ss = (s ?? '0').padStart(2, '0');
  return `${date}T${hh}:${mm}:${ss}${TZ_OFFSET}`;
}

/** Frappe datetime "2025-09-20 09:00:00" -> ISO instant in Asia/Kolkata. */
export function frappeDateTimeToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const [date, time] = value.split(' ');
  if (!date) return undefined;
  return toIsoInKolkata(date, time ?? '00:00:00');
}

/** Strip a stray leading/trailing quote left by the source when quotes do not pair up. */
export function cleanTitle(title: string): string {
  let t = title.trim();
  const quotes = (t.match(/"/g) ?? []).length;
  if (quotes % 2 === 1) {
    if (t.endsWith('"')) t = t.slice(0, -1).trimEnd();
    else if (t.startsWith('"')) t = t.slice(1).trimStart();
  }
  return t;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\(|\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stripHtml(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return (
    input
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || undefined
  );
}

function absoluteUrl(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  return `https://fossunited.org${path.startsWith('/') ? '' : '/'}${path}`;
}

function resolveType(
  session: { category?: string; linked_cfp?: string },
  proposalByCfp: Map<string, FosuProposal>,
): ActivityType {
  const fromCategory = session.category ? CATEGORY_TO_TYPE[session.category] : undefined;
  if (fromCategory) return fromCategory;
  const cfp = session.linked_cfp ? proposalByCfp.get(session.linked_cfp) : undefined;
  if (cfp?.session_type) {
    const fromSessionType = SESSION_TYPE_TO_TYPE[cfp.session_type];
    if (fromSessionType) return fromSessionType;
  }
  return 'talk';
}

interface HallInfo {
  location: Location;
  track: Track;
}

function buildHalls(event: FosuEventDoc, schedule: FosuSchedule): Map<string, HallInfo> {
  const halls = new Map<string, HallInfo>();
  const seen = new Set<string>();
  const addHall = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const id = slugify(name);
    const kind = HALL_TO_KIND[name] ?? 'room';
    const isDevroom = name.toLowerCase().startsWith('devroom');
    const location: Location = {
      id,
      name,
      kind,
      routingNodeIds: [],
      ...(isDevroom ? { floor: undefined } : {}),
    };
    const track: Track = { id, name };
    halls.set(name, { location, track });
  };

  for (const line of (event.hall_options ?? '').split('\n')) {
    const name = line.trim();
    if (name) addHall(name);
  }
  for (const dateHalls of Object.values(schedule)) {
    for (const hallName of Object.keys(dateHalls)) {
      if (hallName !== 'General') addHall(hallName);
    }
  }
  return halls;
}

function buildPeople(schedule: FosuSchedule): Map<string, Person> {
  const byName = new Map<string, Person>();
  const visit = (sp: FosuSpeaker) => {
    const name = (sp.full_name ?? '').trim();
    if (!name) return;
    const baseId = slugify(name) || 'speaker';
    let id = `person-${baseId}`;
    let n = 2;
    while (byName.has(id)) {
      // Same name twice: disambiguate deterministically.
      if (byName.get(id)?.name === name) return;
      id = `person-${baseId}-${n++}`;
    }
    const links = sp.social_link ? [{ label: 'social', url: sp.social_link }] : [];
    byName.set(id, {
      id,
      ...(sp.parent ? { sourceId: sp.parent } : {}),
      name,
      ...(sp.bio ? { bio: stripHtml(sp.bio) } : {}),
      ...(sp.designation ? { designation: sp.designation.trim() } : {}),
      ...(sp.organization ? { organization: sp.organization.trim() } : {}),
      ...(absoluteUrl(sp.photo) ? { avatarUrl: absoluteUrl(sp.photo) } : {}),
      links,
    });
  };

  for (const dateHalls of Object.values(schedule)) {
    for (const sessions of Object.values(dateHalls)) {
      for (const s of sessions) {
        for (const sp of s.cfp_speakers ?? []) visit(sp);
      }
    }
  }
  return byName;
}

export interface FossUnitedNormalizationInput {
  eventId: string;
  event: FosuEventDoc;
  schedule: FosuSchedule;
  proposals: FosuProposal[];
  proposalDetails?: Record<string, FosuProposalDetail>;
  booths?: import('@indiafoss/model').Booth[];
}

/**
 * Normalize captured FOSS United API payloads into the canonical
 * {@link EventBundle}. Pure and deterministic — no network, no clock.
 */
export function normalizeFossUnited(input: FossUnitedNormalizationInput): EventBundle {
  const { eventId, event, schedule, proposals, proposalDetails = {}, booths = [] } = input;

  const proposalByCfp = new Map<string, FosuProposal>();
  for (const p of proposals) proposalByCfp.set(p.name, p);

  const halls = buildHalls(event, schedule);
  const people = buildPeople(schedule);

  const activities: Activity[] = [];
  for (const dateHalls of Object.values(schedule)) {
    for (const [hallName, sessions] of Object.entries(dateHalls)) {
      const hall = halls.get(hallName);
      if (!hall) continue;
      for (const s of sessions) {
        const cfp = s.linked_cfp ? proposalByCfp.get(s.linked_cfp) : undefined;
        const detail = s.linked_cfp ? proposalDetails[s.linked_cfp] : undefined;
        const cancelled = cfp != null && (cfp.status === 'Rejected' || cfp.status === 'Withdrawn');

        const speakerIds: string[] = [];
        for (const sp of s.cfp_speakers ?? []) {
          const name = (sp.full_name ?? '').trim();
          if (!name) continue;
          for (const [pid, person] of people) {
            if (person.name === name) {
              speakerIds.push(pid);
              break;
            }
          }
        }

        const tags = [
          s.category,
          s.other_category,
          cfp?.session_type,
          cfp?.session_categories,
          cfp?.intended_audience,
        ]
          .filter((t): t is string => Boolean(t))
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        const uniqueTags = [...new Set(tags)];

        const start = toIsoInKolkata(s.scheduled_date, s.start_time);
        const end = toIsoInKolkata(s.scheduled_date, s.end_time);

        activities.push({
          id: `act-${s.name}`,
          sourceId: s.name,
          type: resolveType(s, proposalByCfp),
          title: cleanTitle(
            s.title || s.talk_title || s.proposal_title || cfp?.talk_title || 'Untitled',
          ),
          ...(s.other_category || cfp?.session_type
            ? { subtitle: s.other_category ?? cfp?.session_type }
            : {}),
          ...(detail?.description || s.schedule_description
            ? { description: detail?.description ?? s.schedule_description }
            : {}),
          ...(detail?.keyTakeaways.length ? { keyTakeaways: detail.keyTakeaways } : {}),
          ...(detail?.references.length ? { references: detail.references } : {}),
          ...(detail?.links.length ? { links: detail.links } : {}),
          ...(cfp?.intended_audience ? { audience: cfp.intended_audience } : {}),
          ...(cfp?.status ? { proposalStatus: cfp.status } : {}),
          ...(detail?.sourceUrl ? { sourceUrl: detail.sourceUrl } : {}),
          start,
          end,
          flexible: false,
          locationId: hall.location.id,
          speakerIds,
          tags: uniqueTags,
          trackId: hall.track.id,
          ...(hallName.toLowerCase().startsWith('devroom') ? { devroomId: hall.location.id } : {}),
          ...(s.talk_video ? { recordingUrl: s.talk_video } : {}),
          ...(detail?.slidesUrl ? { slidesUrl: detail.slidesUrl } : {}),
          ...(cancelled ? { cancelled: true } : {}),
          source: 'fossunited',
        });
      }
    }
  }

  // Deterministic ordering: by start time, then title.
  activities.sort(
    (a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.title.localeCompare(b.title),
  );

  const locations = [...halls.values()]
    .map((h) => h.location)
    .sort((a, b) => a.id.localeCompare(b.id));
  const tracks = [...halls.values()].map((h) => h.track).sort((a, b) => a.id.localeCompare(b.id));
  const peopleList = [...people.values()].sort((a, b) => a.id.localeCompare(b.id));

  return {
    schemaVersion: EVENT_BUNDLE_SCHEMA_VERSION,
    id: eventId,
    name: event.event_name || eventId,
    timezone: FOSSU_TIMEZONE,
    start: frappeDateTimeToIso(event.event_start_date) ?? '',
    end: frappeDateTimeToIso(event.event_end_date) ?? '',
    activities,
    people: peopleList,
    locations,
    booths,
    tracks,
    sourceMetadata: {
      source: 'fossunited',
      ...(event.modified ? { sourceUpdatedAt: event.modified } : {}),
      normalizerVersion: NORMALIZER_VERSION,
    },
  };
}
