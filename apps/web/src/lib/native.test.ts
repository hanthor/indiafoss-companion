import { describe, expect, it } from 'vitest';
import { routeForDeepLink } from './native.js';

describe('routeForDeepLink', () => {
  it('maps reserved indiafoss:// links to routes', () => {
    expect(routeForDeepLink('indiafoss://event/indiafoss-2026')).toBe('/');
    expect(routeForDeepLink('indiafoss://activity/act-1')).toBe('/activity/act-1');
    expect(routeForDeepLink('indiafoss://booth/booth-9')).toBe('/booth/booth-9');
    expect(routeForDeepLink('indiafoss://location/audi-1')).toBe(
      '/scan?payload=indiafoss%3A%2F%2Flocation%2Faudi-1',
    );
    expect(routeForDeepLink('indiafoss://chat?dm=%40a%3Ab')).toBe('/chat?dm=%40a%3Ab');
    expect(routeForDeepLink('indiafoss://friend?v=1&fn=A')).toBe(
      '/scan?payload=indiafoss%3A%2F%2Ffriend%3Fv%3D1%26fn%3DA',
    );
  });

  it('rejects other schemes, unknown hosts and unsafe ids', () => {
    expect(routeForDeepLink('https://example.org')).toBeNull();
    expect(routeForDeepLink('indiafoss://nope/x')).toBeNull();
    expect(routeForDeepLink('not a url')).toBeNull();
    expect(routeForDeepLink('indiafoss://activity/<script>')).toBe('/schedule');
  });
});
