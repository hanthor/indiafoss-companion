import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../../static/notification-events.js', import.meta.url),
  'utf8',
);
async function click(url: unknown, clientUrl?: string) {
  let listener!: (event: unknown) => void;
  const focus = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn().mockResolvedValue({ focus });
  const openWindow = vi.fn().mockResolvedValue(undefined);
  runInNewContext(source, {
    URL,
    self: {
      registration: { scope: 'https://example.org/companion/' },
      addEventListener: (_: string, handler: typeof listener) => {
        listener = handler;
      },
      clients: {
        matchAll: async () => (clientUrl ? [{ url: clientUrl, navigate }] : []),
        openWindow,
      },
    },
  });
  let completed!: Promise<void>;
  const close = vi.fn();
  listener({
    notification: { data: { url }, close },
    waitUntil: (promise: Promise<void>) => {
      completed = promise;
    },
  });
  await completed;
  expect(close).toHaveBeenCalledOnce();
  return { focus, navigate, openWindow };
}

it('opens the session in an existing Companion window and focuses it', async () => {
  const result = await click(
    'https://example.org/companion/activity/talk',
    'https://example.org/companion/settings',
  );
  expect(result.navigate).toHaveBeenCalledWith('https://example.org/companion/activity/talk');
  expect(result.focus).toHaveBeenCalledOnce();
  expect(result.openWindow).not.toHaveBeenCalled();
});
it('opens a new app window without navigating a different project on the same host', async () => {
  const result = await click(
    'https://example.org/companion/activity/talk',
    'https://example.org/other/',
  );
  expect(result.navigate).not.toHaveBeenCalled();
  expect(result.openWindow).toHaveBeenCalledWith('https://example.org/companion/activity/talk');
});
it.each([
  'https://evil.example/',
  'https://example.org/other/',
  'javascript:alert(1)',
  '../outside',
  null,
])('sends an unsafe or absent destination to the scoped plan: %s', async (url) => {
  const result = await click(url);
  expect(result.openWindow).toHaveBeenCalledWith('https://example.org/companion/plan');
});
