import { afterEach, describe, expect, it } from 'vitest';
import { getEquipment, replaceRuntimeEquipment } from '@/data/items';
import {
  INVESTIGATION_CRYSTAL_ID,
  MAX_INVESTIGATION_UPGRADE,
  dismantleInvestigationEquipment,
  investigationDismantleYield,
  investigationUpgradeBonus,
  investigationUpgradeCost,
  upgradeInvestigationEquipment,
} from '@/endgame/investigation-forge';
import { generateInvestigationEquipment } from '@/endgame/investigation-loot';
import {
  INVESTIGATION_GROUP,
  INVESTIGATION_SEAL_ID,
  syncInvestigationQuests,
} from '@/endgame/investigations';
import { GameState } from '@/player/game-state';
import { replaceRuntimeQuests } from '@/quests/quest-defs';

function stateWithLoot(): { gs: GameState; id: string } {
  const gs = new GameState();
  gs.level = 99;
  gs.jobId = 'aramikagura';
  gs.flags['main_story_complete'] = true;
  gs.investigationSeed = 0x2468ace0;
  const [quest] = syncInvestigationQuests(gs);
  const loot = generateInvestigationEquipment(gs, quest);
  expect(gs.addGeneratedEquipment(loot)).toBe(true);
  return { gs, id: loot.id };
}

afterEach(() => {
  replaceRuntimeQuests(INVESTIGATION_GROUP, []);
  replaceRuntimeEquipment([]);
});

describe('investigation equipment forge', () => {
  it('dismantles an unequipped item into deep crystals', () => {
    const { gs, id } = stateWithLoot();
    const def = getEquipment(id)!;
    const expected = investigationDismantleYield(def);

    expect(dismantleInvestigationEquipment(gs, id)).toBe('ok');
    expect(gs.materials[INVESTIGATION_CRYSTAL_ID]).toBe(expected);
    expect(gs.equipmentOwned).not.toContain(id);
    expect(gs.generatedEquipment[id]).toBeUndefined();
    expect(getEquipment(id)).toBeUndefined();
  });

  it('refuses to dismantle an equipped investigation item', () => {
    const { gs, id } = stateWithLoot();
    const def = getEquipment(id)!;
    expect(gs.canEquip(id)).toBe(true);
    gs.equip(def.slot, id);

    expect(dismantleInvestigationEquipment(gs, id)).toBe('equipped');
    expect(gs.equipmentOwned).toContain(id);
    expect(gs.materials[INVESTIGATION_CRYSTAL_ID] ?? 0).toBe(0);
  });

  it('consumes both resources, raises stats, and survives save/load', () => {
    const { gs, id } = stateWithLoot();
    const before = structuredClone(getEquipment(id)!);
    const cost = investigationUpgradeCost(before)!;
    gs.addMaterial(INVESTIGATION_CRYSTAL_ID, cost.crystals);
    gs.addMaterial(INVESTIGATION_SEAL_ID, cost.seals);
    gs.equip(before.slot, id);

    expect(upgradeInvestigationEquipment(gs, id)).toBe('ok');
    const upgraded = getEquipment(id)!;
    expect(upgraded.generated?.upgradeLevel).toBe(1);
    expect(investigationUpgradeBonus(upgraded)).toBe(4);
    expect(gs.materials[INVESTIGATION_CRYSTAL_ID] ?? 0).toBe(0);
    expect(gs.materials[INVESTIGATION_SEAL_ID] ?? 0).toBe(0);
    const beforePower = Object.values(before.derived).reduce((sum, n) => sum + Math.max(0, n ?? 0), 0);
    const afterPower = Object.values(upgraded.derived).reduce((sum, n) => sum + Math.max(0, n ?? 0), 0);
    expect(afterPower).toBeGreaterThan(beforePower);

    const loaded = new GameState();
    loaded.loadFrom(gs.toSave(1));
    expect(loaded.equipment[before.slot]).toBe(id);
    expect(loaded.generatedEquipment[id].generated?.upgradeLevel).toBe(1);
    expect(loaded.generatedEquipment[id].derived).toEqual(upgraded.derived);
    expect(loaded.derived).toEqual(gs.derived);
  });

  it('enforces material requirements and the +5 cap', () => {
    const { gs, id } = stateWithLoot();
    expect(upgradeInvestigationEquipment(gs, id)).toBe('materials');
    expect(getEquipment(id)?.generated?.upgradeLevel).toBe(0);

    gs.addMaterial(INVESTIGATION_CRYSTAL_ID, 999);
    gs.addMaterial(INVESTIGATION_SEAL_ID, 999);
    for (let level = 1; level <= MAX_INVESTIGATION_UPGRADE; level++) {
      expect(upgradeInvestigationEquipment(gs, id)).toBe('ok');
      expect(getEquipment(id)?.generated?.upgradeLevel).toBe(level);
    }
    expect(investigationUpgradeBonus(getEquipment(id)!)).toBe(20);
    expect(investigationUpgradeCost(getEquipment(id)!)).toBeNull();
    expect(upgradeInvestigationEquipment(gs, id)).toBe('max');
  });
});
