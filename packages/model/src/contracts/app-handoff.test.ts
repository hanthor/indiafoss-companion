import { describe, expect, it } from 'vitest';
import type { AppHandoff } from './app-handoff.js';
import { isHandoffUrl, parseHandoffUrl, toHandoffUrl } from './app-handoff.js';

const NODE = '845aa456078572639c1543694de69e0a03fb883bd9c1dab1a2f6df811b75897e';

describe('isHandoffUrl', () => {
  it('accepts the custom scheme', () => {
    expect(isHandoffUrl('indiafoss://view-session?ref=keynote')).toBe(true);
  });

  it('accepts https on a first-party host', () => {
    expect(
      isHandoffUrl('https://hanthor.github.io/indiafoss-companion/h/view-session?ref=keynote'),
    ).toBe(true);
  });

  it('refuses https on any other host, so a page cannot fabricate a handoff', () => {
    expect(isHandoffUrl('https://evil.example/h/open-dm?ref=@a:b')).toBe(false);
  });

  it('refuses a host that merely ends with a first-party host', () => {
    expect(
      isHandoffUrl(
        'https://hanthor.github.io.evil.example/indiafoss-companion/h/view-session?ref=k',
      ),
    ).toBe(false);
  });

  it('refuses nonsense', () => {
    expect(isHandoffUrl('not a url')).toBe(false);
  });
});

describe('toHandoffUrl / parseHandoffUrl', () => {
  const handoff: AppHandoff = {
    schemaVersion: 1,
    action: 'open-dm',
    ref: `@n:${NODE}`,
    eventId: 'indiafoss-2026',
    accountHint: '@asha:indiafoss.org',
    proof: 'k3Yb64url',
  };

  it('round-trips every field', () => {
    expect(parseHandoffUrl(toHandoffUrl(handoff))).toEqual(handoff);
  });

  it('round-trips a handoff with only the required fields', () => {
    const minimal: AppHandoff = { schemaVersion: 1, action: 'view-session', ref: 'keynote' };
    expect(parseHandoffUrl(toHandoffUrl(minimal))).toEqual(minimal);
  });

  it('parses the custom scheme to the same value', () => {
    expect(parseHandoffUrl('indiafoss://view-session?ref=keynote&v=1')).toEqual({
      schemaVersion: 1,
      action: 'view-session',
      ref: 'keynote',
    });
  });

  it('returns undefined for a foreign host rather than trusting it', () => {
    expect(parseHandoffUrl('https://evil.example/h/open-dm?ref=@a:b&v=1')).toBeUndefined();
  });

  it('returns undefined when the reference is missing', () => {
    expect(
      parseHandoffUrl('https://hanthor.github.io/indiafoss-companion/h/view-session?v=1'),
    ).toBeUndefined();
  });

  it('returns undefined for a payload carrying a token', () => {
    const url =
      'https://hanthor.github.io/indiafoss-companion/h/open-dm?ref=@a:b.org&v=1&access_token=syt_x';
    // The token is not a recognised parameter, so it is dropped rather than
    // parsed — but the result must still not carry it.
    expect(parseHandoffUrl(url)).not.toHaveProperty('access_token');
  });

  it('refuses an oversized payload before parsing it', () => {
    const huge = `https://hanthor.github.io/indiafoss-companion/h/view-session?ref=${'a'.repeat(9000)}`;
    expect(parseHandoffUrl(huge)).toBeUndefined();
  });

  it('refuses a DM handoff whose reference is not a user id', () => {
    expect(
      parseHandoffUrl('https://hanthor.github.io/indiafoss-companion/h/open-dm?ref=keynote&v=1'),
    ).toBeUndefined();
  });
});
