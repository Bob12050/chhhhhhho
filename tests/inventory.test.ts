import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';

describe('consumables', () => {
  it('heals HP and decrements the stack', () => {
    const gs = new GameState();
    gs.recompute(false);
    gs.hp = 1;
    gs.addConsumable('potion_hp', 2);
    const ok = gs.useConsumable('potion_hp');
    expect(ok).toBe(true);
    expect(gs.hp).toBe(Math.min(gs.derived.maxHp, 1 + 30));
    expect(gs.consumables.potion_hp).toBe(1);
  });

  it('does not waste a pure-HP potion at full HP', () => {
    const gs = new GameState();
    gs.recompute(false);
    gs.hp = gs.derived.maxHp;
    gs.addConsumable('potion_hp', 1);
    expect(gs.useConsumable('potion_hp')).toBe(false);
    expect(gs.consumables.potion_hp).toBe(1);
  });

  it('returns false when none are held', () => {
    const gs = new GameState();
    expect(gs.useConsumable('potion_mp')).toBe(false);
  });
});

describe('owned equipment', () => {
  it('equipping a known item keeps it owned and changes derived stats', () => {
    const gs = new GameState();
    gs.jobId = 'fighter'; // iron_sword is R3 → needs tier1 (1次職)
    gs.recompute(false);
    const atk0 = gs.derived.physAtk;
    gs.addEquipment('iron_sword');
    gs.equip('main_hand', 'iron_sword');
    expect(gs.equipment.main_hand).toBe('iron_sword');
    expect(gs.equipmentOwned).toContain('iron_sword');
    expect(gs.derived.physAtk).toBeGreaterThan(atk0);
  });
});
