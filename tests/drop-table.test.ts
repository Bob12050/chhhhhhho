import { describe, it, expect } from 'vitest';
import { Rng } from '@/core/rng';
import { getDropTable, rollDrops, type DropTable } from '@/loot/drop-table';

const table: DropTable = {
  id: 'test',
  entries: [
    { itemId: 'common', dropRate: 1, min: 1, max: 1 },
    { itemId: 'rare', dropRate: 0.2, min: 1, max: 1 },
    { itemId: 'boss_only', dropRate: 0, min: 1, max: 1, bossFirstGuaranteed: true },
  ],
};

describe('rollDrops', () => {
  it('always yields guaranteed (rate 1) entries', () => {
    for (let s = 0; s < 20; s++) {
      const drops = rollDrops(table, new Rng(s));
      expect(drops.some((d) => d.itemId === 'common')).toBe(true);
    }
  });

  it('respects rare drop rate roughly', () => {
    const rng = new Rng(123);
    let rare = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      if (rollDrops(table, rng).some((d) => d.itemId === 'rare')) rare++;
    }
    expect(rare / N).toBeGreaterThan(0.12);
    expect(rare / N).toBeLessThan(0.28);
  });

  it('boss-guaranteed entries only drop on first kill', () => {
    expect(rollDrops(table, new Rng(1), { firstKill: false }).some((d) => d.itemId === 'boss_only')).toBe(
      false,
    );
    expect(rollDrops(table, new Rng(1), { firstKill: true }).some((d) => d.itemId === 'boss_only')).toBe(
      true,
    );
  });

  it('is reproducible for a fixed seed', () => {
    const a = rollDrops(table, new Rng(99));
    const b = rollDrops(table, new Rng(99));
    expect(a).toEqual(b);
  });

  it('ships a slime_basic table referencing real items', () => {
    const t = getDropTable('slime_basic');
    expect(t).toBeDefined();
    expect(t!.entries.length).toBeGreaterThan(0);
  });
});
