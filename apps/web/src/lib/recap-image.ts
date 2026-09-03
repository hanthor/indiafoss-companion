import type { RecapCardLines } from '$lib/recap';

/**
 * The shareable "who I met" card (#31), drawn on a canvas so it can be saved
 * or handed to the system share sheet as a real image file.
 *
 * Always the dark brand look rather than the viewer's theme: this leaves the
 * device, and it should look like IndiaFOSS wherever it lands. Everything is
 * drawn locally; the picture is never uploaded anywhere.
 */

export const CARD_SIZE = 1080;

const INK = '#141414';
const MINT = '#0fb556';
const PAPER = '#fafafa';
const MUTED = 'rgba(250, 250, 250, 0.72)';

/** Wrap `text` to `maxWidth`, returning the lines. */
function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawRecapCard(canvas: HTMLCanvasElement, lines: RecapCardLines): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;

  context.fillStyle = INK;
  context.fillRect(0, 0, CARD_SIZE, CARD_SIZE);
  // The pixel stripe the app wears along its app bar.
  context.fillStyle = MINT;
  context.fillRect(0, 0, CARD_SIZE, 16);

  const margin = 88;
  let y = 200;

  context.textBaseline = 'alphabetic';
  context.fillStyle = MINT;
  context.font = '600 34px "Space Mono", ui-monospace, monospace';
  context.fillText(lines.title.toUpperCase(), margin, y);

  y += 110;
  context.fillStyle = PAPER;
  context.font = '700 96px Inter, system-ui, sans-serif';
  for (const line of wrap(context, lines.headline, CARD_SIZE - margin * 2)) {
    context.fillText(line, margin, y);
    y += 104;
  }

  if (lines.stats.length > 0) {
    y += 16;
    context.fillStyle = MUTED;
    context.font = '400 38px Inter, system-ui, sans-serif';
    for (const line of wrap(context, lines.stats.join(' · '), CARD_SIZE - margin * 2)) {
      context.fillText(line, margin, y);
      y += 52;
    }
  }

  if (lines.names.length > 0) {
    y += 40;
    context.fillStyle = MINT;
    context.font = '600 28px "Space Mono", ui-monospace, monospace';
    context.fillText('WHO I MET', margin, y);
    y += 54;
    context.fillStyle = PAPER;
    context.font = '400 40px Inter, system-ui, sans-serif';
    for (const name of lines.names) {
      // Stop rather than run off the bottom edge.
      if (y > CARD_SIZE - 140) break;
      context.fillText(name, margin, y);
      y += 52;
    }
  }

  context.fillStyle = MUTED;
  context.font = '400 28px "Space Mono", ui-monospace, monospace';
  context.fillText('Made offline in the IndiaFOSS Companion', margin, CARD_SIZE - 72);
}

/** The card as a PNG, ready to download or share. */
export async function recapCardBlob(lines: RecapCardLines): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  // Web fonts have to be in before the first measureText, or the wrapping is
  // computed against a fallback and the drawn card does not match it.
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  drawRecapCard(canvas, lines);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
