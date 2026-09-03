import { describe, expect, it } from 'vitest';
import { profileFromGithubUser } from './github';

describe('profileFromGithubUser', () => {
  it('maps the public fields the card can use', () => {
    const profile = profileFromGithubUser({
      name: 'James Reilly',
      company: '@fossunited',
      blog: 'reilly.asia',
      avatar_url: 'https://avatars.githubusercontent.com/u/5840441?v=4',
      twitter_username: 'hanthor',
      html_url: 'https://github.com/hanthor',
    });
    expect(profile).toEqual({
      fullName: 'James Reilly',
      organization: 'fossunited',
      website: 'https://reilly.asia',
      avatarUrl: 'https://avatars.githubusercontent.com/u/5840441?v=4',
      socials: { github: 'https://github.com/hanthor', x: 'https://x.com/hanthor' },
    });
  });

  it('leaves out what GitHub does not know', () => {
    expect(profileFromGithubUser({ name: null, company: '', blog: '' })).toEqual({ socials: {} });
  });
});
