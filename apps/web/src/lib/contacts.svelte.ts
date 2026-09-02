import { CompanionStorage } from '@indiafoss/storage';
import type { ContactRecord } from '@indiafoss/storage';
import { attendeeProfileToVCard } from '@indiafoss/model';
import type { AttendeeProfile, FriendPayload } from '@indiafoss/model';
import { parseContactBook } from '@indiafoss/model';
import { reconcileContact } from '$lib/contact-continuity';
import type { ContinuityResult } from '$lib/contact-continuity';

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

/** Locally saved contacts from QR exchange (§42). */
export const contactsState = $state<{ contacts: ContactRecord[]; hydrated: boolean }>({
  contacts: [],
  hydrated: false,
});

export async function hydrateContacts(): Promise<void> {
  if (contactsState.hydrated) return;
  contactsState.contacts = await getStorage().listContacts();
  contactsState.hydrated = true;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `contact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface MeetingContext {
  activityId?: string;
  locationId?: string;
}

/** Build a contact from a scanned vCard; nothing is saved until the user confirms. */
export function contactFromVCard(
  card: AttendeeProfile,
  vcard: string,
  eventId?: string,
  identity?: {
    fingerprint?: string;
    signature?: 'valid' | 'invalid' | 'unsigned';
    publicKey?: string;
  },
  met?: MeetingContext,
): ContactRecord {
  return {
    id: newId(),
    vcard,
    ...(identity?.publicKey ? { publicKey: identity.publicKey } : {}),
    ...(identity?.fingerprint ? { fingerprint: identity.fingerprint } : {}),
    ...(identity?.signature ? { signature: identity.signature } : {}),
    ...(met?.activityId ? { metActivityId: met.activityId } : {}),
    ...(met?.locationId ? { metLocationId: met.locationId } : {}),
    fullName: card.fullName || card.matrixId || 'Unnamed contact',
    organization: card.organization,
    email: card.email,
    phone: card.phone,
    website: card.website,
    fossUnitedProfileUrl: card.fossUnitedProfileUrl,
    matrixId: card.matrixId,
    neutrinoServerName: card.neutrinoServerName,
    ticketRef: card.ticketRef,
    socials: { ...card.socials } as Record<string, string>,
    verified: false,
    savedAt: nowIso(),
    eventId,
  };
}

export function contactFromFriend(
  friend: FriendPayload,
  eventId?: string,
  identity?: { fingerprint?: string; signature?: 'valid' | 'invalid' | 'unsigned' },
  met?: MeetingContext,
): ContactRecord {
  const vcard = attendeeProfileToVCard(
    {
      fullName: friend.fullName ?? '',
      organization: friend.organization,
      website: friend.website,
      matrixId: friend.matrixId,
      neutrinoServerName: friend.neutrinoServerName,
      fossUnitedProfileUrl: friend.fossUnitedProfileUrl,
      socials: friend.socials,
    },
    {
      name: true,
      organization: true,
      email: false,
      phone: false,
      website: true,
      matrixId: true,
      neutrinoServerName: true,
      ticketRef: false,
      fossUnitedProfileUrl: true,
      socials: Object.fromEntries(Object.keys(friend.socials).map((k) => [k, true])),
    },
  );
  return {
    id: newId(),
    vcard,
    fullName:
      friend.fullName ??
      friend.matrixId ??
      friend.neutrinoServerName?.slice(0, 12) ??
      'Unnamed contact',
    organization: friend.organization,
    website: friend.website,
    fossUnitedProfileUrl: friend.fossUnitedProfileUrl,
    matrixId: friend.matrixId,
    neutrinoServerName: friend.neutrinoServerName,
    ticketRef: friend.ticketRef,
    socials: { ...friend.socials } as Record<string, string>,
    verified: false,
    savedAt: nowIso(),
    eventId: friend.eventId ?? eventId,
    publicKey: friend.publicKey,
    fingerprint: identity?.fingerprint,
    signature: identity?.signature ?? (friend.publicKey ? 'unsigned' : undefined),
    metActivityId: met?.activityId,
    metLocationId: met?.locationId,
  };
}

export function contactFromMatrixId(userId: string, eventId?: string): ContactRecord {
  return {
    id: newId(),
    vcard: attendeeProfileToVCard(
      { fullName: userId, matrixId: userId, socials: {} },
      {
        name: true,
        organization: false,
        email: false,
        phone: false,
        website: false,
        matrixId: true,
        neutrinoServerName: false,
        ticketRef: false,
        fossUnitedProfileUrl: false,
        socials: {},
      },
    ),
    fullName: userId,
    matrixId: userId,
    socials: {},
    verified: false,
    savedAt: nowIso(),
    eventId,
  };
}

/** Save a scanned card with key continuity against the existing list. */
export async function saveScannedContact(draft: ContactRecord): Promise<ContinuityResult> {
  await hydrateContacts();
  const result = reconcileContact(draft, contactsState.contacts);
  await saveContact(result.contact);
  return result;
}

export async function saveContact(contact: ContactRecord): Promise<void> {
  await getStorage().saveContact(contact);
  contactsState.contacts = [contact, ...contactsState.contacts.filter((c) => c.id !== contact.id)];
}

export async function deleteContact(id: string): Promise<void> {
  await getStorage().deleteContact(id);
  contactsState.contacts = contactsState.contacts.filter((c) => c.id !== id);
}

export interface ImportOutcome {
  added: number;
  updated: number;
  keyChanged: number;
  skipped: number;
  format: 'json' | 'vcard';
}

/**
 * Import an exported contact book. Every entry goes through the same key
 * continuity rules as a scanned card, so a re-import updates what is already
 * there instead of duplicating it, and a changed key is flagged rather than
 * silently replacing the saved one.
 */
export async function importContactBook(text: string): Promise<ImportOutcome | null> {
  await hydrateContacts();
  const parsed = parseContactBook(text, nowIso(), newId);
  if (!parsed) return null;
  const outcome: ImportOutcome = {
    added: 0,
    updated: 0,
    keyChanged: 0,
    skipped: parsed.skipped,
    format: parsed.format,
  };
  for (const entry of parsed.entries) {
    const result = reconcileContact(entry as ContactRecord, contactsState.contacts);
    await saveContact(result.contact);
    if (result.outcome === 'new') outcome.added++;
    else if (result.outcome === 'updated') outcome.updated++;
    else outcome.keyChanged++;
  }
  return outcome;
}
