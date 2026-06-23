import { describe, it, expect } from 'vitest';
import { allEnemyDefs, getEnemyDef } from '@/enemies/enemy-defs';
import { getDropTable } from '@/loot/drop-table';
import { getEquipment } from '@/data/items';

describe('enemy roster + boss', () => {
  it('ships 3 normal enemies and one boss per area', () => {
    const defs = allEnemyDefs();
    expect(defs.filter((d) => !d.isBoss).length).toBeGreaterThanOrEqual(3);
    expect(defs.filter((d) => d.isBoss).length).toBe(3);
  });

  it('every boss has a guaranteed first-kill equipment reward', () => {
    for (const boss of allEnemyDefs().filter((d) => d.isBoss)) {
      const table = getDropTable(boss.dropTableId!)!;
      const guaranteed = table.entries.find((e) => e.bossFirstGuaranteed);
      expect(guaranteed, boss.id).toBeDefined();
      expect(getEquipment(guaranteed!.itemId), boss.id).toBeDefined();
    }
  });

  it('every enemy with a drop table references a real table', () => {
    for (const d of allEnemyDefs()) {
      if (d.dropTableId) expect(getDropTable(d.dropTableId), d.id).toBeDefined();
    }
    expect(getEnemyDef('boss_slime')).toBeDefined();
  });
});
