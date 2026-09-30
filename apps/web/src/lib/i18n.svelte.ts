/** The chosen language, remembered on this device; the words live in i18n-messages.ts. */
import { formatDayLabel } from '@indiafoss/schedule';
import { en, dictionaries, LOCALES, type Locale, type MessageKey } from './i18n-messages';

export { LOCALES, LOCALE_NAMES, type Locale, type MessageKey } from './i18n-messages';

const STORAGE_KEY = 'indiafoss.locale';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function stored(): Locale {
  try {
    const value = typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
    return isLocale(value) ? value : 'en';
  } catch {
    return 'en';
  }
}

export const i18n = $state<{ locale: Locale }>({ locale: stored() });

/** Switch language, remember it on this device, and tell the page's script and screen readers. */
export function setLocale(locale: Locale): void {
  i18n.locale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Private windows may refuse storage; the choice still holds for this visit.
  }
  applyLang();
}

/** Mirror the chosen language onto `<html lang>`. */
export function applyLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.locale;
}

/** The app's word for `key` in the chosen language, with `{name}` placeholders filled. */
export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const template = i18n.locale === 'en' ? en[key] : dictionaries[i18n.locale][key];
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** "Sat 26 Sep", in the chosen language, for an event day (YYYY-MM-DD). */
export function dayLabel(day: string): string {
  // English keeps the app's own "Sat 26 Sep"; en-GB would say "Sept".
  if (i18n.locale === 'en') return formatDayLabel(day);
  const [y, m, d] = day.split('-').map(Number);
  const date = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat(`${i18n.locale}-IN`, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}
