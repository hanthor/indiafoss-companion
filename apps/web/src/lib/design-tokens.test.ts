import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Design guard (#33). The 2026 design language lives in the tokens in
 * `app.css`; a raw colour written into a component's `<style>` block is how a
 * screen drifts away from it. The dark-surface text colour, for instance, had
 * been written as `#fff`, `#fafafa` and `#f4f4f4` in a dozen places, so
 * changing it meant finding all three — and a fixed light grey switch track
 * stayed light in dark mode because nothing tied it to a token.
 *
 * Every colour in a component now comes from a token. The exceptions below
 * are deliberate and each says why; anything else fails, with the offending
 * lines named.
 */

/** Colours that are correct as literals, and the reason they are. */
const ALLOWED: { file: string; why: string }[] = [
  {
    file: 'src/routes/scan/+page.svelte',
    why: 'the camera viewfinder backdrop is black in both themes, behind a video',
  },
];

const SRC = new URL('../..', import.meta.url).pathname;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function svelteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...svelteFiles(path));
    else if (entry.endsWith('.svelte')) out.push(path);
  }
  return out;
}

/** The contents of every `<style>` block in a component, with real line numbers. */
function styleLines(source: string): { line: number; text: string }[] {
  const lines = source.split('\n');
  const out: { line: number; text: string }[] = [];
  let inStyle = false;
  lines.forEach((text, i) => {
    if (/<style\b/.test(text)) inStyle = true;
    else if (/<\/style>/.test(text)) inStyle = false;
    else if (inStyle) out.push({ line: i + 1, text });
  });
  return out;
}

describe('design tokens (#33)', () => {
  it('no component writes a raw colour into its styles', () => {
    const offenders: string[] = [];
    for (const path of svelteFiles(join(SRC, 'src'))) {
      const relative = path.slice(SRC.length);
      if (ALLOWED.some((a) => relative === a.file)) continue;
      for (const { line, text } of styleLines(readFileSync(path, 'utf8'))) {
        for (const hex of text.match(HEX) ?? []) {
          offenders.push(`${relative}:${line} uses ${hex} — use a token from app.css`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('declares the roles those literals used to stand for', () => {
    const css = readFileSync(join(SRC, 'src/app.css'), 'utf8');
    // Text on the dark ink surfaces, text on a filled mint surface, and the
    // QR plate that must stay white to scan.
    for (const token of ['--on-ink', '--on-strong', '--qr-plate']) {
      expect(css, `${token} must be declared`).toContain(`${token}:`);
    }
  });
});
