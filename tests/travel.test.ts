import { describe, it, expect } from 'vitest';
import { travelMaps, allMaps } from '@/maps/map-def';

describe('fast-travel map list', () => {
  it('lists non-hidden maps sorted by travel.order', () => {
    const list = travelMaps();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m) => !m.travel?.hidden)).toBe(true);
    const orders = list.map((m) => m.travel?.order ?? 999);
    for (let i = 1; i < orders.length; i++) expect(orders[i]).toBeGreaterThanOrEqual(orders[i - 1]);
  });

  it('town is first and every listed map has a name', () => {
    const list = travelMaps();
    expect(list[0]?.id).toBe('town');
    for (const m of list) expect(m.name.length).toBeGreaterThan(0);
  });

  it('does not exceed the full map set', () => {
    expect(travelMaps().length).toBeLessThanOrEqual(allMaps().length);
  });
});
