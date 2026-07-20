import { describe, it, expect } from 'vitest';
import { allEnemyDefs, getEnemyDef } from '@/enemies/enemy-defs';
import { getDropTable } from '@/loot/drop-table';
import { getEquipment } from '@/data/items';
import { allQuests } from '@/quests/quest-defs';

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

  it('within each hunt, the boss out-stats its own trash waves', () => {
    // 2026-07: late-game field mobs (雪原/砂漠) legitimately out-stat early
    // bosses, so a roster-wide "boss > any normal" check no longer holds.
    // The invariant that matters: inside one hunt quest, the boss must be
    // the toughest thing on the arena floor.
    for (const q of allQuests()) {
      const targets = q.objectives
        .filter((o) => o.type === 'kill' && o.enemyId)
        .map((o) => getEnemyDef(o.enemyId!)!);
      const boss = targets.find((d) => d.isBoss);
      if (!boss) continue;
      for (const trash of targets.filter((d) => !d.isBoss)) {
        expect(boss.maxHp, `${q.id}: ${boss.id} vs ${trash.id} hp`).toBeGreaterThan(trash.maxHp);
        expect(boss.contactDamage, `${q.id}: ${boss.id} vs ${trash.id} atk`).toBeGreaterThan(
          trash.contactDamage,
        );
      }
    }
    for (const b of allEnemyDefs().filter((d) => d.isBoss)) {
      expect(b.contactDamage, `${b.id} atk`).toBeGreaterThanOrEqual(20);
    }
  });

  it('every enemy with a drop table references a real table', () => {
    for (const d of allEnemyDefs()) {
      if (d.dropTableId) expect(getDropTable(d.dropTableId), d.id).toBeDefined();
    }
    expect(getEnemyDef('boss_slime')).toBeDefined();
  });

  it('keeps the harmless starter slime separate from royal slime bosses', () => {
    expect(getEnemyDef('slime')?.textureKey).toBe('gen.enemy.slime');
    for (const id of ['boss_slime', 'boss_slime_abyss', 'boss_aurum', 'boss_crimson_abyss']) {
      expect(getEnemyDef(id)?.textureKey, id).toBe('gen.enemy.slime_royal');
    }
  });

  it('offers large-monster hunts from quest rank 1', () => {
    const rankOneBossHunts = allQuests().filter((quest) => (
      (quest.rank ?? 1) === 1
      && !!quest.huntMap
      && quest.objectives.some((objective) => (
        objective.type === 'kill'
        && !!objective.enemyId
        && getEnemyDef(objective.enemyId)?.isBoss === true
      ))
    ));
    expect(rankOneBossHunts.length).toBeGreaterThanOrEqual(2);
  });
});
