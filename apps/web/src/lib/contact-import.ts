import { parseVCard } from '@indiafoss/model';
import type { ImportedProfile } from '$lib/fossunited';

/**
 * Fill the card from the attendee's own entry in the phone's contacts (#94):
 * the Contact Picker API where the browser has it (Chrome on Android), a
 * `.vcf` shared out of Contacts everywhere else (iOS, the Android app's
 * WebView). Either way the data never leaves the device.
 */

interface PickedContact {
  name?: string[];
  email?: string[];
  tel?: string[];
}

interface ContactsManager {
  select(properties: string[], options?: { multiple?: boolean }): Promise<PickedContact[]>;
  getProperties?(): Promise<string[]>;
}

function contactsManager(): ContactsManager | null {
  const nav = globalThis.navigator as Navigator & { contacts?: ContactsManager };
  return typeof nav?.contacts?.select === 'function' ? nav.contacts : null;
}

/** True when the browser can open the system contact picker. */
export function hasContactPicker(): boolean {
  return contactsManager() !== null;
}

/** Open the picker for one contact; null when unavailable or dismissed. */
export async function pickContact(): Promise<ImportedProfile | null> {
  const manager = contactsManager();
  if (!manager) return null;
  let picked: PickedContact[];
  try {
    picked = await manager.select(['name', 'email', 'tel'], { multiple: false });
  } catch {
    return null;
  }
  const contact = picked[0];
  if (!contact) return null;
  const profile: ImportedProfile = { socials: {} };
  const name = contact.name?.find((n) => n?.trim());
  if (name) profile.fullName = name.trim();
  const email = contact.email?.find((e) => e?.includes('@'));
  if (email) profile.email = email.trim();
  const tel = contact.tel?.find((t) => t?.trim());
  if (tel) profile.phone = tel.trim();
  return profile;
}

/** A `.vcf` from the phone's Contacts app, read into the same shape. */
export function profileFromContactFile(text: string): ImportedProfile | null {
  const card = parseVCard(text);
  if (!card) return null;
  const profile: ImportedProfile = { socials: { ...card.socials } };
  if (card.fullName) profile.fullName = card.fullName;
  if (card.organization) profile.organization = card.organization;
  if (card.email) profile.email = card.email;
  if (card.phone) profile.phone = card.phone;
  if (card.website) profile.website = card.website;
  if (card.avatarUrl) profile.avatarUrl = card.avatarUrl;
  return profile;
}
