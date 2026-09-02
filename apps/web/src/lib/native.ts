/**
 * Map an `indiafoss://` deep link (§57) to an in-app route. Shared by the
 * Android intent filter (via @capacitor/app) and any web `?link=` handoff.
 * Returns `null` for anything that is not a recognised companion link.
 */
export function routeForDeepLink(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'indiafoss:') return null;
  const host = parsed.hostname.toLowerCase();
  const segment = parsed.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  const id = decodeURIComponent(segment);
  const safeId = /^[a-z0-9._:@#!-]{1,128}$/i.test(id) ? id : '';
  switch (host) {
    case 'event':
      return '/';
    case 'activity':
      return safeId ? `/activity/${encodeURIComponent(safeId)}` : '/schedule';
    case 'booth':
      return safeId ? `/booth/${encodeURIComponent(safeId)}` : '/explore/booths';
    case 'location':
      return safeId ? `/scan?payload=${encodeURIComponent(url)}` : '/map';
    case 'chat':
      return `/chat${parsed.search}`;
    case 'friend':
      return `/scan?payload=${encodeURIComponent(url)}`;
    default:
      return null;
  }
}

/**
 * On Android (Capacitor) listen for `appUrlOpen` and navigate. On the web this
 * is a no-op: the plugin is only imported when running natively, so the PWA
 * bundle never loads it eagerly.
 */
export async function installNativeDeepLinks(
  base: string,
  navigate: (path: string) => Promise<void>,
): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  const open = (url: string) => {
    const route = routeForDeepLink(url);
    if (route) void navigate(`${base}${route}`);
  };
  await App.addListener('appUrlOpen', (event) => open(event.url));
  const launch = await App.getLaunchUrl();
  if (launch?.url) open(launch.url);
}
