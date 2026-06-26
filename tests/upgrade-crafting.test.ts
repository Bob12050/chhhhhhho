import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { createDefaultSave } from '@/save/schema';
import { craft, craftBlock } from '@/crafting/crafting';
import { getRecipe } from '@/crafting/recipes';

/**
 * Upgrade route (spec §2.2): an R2+ item can be made either by direct craft
 * (heavier materials) OR by consuming a lower-tier piece + lighter materials.
 * Both routes yield the same result id.
 */
describe('upgrade crafting (下位装備 + 素材 → 上位装備)', () => {
  function freshState(): GameState {
    const gs = new GameState();
    gs.loadFrom(createDefaultSave(0));
    gs.addGold(1000);
    return gs;
  }

  it('is blocked without the lower-tier piece, allowed with it', () => {
    const gs = freshState();
    const r = getRecipe('upgrade_iron_sword')!;
    expect(r.consumeEquipment).toContain('wood_sword');
    // Give all materials but remove every wood_sword.
    for (const [id, qty] of Object.entries(r.materials)) gs.addMaterial(id, qty);
    while (gs.removeEquipment('wood_sword')) {
      /* strip the starter sword */
    }
    expect(craftBlock(gs, r)).toBe('equipment');

    gs.addEquipment('wood_sword');
    expect(craftBlock(gs, r)).toBeNull();
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipmentOwned).toContain('iron_sword');
    expect(gs.ownedEquipmentCount('wood_sword')).toBe(0);
  });

  it('consumes the piece and the lighter materials on success', () => {
    const gs = freshState();
    const r = getRecipe('upgrade_iron_helm')!;
    // Start from a known count (the default save already owns one leather_cap).
    while (gs.removeEquipment('leather_cap')) {
      /* clear */
    }
    gs.addEquipment('leather_cap');
    for (const [id, qty] of Object.entries(r.materials)) gs.addMaterial(id, qty);
    const goldBefore = gs.gold;
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipmentOwned).toContain('iron_helm');
    expect(gs.ownedEquipmentCount('leather_cap')).toBe(0);
    for (const id of Object.keys(r.materials)) expect(gs.materials[id] ?? 0).toBe(0);
    expect(gs.gold).toBe(goldBefore - r.gold);
  });

  it('unequips the consumed piece if it was worn', () => {
    const gs = freshState();
    const r = getRecipe('upgrade_iron_sword')!;
    // wood_sword is the default weapon; ensure it is equipped, then upgrade.
    gs.equip('main_hand', 'wood_sword');
    expect(gs.equipment.main_hand).toBe('wood_sword');
    for (const [id, qty] of Object.entries(r.materials)) gs.addMaterial(id, qty);
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipment.main_hand).toBeNull();
  });
});
