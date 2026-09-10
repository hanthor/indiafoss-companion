import { afterEach, describe, expect, it, vi } from 'vitest';
import { showBrowserNotification } from './browser-notification';

afterEach(() => vi.unstubAllGlobals());
const url = 'https://example.org/companion/plan';
function setup(registration?: object) {
  const constructor = vi.fn(function () {});
  Object.assign(constructor, { permission: 'granted' });
  vi.stubGlobal('Notification', constructor);
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) },
  });
  return constructor;
}

describe('browser notification delivery', () => {
  it('uses the active service worker without invoking the unsupported mobile constructor', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const constructor = setup({ active: {}, showNotification });
    await showBrowserNotification('Reminder', { tag: 'talk', body: 'Soon' }, url);
    expect(showNotification).toHaveBeenCalledWith('Reminder', {
      tag: 'talk',
      body: 'Soon',
      data: { url },
    });
    expect(constructor).not.toHaveBeenCalled();
  });
  it('propagates worker delivery failures rather than reporting a sent test', async () => {
    const constructor = setup({
      active: {},
      showNotification: vi.fn().mockRejectedValue(new Error('blocked')),
    });
    await expect(showBrowserNotification('Test', {}, url)).rejects.toThrow('blocked');
    expect(constructor).not.toHaveBeenCalled();
  });
  it('uses the desktop fallback when there is no active worker, without waiting on ready', async () => {
    const constructor = setup();
    await showBrowserNotification('Test', { tag: 'test' }, url);
    expect(constructor).toHaveBeenCalledWith('Test', { tag: 'test' });
  });
  it('does not show an alert cancelled while looking up the worker', async () => {
    let resolve!: (value: ServiceWorkerRegistration | undefined) => void;
    const showNotification = vi.fn();
    const constructor = setup();
    vi.mocked(navigator.serviceWorker.getRegistration).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    let current = true;
    const showing = showBrowserNotification('Test', {}, url, () => current);
    current = false;
    resolve({ active: {}, showNotification } as unknown as ServiceWorkerRegistration);
    await showing;
    expect(showNotification).not.toHaveBeenCalled();
    expect(constructor).not.toHaveBeenCalled();
  });
  it('rejects permission loss before attempting delivery', async () => {
    const constructor = setup();
    Object.assign(constructor, { permission: 'denied' });
    await expect(showBrowserNotification('Test', {}, url)).rejects.toThrow('permission');
    expect(constructor).not.toHaveBeenCalled();
  });
});
