import { describe, expect, it } from 'vitest';
import type { BindingVerification, IdentityBinding } from './identity-binding.js';
import { mayActOn, pendingVerification } from './identity-binding.js';

const NODE = '845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e';
const NOW = new Date('2026-09-26T12:00:00.000Z');

const binding: IdentityBinding = {
  schemaVersion: 1,
  id: 'b-1',
  meshNodeId: NODE,
  matrixUserId: '@asha:indiafoss.org',
  matrixDeviceId: 'ABCDEFGH',
  scope: 'routing',
  issuedAt: '2026-09-26T10:00:00.000Z',
};

const verified: BindingVerification = {
  bindingId: 'b-1',
  signaturesValid: true,
  deviceTrust: 'user-verified',
  checkedAt: '2026-09-26T11:00:00.000Z',
  presentAsVerified: true,
};

describe('pendingVerification', () => {
  it('is never presentable as verified', () => {
    expect(pendingVerification('b-1', NOW.toISOString()).presentAsVerified).toBe(false);
  });
});

describe('mayActOn', () => {
  it('allows display without any verification at all', () => {
    expect(mayActOn(binding, undefined, 'display', NOW)).toBe(true);
  });

  it('refuses continuation when the binding was never verified', () => {
    expect(mayActOn(binding, undefined, 'continuation', NOW)).toBe(false);
  });

  it('refuses routing on a valid signature from an unverified device', () => {
    const signedButUntrusted: BindingVerification = {
      ...verified,
      deviceTrust: 'unverified',
      presentAsVerified: false,
    };
    expect(mayActOn(binding, signedButUntrusted, 'routing', NOW)).toBe(false);
  });

  it('allows routing only once the signing device is user-verified', () => {
    expect(mayActOn(binding, verified, 'routing', NOW)).toBe(true);
  });

  it('refuses a scope wider than the binding itself claims', () => {
    const displayOnly: IdentityBinding = { ...binding, scope: 'display' };
    expect(mayActOn(displayOnly, verified, 'routing', NOW)).toBe(false);
  });

  it('refuses an expired binding even when fully verified', () => {
    const expired: IdentityBinding = { ...binding, expiresAt: '2026-09-26T11:00:00.000Z' };
    expect(mayActOn(expired, verified, 'display', NOW)).toBe(false);
  });
});
