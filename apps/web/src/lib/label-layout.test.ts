import { describe, expect, it } from 'vitest';
import { layoutLabels, type LabelInput, type Rect } from './label-layout';

const bounds = { w: 400, h: 400 };
const label = (id: string, x: number, y: number, priority = 1): LabelInput => ({
  id,
  x,
  y,
  full: { w: 120, h: 50 },
  pin: { w: 60, h: 20 },
  priority,
});

function rectOf(l: LabelInput, p: { mode: 'full' | 'pin'; x: number; y: number }): Rect {
  const s = p.mode === 'full' ? l.full : l.pin;
  return { x: p.x - s.w / 2, y: p.y - s.h / 2, w: s.w, h: s.h };
}

function intersect(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('layoutLabels', () => {
  it('leaves labels that have room where they are', () => {
    const out = layoutLabels([label('a', 100, 100), label('b', 300, 300)], [], bounds);
    expect(out.get('a')).toEqual({ mode: 'full', x: 100, y: 100 });
    expect(out.get('b')).toEqual({ mode: 'full', x: 300, y: 300 });
  });

  it('never lets two labels cover each other when there is space', () => {
    const labels = [label('a', 200, 200), label('b', 230, 210), label('c', 180, 190)];
    const out = layoutLabels(labels, [], bounds);
    const rects = labels.map((l) => rectOf(l, out.get(l.id)!));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++)
        expect(intersect(rects[i]!, rects[j]!)).toBe(false);
  });

  it('keeps the higher priority label full and shrinks the other', () => {
    const labels = [label('low', 200, 200, 1), label('high', 205, 200, 3)];
    const out = layoutLabels(labels, [], { w: 240, h: 110 });
    expect(out.get('high')!.mode).toBe('full');
    expect(out.get('low')!.mode).toBe('pin');
  });

  it('moves a label off the map controls', () => {
    const zoom: Rect = { x: 150, y: 175, w: 100, h: 50 };
    const l = label('a', 200, 200);
    const out = layoutLabels([l], [zoom], bounds);
    expect(intersect(rectOf(l, out.get('a')!), zoom)).toBe(false);
  });

  it('keeps every label inside the map', () => {
    const l = label('a', 5, 395);
    const r = rectOf(l, layoutLabels([l], [], bounds).get('a')!);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(400);
  });
});
