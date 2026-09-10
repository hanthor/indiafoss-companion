import { describe, expect, it } from 'vitest';
import type { ContactCard } from './contact-card.js';
import { asReceived, isPresentable } from './contact-card.js';

const NODE = '845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e';

const card: ContactCard = {
  schemaVersion: 1,
  cardKey: 'k3Yb64url',
  profile: { displayName: 'Asha' },
  accounts: [
    { userId: '@asha:indiafoss.org', kind: 'classic', trust: 'verified' },
    { userId: `@n:${NODE}`, kind: 'mesh', trust: 'binding-valid' },
  ],
  issuedAt: '2026-09-26T10:00:00.000Z',
};

describe('asReceived', () => {
  it('downgrades every claim to claimed, whatever the wire said', () => {
    // A card is authored by the person presenting it. Accepting its own trust
    // values would let anyone mark themselves verified.
    expect(asReceived(card).accounts.map((a) => a.trust)).toEqual(['claimed', 'claimed']);
  });

  it('leaves the rest of the card untouched', () => {
    const received = asReceived(card);
    expect(received.cardKey).toBe(card.cardKey);
    expect(received.profile).toEqual(card.profile);
    expect(received.accounts.map((a) => a.userId)).toEqual(card.accounts.map((a) => a.userId));
  });

  it('does not mutate the input', () => {
    asReceived(card);
    expect(card.accounts[0]?.trust).toBe('verified');
  });
});

describe('isPresentable', () => {
  const now = new Date('2026-09-27T10:00:00.000Z');

  it('treats a card with no expiry as always presentable', () => {
    expect(isPresentable(card, now)).toBe(true);
  });

  it('stops presenting a card past its expiry', () => {
    expect(isPresentable({ ...card, expiresAt: '2026-09-26T12:00:00.000Z' }, now)).toBe(false);
  });

  it('still presents a card that has not expired yet', () => {
    expect(isPresentable({ ...card, expiresAt: '2026-10-26T10:00:00.000Z' }, now)).toBe(true);
  });
});
