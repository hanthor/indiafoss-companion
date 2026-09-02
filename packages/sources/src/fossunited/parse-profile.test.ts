import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  parseFossUnitedProfile,
  profileUrlForUsername,
  socialNetworkFor,
  usernameFromProfileUrl,
} from './parse-profile.js';

const fixture = readFileSync(
  fileURLToPath(new URL('./fixtures/profile-james-reilly.html', import.meta.url)),
  'utf8',
);

describe('parseFossUnitedProfile', () => {
  const profile = parseFossUnitedProfile(fixture);

  it('reads the display name and username', () => {
    expect(profile.fullName).toBe('James Reilly');
    expect(profile.username).toBe('james_reilly');
  });

  it('reads the location, personal site and avatar', () => {
    expect(profile.location).toBe('Lucknow');
    expect(profile.website).toBe('https://reilly.asia');
    expect(profile.avatarUrl).toMatch(/^https:\/\//);
  });

  it('reads the social links, including a federated Mastodon host', () => {
    expect(profile.socials).toEqual({
      github: 'https://www.github.com/hanthor',
      mastodon: 'https://techhub.social/@jreilly112',
      linkedin: 'https://www.linkedin.com/in/jreilly112',
    });
  });

  it('reads the about text as plain prose', () => {
    expect(profile.bio).toContain('Living in Lucknow studying Hindi');
    expect(profile.bio).not.toContain('<p>');
  });

  it('returns empty socials for an unrelated page', () => {
    expect(parseFossUnitedProfile('<html><body>nothing</body></html>').socials).toEqual({});
  });
});

describe('socialNetworkFor', () => {
  it.each([
    ['https://github.com/alice', 'github'],
    ['https://www.linkedin.com/in/alice', 'linkedin'],
    ['https://in.linkedin.com/in/alice', 'linkedin'],
    ['https://bsky.app/profile/alice', 'bluesky'],
    ['https://techhub.social/@alice', 'mastodon'],
    ['https://x.com/alice', 'x'],
    ['https://dev.to/alice', 'devto'],
  ])('classifies %s', (url, expected) => {
    expect(socialNetworkFor(url)).toBe(expected);
  });

  it('leaves a personal site unclassified', () => {
    expect(socialNetworkFor('https://reilly.asia')).toBeNull();
    expect(socialNetworkFor('javascript:alert(1)')).toBeNull();
  });
});

describe('usernameFromProfileUrl', () => {
  it('accepts a profile URL', () => {
    expect(usernameFromProfileUrl('https://fossunited.org/u/james_reilly')).toBe('james_reilly');
    expect(usernameFromProfileUrl('https://www.fossunited.org/u/james_reilly/')).toBe(
      'james_reilly',
    );
  });

  it('accepts a bare username or a scheme-less profile path', () => {
    expect(usernameFromProfileUrl('james_reilly')).toBe('james_reilly');
    expect(usernameFromProfileUrl(' @james_reilly ')).toBe('james_reilly');
    expect(usernameFromProfileUrl('fossunited.org/u/james_reilly')).toBe('james_reilly');
  });

  it('rejects other hosts and paths', () => {
    expect(usernameFromProfileUrl('https://example.com/u/alice')).toBeNull();
    expect(usernameFromProfileUrl('https://fossunited.org/c/indiafoss')).toBeNull();
    expect(usernameFromProfileUrl('not a url')).toBeNull();
  });

  it('round-trips a username', () => {
    expect(usernameFromProfileUrl(profileUrlForUsername('alice'))).toBe('alice');
  });
});
