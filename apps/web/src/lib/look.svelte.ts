import { browser } from '$app/environment';
import { CompanionStorage } from '@indiafoss/storage';

/**
 * The app's look: the IndiaFOSS 2026 design language (web default) or
 * Material 3 (the Android app's default), see `material.css`. On Android the
 * Material look takes the phone's own colour scheme from the MaterialYou
 * plugin; elsewhere it uses the mint-seeded fallback palette.
 */
export type Look = 'indiafoss' | 'material';

const LOOK_KEY = 'look';

export const lookState = $state<{ look: Look; loaded: boolean; dynamic: boolean }>({
  look: 'indiafoss',
  loaded: false,
  dynamic: false,
});

let storage: CompanionStorage | null = null;
function getStorage(): CompanionStorage {
  storage ??= new CompanionStorage();
  return storage;
}

interface MaterialScheme {
  available: boolean;
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Write the phone's scheme as `--md-*` on the root, for the current colour scheme. */
function applyScheme(scheme: MaterialScheme): void {
  const root = document.documentElement;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const colors = (dark ? scheme.dark : scheme.light) ?? null;
  if (!colors) return;
  for (const [name, value] of Object.entries(colors)) {
    if (/^#[0-9a-f]{6}$/i.test(value)) root.style.setProperty(`--md-${kebab(name)}`, value);
  }
  lookState.dynamic = true;
}

let scheme: MaterialScheme | null = null;

async function loadDynamicColors(): Promise<void> {
  try {
    const { Capacitor, registerPlugin } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const plugin = registerPlugin<{ scheme(): Promise<MaterialScheme> }>('MaterialYou');
    scheme = await plugin.scheme();
    if (scheme.available) {
      applyScheme(scheme);
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (scheme && lookState.look === 'material') applyScheme(scheme);
      });
    }
  } catch {
    /* not on Android, or an older build without the plugin: fallback palette */
  }
}

function render(look: Look): void {
  if (!browser) return;
  const root = document.documentElement;
  if (look === 'material') {
    root.dataset.look = 'material';
    if (scheme?.available) applyScheme(scheme);
  } else {
    delete root.dataset.look;
    for (const name of [...root.style]) {
      if (name.startsWith('--md-')) root.style.removeProperty(name);
    }
    lookState.dynamic = false;
  }
}

/** Android defaults to Material; the web keeps the IndiaFOSS look. `?look=` overrides for one load. */
export async function hydrateLook(forced?: string | null): Promise<void> {
  if (!browser) return;
  const native = await import('@capacitor/core')
    .then(({ Capacitor }) => Capacitor.isNativePlatform())
    .catch(() => false);
  const saved = await getStorage().getSetting(LOOK_KEY);
  const look: Look =
    forced === 'material' || forced === 'indiafoss'
      ? forced
      : saved === 'material' || saved === 'indiafoss'
        ? saved
        : native
          ? 'material'
          : 'indiafoss';
  if (native) await loadDynamicColors();
  lookState.look = look;
  lookState.loaded = true;
  render(look);
}

export async function setLook(look: Look): Promise<void> {
  lookState.look = look;
  render(look);
  await getStorage().setSetting(LOOK_KEY, look);
}
