import { describe, expect, it } from 'vitest';
import { __dictionaries, LOCALES } from './i18n-messages';

describe('translations', () => {
  const en = __dictionaries.en;
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  for (const locale of LOCALES) {
    it(`${locale} has every key, none empty, with the same placeholders`, () => {
      const dict = __dictionaries[locale];
      expect(Object.keys(dict).sort()).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        expect(dict[key], key).toBeTruthy();
        expect(placeholders(dict[key]!), key).toEqual(placeholders(text));
      }
    });
  }
});
