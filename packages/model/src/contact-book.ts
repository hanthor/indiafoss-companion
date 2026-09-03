import type { AttendeeProfile } from './contact.js';
import { parseVCard } from './scan.js';

/**
 * A saved contact as the app stores it. Structurally the storage
 * `ContactRecord`, declared here so the model package stays free of a
 * dependency on the storage layer.
 */
export interface ContactBookEntry {
  id: string;
  vcard: string;
  fullName: string;
  organization?: string;
  email?: string;
  phone?: string;
  website?: string;
  fossUnitedProfileUrl?: string;
  avatarUrl?: string;
  matrixId?: string;
  neutrinoServerName?: string;
  ticketRef?: string;
  socials: Record<string, string>;
  verified: boolean;
  savedAt: string;
  eventId?: string;
  publicKey?: string;
  fingerprint?: string;
  signature?: 'valid' | 'invalid' | 'unsigned';
  metActivityId?: string;
  metLocationId?: string;
  metCount?: number;
  lastMetAt?: string;
  keyChanged?: boolean;
  /** Whether the card's Matrix id was verified against that account's profile (issue #111). */
  meshLink?: { state: 'verified' | 'mismatch' | 'unlinked' | 'unverifiable'; checkedAt: number };
  previousFingerprint?: string;
}

export const CONTACT_BOOK_VERSION = 1;

export interface ContactBookExport {
  kind: 'indiafoss-contact-book';
  version: number;
  exportedAt: string;
  eventId?: string;
  contacts: ContactBookEntry[];
}

/**
 * Everything the attendee scanned, as one JSON document. Keeps the fields the
 * app understands (meeting context, key badge, mesh id) that a vCard cannot
 * carry, so an export/import round-trip loses nothing.
 */
export function contactBookToJson(
  contacts: ContactBookEntry[],
  exportedAt: string,
  eventId?: string,
): string {
  const doc: ContactBookExport = {
    kind: 'indiafoss-contact-book',
    version: CONTACT_BOOK_VERSION,
    exportedAt,
    ...(eventId ? { eventId } : {}),
    contacts,
  };
  return JSON.stringify(doc, null, 2);
}

/**
 * All contacts as one multi-entry vCard file, for phone address books and
 * anything else that reads .vcf. Entries without a stored vCard are skipped.
 */
export function contactBookToVCards(contacts: ContactBookEntry[]): string {
  return contacts
    .map((c) => c.vcard?.trim())
    .filter((v): v is string => !!v)
    .map((v) => (v.endsWith('\r\n') ? v : `${v}\r\n`))
    .join('');
}

/** Split a multi-entry .vcf into its individual vCards. */
export function splitVCards(text: string): string[] {
  const out: string[] = [];
  const re = /BEGIN:VCARD[\s\S]*?END:VCARD/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) out.push(match[0]);
  return out;
}

export interface ContactBookImport {
  /** Entries ready to reconcile against the existing contact list. */
  entries: ContactBookEntry[];
  format: 'json' | 'vcard';
  /** Entries in the file that could not be read. */
  skipped: number;
}

function entryFromProfile(
  profile: AttendeeProfile,
  vcard: string,
  savedAt: string,
  id: string,
): ContactBookEntry {
  return {
    id,
    vcard,
    fullName: profile.fullName || profile.matrixId || 'Unnamed contact',
    ...(profile.organization ? { organization: profile.organization } : {}),
    ...(profile.email ? { email: profile.email } : {}),
    ...(profile.phone ? { phone: profile.phone } : {}),
    ...(profile.website ? { website: profile.website } : {}),
    ...(profile.fossUnitedProfileUrl ? { fossUnitedProfileUrl: profile.fossUnitedProfileUrl } : {}),
    ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
    ...(profile.matrixId ? { matrixId: profile.matrixId } : {}),
    ...(profile.neutrinoServerName ? { neutrinoServerName: profile.neutrinoServerName } : {}),
    ...(profile.ticketRef ? { ticketRef: profile.ticketRef } : {}),
    socials: { ...profile.socials },
    verified: false,
    savedAt,
  };
}

/**
 * Read a previously exported contact book. Accepts this app's JSON export
 * (which round-trips every field) and any multi-entry .vcf. `newId` supplies
 * ids for vCard entries, which carry none.
 */
export function parseContactBook(
  text: string,
  savedAt: string,
  newId: () => string,
): ContactBookImport | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    let doc: unknown;
    try {
      doc = JSON.parse(trimmed);
    } catch {
      return null;
    }
    const parsed = doc as Partial<ContactBookExport>;
    if (parsed?.kind !== 'indiafoss-contact-book' || !Array.isArray(parsed.contacts)) return null;
    const entries: ContactBookEntry[] = [];
    let skipped = 0;
    for (const raw of parsed.contacts) {
      const entry = raw as Partial<ContactBookEntry>;
      if (!entry || typeof entry.fullName !== 'string' || !entry.fullName.trim()) {
        skipped++;
        continue;
      }
      entries.push({
        ...entry,
        id: typeof entry.id === 'string' && entry.id ? entry.id : newId(),
        vcard: typeof entry.vcard === 'string' ? entry.vcard : '',
        fullName: entry.fullName,
        socials: entry.socials && typeof entry.socials === 'object' ? { ...entry.socials } : {},
        verified: false,
        savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : savedAt,
      } as ContactBookEntry);
    }
    return { entries, format: 'json', skipped };
  }

  const cards = splitVCards(trimmed);
  if (cards.length === 0) return null;
  const entries: ContactBookEntry[] = [];
  let skipped = 0;
  for (const card of cards) {
    const profile = parseVCard(card);
    if (!profile || !profile.fullName.trim()) {
      skipped++;
      continue;
    }
    entries.push(entryFromProfile(profile, card, savedAt, newId()));
  }
  return { entries, format: 'vcard', skipped };
}

export interface MetGroup {
  /** ISO date (YYYY-MM-DD) in the event's timezone, or 'unknown'. */
  day: string;
  contacts: ContactBookEntry[];
}

/**
 * "Who I met", grouped by the day of the first meeting, newest day first and
 * newest contact first within a day.
 */
export function groupByDayMet(contacts: ContactBookEntry[], timeZone: string): MetGroup[] {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const groups = new Map<string, ContactBookEntry[]>();
  for (const c of contacts) {
    const when = c.savedAt;
    let day = 'unknown';
    const ms = Date.parse(when ?? '');
    if (!Number.isNaN(ms)) day = fmt.format(new Date(ms));
    const list = groups.get(day);
    if (list) list.push(c);
    else groups.set(day, [c]);
  }
  return [...groups.entries()]
    .map(([day, list]) => ({
      day,
      contacts: [...list].sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)),
    }))
    .sort((a, b) => {
      if (a.day === 'unknown') return 1;
      if (b.day === 'unknown') return -1;
      return a.day < b.day ? 1 : -1;
    });
}

/**
 * Filter the contact list by a free-text query over name, organization,
 * identifiers and social handles. An empty query returns everything.
 */
export function searchContacts(contacts: ContactBookEntry[], query: string): ContactBookEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return contacts;
  const terms = q.split(/\s+/);
  return contacts.filter((c) => {
    const haystack = [
      c.fullName,
      c.organization,
      c.website,
      c.fossUnitedProfileUrl,
      c.matrixId,
      c.neutrinoServerName,
      // Both sides of the socials map, so "github" finds everyone with a GitHub handle.
      ...Object.entries(c.socials ?? {}).flat(),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return terms.every((t) => haystack.includes(t));
  });
}
