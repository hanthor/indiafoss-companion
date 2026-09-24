/** A box on screen, by its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelInput {
  id: string;
  /** Where the room's anchor sits on screen: the label's preferred centre. */
  x: number;
  y: number;
  /** The label with the live talk under the name. */
  full: { w: number; h: number };
  /** The room name alone. */
  pin: { w: number; h: number };
  /** Higher places first and keeps its full label; ties keep input order. */
  priority: number;
}

export interface LabelPlacement {
  mode: 'full' | 'pin';
  /** Centre on screen. */
  x: number;
  y: number;
}

const GAP = 4;
const RINGS = 3;
/** Above and below first: a label read straight up or down still reads as its room's. */
const DIRECTIONS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Places room labels so none covers another or the map's own controls.
 *
 * Labels go in priority order. Each tries its full card on the room, then
 * moved clear above or below it, then shrinks to the room name alone and
 * tries rings of spots around the room, nearest first. A label with nowhere
 * free keeps the name alone where it covers least.
 */
export function layoutLabels(
  labels: readonly LabelInput[],
  obstacles: readonly Rect[],
  bounds: { w: number; h: number },
): Map<string, LabelPlacement> {
  const placed: Rect[] = obstacles.map((o) => ({
    x: o.x - GAP,
    y: o.y - GAP,
    w: o.w + 2 * GAP,
    h: o.h + 2 * GAP,
  }));
  const out = new Map<string, LabelPlacement>();
  const order = labels
    .map((label, i) => ({ label, i }))
    .sort((a, b) => b.label.priority - a.label.priority || a.i - b.i);

  const rectAt = (size: { w: number; h: number }, cx: number, cy: number): Rect => {
    const x = Math.min(Math.max(cx - size.w / 2, 0), Math.max(0, bounds.w - size.w));
    const y = Math.min(Math.max(cy - size.h / 2, 0), Math.max(0, bounds.h - size.h));
    return { x, y, w: size.w, h: size.h };
  };

  for (const { label } of order) {
    const { x, y, full, pin } = label;
    const candidates: { mode: 'full' | 'pin'; rect: Rect }[] = [
      { mode: 'full', rect: rectAt(full, x, y) },
      { mode: 'full', rect: rectAt(full, x, y - full.h - GAP) },
      { mode: 'full', rect: rectAt(full, x, y + full.h + GAP) },
      { mode: 'pin', rect: rectAt(pin, x, y) },
    ];
    // Then the name alone in rings around the room, nearest first.
    for (let ring = 1; ring <= RINGS; ring++) {
      const dx = (pin.w + GAP) * ring;
      const dy = (pin.h + GAP) * ring;
      for (const [sx, sy] of DIRECTIONS) {
        candidates.push({ mode: 'pin', rect: rectAt(pin, x + sx * dx, y + sy * dy) });
      }
    }
    let pick = candidates.find((c) => !placed.some((p) => overlaps(c.rect, p)));
    if (!pick) {
      const covered = (r: Rect) => placed.reduce((sum, p) => sum + overlapArea(r, p), 0);
      pick = candidates
        .filter((c) => c.mode === 'pin')
        .reduce((best, c) => (covered(c.rect) < covered(best.rect) ? c : best));
    }
    placed.push(pick.rect);
    out.set(label.id, {
      mode: pick.mode,
      x: pick.rect.x + pick.rect.w / 2,
      y: pick.rect.y + pick.rect.h / 2,
    });
  }
  return out;
}
