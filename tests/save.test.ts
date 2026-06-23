import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { migrate, createDefaultSave, SAVE_VERSION } from '@/save/schema';

describe('save round trip', () => {
  it('GameState -> save -> load preserves key state', () => {
    const gs = new GameState();
    gs.recompute(false);
    gs.statPoints = 5;
    gs.allocateStat('STR', 3);
    gs.equip('head', 'leather_cap');
    gs.equip('main_hand', 'iron_sword');
    gs.addMaterial('slime_jelly', 4);
    gs.addConsumable('potion_hp', 2);
    gs.addEquipment('iron_helm');
    gs.addGold(150);
    gs.level = 2;
    gs.skillPoints = 1;
    gs.learnSkill('toughness');
    gs.flags['boss_first_kill'] = true;
    gs.x = 123;
    gs.y = 456;

    const saved = gs.toSave(1);
    const loaded = new GameState();
    loaded.loadFrom(migrate(JSON.parse(JSON.stringify(saved)), 1));

    expect(loaded.base.STR).toBe(gs.base.STR);
    expect(loaded.equipment.head).toBe('leather_cap');
    expect(loaded.equipment.main_hand).toBe('iron_sword');
    expect(loaded.materials.slime_jelly).toBe(4);
    expect(loaded.consumables.potion_hp).toBe(2);
    expect(loaded.equipmentOwned).toContain('iron_helm');
    // Equipped items must be owned after load (invariant).
    expect(loaded.equipmentOwned).toContain('iron_sword');
    expect(loaded.gold).toBe(150);
    expect(loaded.skills.toughness).toBe(1);
    expect(loaded.flags.boss_first_kill).toBe(true);
    expect(loaded.x).toBe(123);
    expect(loaded.derived.physAtk).toBe(gs.derived.physAtk);
  });
});

describe('save migration / defensive load', () => {
  it('fills defaults for partial/corrupt data', () => {
    const m = migrate({ player: { level: 9 } }, 0);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.player.level).toBe(9);
    expect(m.player.base.STR).toBe(createDefaultSave(0).player.base.STR);
  });

  it('drops unknown equipment ids on load', () => {
    const def = createDefaultSave(2);
    def.equipment.main_hand = 'does_not_exist';
    const gs = new GameState();
    gs.loadFrom(def);
    expect(gs.equipment.main_hand).toBeNull();
  });

  it('non-object input returns a usable default', () => {
    const m = migrate('garbage', 0);
    expect(m.player.level).toBe(1);
  });

  it('fills the default gold for pre-gold saves', () => {
    const m = migrate({ player: { level: 3 } }, 0);
    expect(m.player.gold).toBe(createDefaultSave(0).player.gold);
    const gs = new GameState();
    gs.loadFrom(m);
    expect(gs.gold).toBe(createDefaultSave(0).player.gold);
  });
});
