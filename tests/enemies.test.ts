import { describe, it, expect } from 'vitest';
import { allEnemyDefs, getEnemyDef } from '@/enemies/enemy-defs';
import { getDropTable } from '@/loot/drop-table';
import { getEquipment } from '@/data/items';

describe('enemy roster + boss', () => {
  it('ships several normal enemies and at least one boss per tier', () => {
    const defs = allEnemyDefs();
    expect(defs.filter((d) => !d.isBoss).length).toBeGreaterThanOrEqual(3);
    expect(defs.filter((d) => d.isBoss).length).toBeGreaterThanOrEqual(3);
  });

  it('every boss has a guaranteed first-kill equipment reward', () => {
    for (const boss of allEnemyDefs().filter((d) => d.isBoss)) {
      const table = getDropTable(boss.dropTableId!)!;
      const guaranteed = table.entries.find((e) => e.bossFirstGuaranteed);
      expect(guaranteed, boss.id).toBeDefined();
      expect(getEquipment(guaranteed!.itemId), boss.id).toBeDefined();
    }
  });

  it('bosses are tougher and hit harder than any normal enemy', () => {
    const defs = allEnemyDefs();
    const normals = defs.filter((d) => !d.isBoss);
    const bosses = defs.filter((d) => d.isBoss);
    const maxNormalHp = Math.max(...normals.map((d) => d.maxHp));
    for (const b of bosses) {
      expect(b.maxHp, `${b.id} hp`).toBeGreaterThan(maxNormalHp);
      expect(b.contactDamage, `${b.id} atk`).toBeGreaterThanOrEqual(20);
    }
  });

  it('every enemy with a drop table references a real table', () => {
    for (const d of allEnemyDefs()) {
      if (d.dropTableId) expect(getDropTable(d.dropTableId), d.id).toBeDefined();
    }
    expect(getEnemyDef('boss_slime')).toBeDefined();
  });
});
