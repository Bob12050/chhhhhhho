import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { createDefaultSave } from '@/save/schema';
import { craft, craftBlock } from '@/crafting/crafting';
import { getRecipe } from '@/crafting/recipes';

/**
 * Upgrade route (spec §2.2): an R2+ item can be made either by direct craft
 * (heavier materials) OR by consuming the previous-rank piece + lighter
 * materials. Both routes yield the same result id. The starter save owns
 * wood_sword (R1) and leather_cap (R1), the entry points of two chains.
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
    const r = getRecipe('upgrade_hunters_sword')!; // consumes wood_sword (R1)
    expect(r.consumeEquipment).toContain('wood_sword');
    for (const [id, qty] of Object.entries(r.materials)) gs.addMaterial(id, qty);
    while (gs.removeEquipment('wood_sword')) {
      /* strip the starter sword */
    }
    expect(craftBlock(gs, r)).toBe('equipment');

    gs.addEquipment('wood_sword');
    expect(craftBlock(gs, r)).toBeNull();
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipmentOwned).toContain('hunters_sword');
    expect(gs.ownedEquipmentCount('wood_sword')).toBe(0);
  });

  it('consumes the piece and the lighter materials on success', () => {
    const gs = freshState();
    const r = getRecipe('upgrade_padded_hood')!; // consumes leather_cap (R1)
    // Normalise the starter count (the default save already owns one cap).
    while (gs.removeEquipment('leather_cap')) {
      /* clear */
    }
    gs.addEquipment('leather_cap');
    for (const [id, qty] of Object.entries(r.materials)) gs.addMaterial(id, qty);
    const goldBefore = gs.gold;
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipmentOwned).toContain('padded_hood');
    expect(gs.ownedEquipmentCount('leather_cap')).toBe(0);
    for (const id of Object.keys(r.materials)) expect(gs.materials[id] ?? 0).toBe(0);
    expect(gs.gold).toBe(goldBefore - r.gold);
  });

  it('unequips the consumed piece if it was worn', () => {
    const gs = freshState();
    const r = getRecipe('upgrade_hunters_sword')!;
    gs.equip('main_hand', 'wood_sword'); // the starter weapon
    expect(gs.equipment.main_hand).toBe('wood_sword');
    for (const [id, qty] of Object.entries(r.materials)) gs.addMaterial(id, qty);
    expect(craft(gs, r)).toBe(true);
    expect(gs.equipment.main_hand).toBeNull();
  });
});
