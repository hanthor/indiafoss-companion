import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLOORS, FLOOR_ORDER, anchorPercent, type FloorId } from './venue-floors';

/**
 * The floor vectors both maps draw (issue #657): the web FloorPlan renders
 * them directly and the native client draws the exported `floors.json`.
 * Room ids are the contract the programme resolves against, so they stay
 * stable while the artwork underneath changes.
 */
describe('venue floors', () => {
  it('has both floors in the artwork coordinate spaces', () => {
    expect(FLOOR_ORDER).toEqual(['ground', 'first']);
    expect(FLOORS.ground.viewBox).toBe('0 0 1587 1482');
    expect(FLOORS.first.viewBox).toBe('0 0 1154 1164');
  });

  it('keeps the programme room ids with their legacy keys and capacities', () => {
    expect(FLOORS.ground.rooms.map((r) => r.id)).toEqual([
      'hall-1',
      'hall-2',
      'hall-3',
      'sponsor-booths',
      'hw-showcase',
      'lunch',
    ]);
    expect(FLOORS.first.rooms.map((r) => r.id)).toEqual([
      'room-2',
      'room-3',
      'room-1',
      'hall-1-balcony',
      'silent',
    ]);
    const byId = new Map(FLOOR_ORDER.flatMap((f) => FLOORS[f].rooms.map((r) => [r.id, r] as const)));
    expect(byId.get('hall-1')).toMatchObject({ key: 'audi-1', cap: 750 });
    expect(byId.get('hall-2')).toMatchObject({ key: 'audi-2', cap: 250 });
    expect(byId.get('hall-3')).toMatchObject({ key: 'audi-3', cap: 120 });
    expect(byId.get('room-1')).toMatchObject({ key: 'room-1-7', cap: 100 });
    expect(byId.get('room-2')).toMatchObject({ key: 'room-2-6', cap: 30 });
    expect(byId.get('room-3')).toMatchObject({ key: 'room-3-7', cap: 30 });
    expect(byId.get('hall-1-balcony')).toMatchObject({ key: 'audi-1-ff-3', cap: 200 });
    expect(byId.get('silent')).toMatchObject({ key: 'room-silent-6' });
    expect(byId.get('lunch')).toMatchObject({ key: 'lunch-area' });
  });

  it('anchors every room label inside its own floor', () => {
    for (const id of FLOOR_ORDER) {
      const floor = FLOORS[id];
      for (const room of floor.rooms) {
        expect(room.d.length).toBeGreaterThan(0);
        expect(room.c).toMatch(/^#[0-9a-fA-F]{6}$/);
        const p = anchorPercent(floor, room);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
      }
      expect(floor.outline.length).toBeGreaterThan(0);
      expect(floor.fill.length).toBeGreaterThan(0);
      expect(floor.podiums.length).toBeGreaterThan(0);
      expect(floor.stairs.length).toBeGreaterThan(0);
    }
  });

  it('keeps every mark paint a hex colour, theme ink, or none', () => {
    for (const id of FLOOR_ORDER) {
      const { marks, walls } = FLOORS[id];
      // The artwork's furniture: badges, icons and baked labels.
      expect(marks.length).toBeGreaterThan(0);
      for (const m of marks) {
        expect(m.d.length).toBeGreaterThan(0);
        expect(m.f === 'none' || m.f === 'text' || /^#[0-9a-fA-F]{6}$/.test(m.f)).toBe(true);
        if (m.s !== undefined) {
          expect(m.s === 'text' || /^#[0-9a-fA-F]{6}$/.test(m.s)).toBe(true);
          expect(m.w).toBeGreaterThan(0);
        }
      }
      for (const w of walls) {
        expect(w.d.length).toBeGreaterThan(0);
        expect(w.s).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(w.w).toBeGreaterThan(0);
      }
    }
  });

  it('matches the exported floors.json the native client draws', () => {
    const url = new URL('../../static/venues/indiafoss-2026/floors.json', import.meta.url);
    const exported = JSON.parse(readFileSync(url, 'utf8'));
    expect(exported.floors.map((f: { id: string }) => f.id)).toEqual([...FLOOR_ORDER]);
    for (const floor of exported.floors as { id: FloorId; rooms: unknown[]; marks: unknown[]; walls: unknown[]; stairs: unknown[] }[]) {
      // Same rooms, marks, walls and stairs the web map renders.
      expect(JSON.parse(JSON.stringify(floor.rooms))).toEqual(
        JSON.parse(JSON.stringify(FLOORS[floor.id].rooms)),
      );
      expect(floor.marks.length).toBe(FLOORS[floor.id].marks.length);
      expect(floor.walls.length).toBe(FLOORS[floor.id].walls.length);
      expect(floor.stairs.length).toBe(FLOORS[floor.id].stairs.length);
    }
  });
});
