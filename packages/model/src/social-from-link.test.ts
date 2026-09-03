import { describe, expect, it } from 'vitest';
import { socialFromLink } from './contact.js';

describe('socialFromLink', () => {
  it('sorts pasted profile links onto the right network', () => {
    expect(socialFromLink('https://github.com/alice')).toEqual({
      network: 'github',
      value: 'https://github.com/alice',
    });
    expect(socialFromLink('linkedin.com/in/alice')).toEqual({
      network: 'linkedin',
      value: 'https://linkedin.com/in/alice',
    });
    expect(socialFromLink('https://x.com/alice')?.network).toBe('x');
    expect(socialFromLink('https://fosstodon.org/@alice')?.network).toBe('mastodon');
    expect(socialFromLink('https://t.me/alice')?.network).toBe('telegram');
  });

  it('understands fediverse and Bluesky handles', () => {
    expect(socialFromLink('@alice@fosstodon.org')).toEqual({
      network: 'mastodon',
      value: 'https://fosstodon.org/@alice',
    });
    expect(socialFromLink('alice.bsky.social')).toEqual({
      network: 'bluesky',
      value: 'https://bsky.app/profile/alice.bsky.social',
    });
  });

  it('sends an unknown site to the website field and refuses the ambiguous', () => {
    expect(socialFromLink('https://alice.example')).toEqual({
      network: 'website',
      value: 'https://alice.example',
    });
    expect(socialFromLink('@alice')).toBeNull();
    expect(socialFromLink('')).toBeNull();
    expect(socialFromLink('mailto:a@b.c')).toBeNull();
  });
});
