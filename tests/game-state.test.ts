import { describe, it, expect, beforeEach } from 'vitest';
import { POWER_SCALE_SAVE_FLAG } from '@/balance/progression-scale';
import { GameState } from '@/player/game-state';

describe('GameState equipment & stats', () => {
  let gs: GameState;
  beforeEach(() => {
    gs = new GameState();
    // Samurai can use the shared iron sword and armour exercised below.
    gs.jobId = 'samurai';
    gs.recompute(false);
    gs.fullHeal();
  });

  it('equipping increases derived stats immediately', () => {
    const before = gs.derived.physAtk;
    gs.equip('main_hand', 'iron_sword');
    expect(gs.derived.physAtk).toBe(before + 65);
  });

  it('makes an R10 weapon a substantial share of endgame attack', () => {
    gs.jobId = 'aramikagura';
    gs.level = 99;
    gs.base = { STR: 152, VIT: 152, INT: 5, DEX: 5, LUK: 5 };
    gs.recompute(false);
    const withoutWeapon = gs.derived.physAtk;

    gs.equip('main_hand', 'skyvault_sword');
    const weaponGain = gs.derived.physAtk - withoutWeapon;

    expect(weaponGain).toBe(2400);
    expect(weaponGain / withoutWeapon).toBeGreaterThan(3);
  });

  it('unequipping reverts derived stats', () => {
    gs.equip('main_hand', 'iron_sword');
    const equipped = gs.derived.physAtk;
    gs.equip('main_hand', null);
    expect(gs.derived.physAtk).toBeLessThan(equipped);
  });

  it('stacking armor adds defense and max hp', () => {
    const hp0 = gs.derived.maxHp;
    gs.equip('head', 'iron_helm');
    gs.equip('torso', 'iron_plate');
    expect(gs.derived.maxHp).toBe(hp0 + 108);
    expect(gs.derived.def).toBeGreaterThan(0);
  });

  it('allocating a stat point requires available points', () => {
    expect(gs.allocateStat('STR')).toBe(false);
    gs.statPoints = 2;
    const atk = gs.derived.physAtk;
    expect(gs.allocateStat('STR')).toBe(true);
    expect(gs.derived.physAtk).toBe(atk + 4);
    expect(gs.statPoints).toBe(1);
  });
});

describe('GameState leveling', () => {
  it('levels up and grants stat points when exp threshold reached', () => {
    const gs = new GameState();
    gs.recompute(false);
    gs.gainExp(1000);
    expect(gs.level).toBeGreaterThan(1);
    expect(gs.statPoints).toBeGreaterThan(0);
  });

  it('fully restores a legacy save when it enters the larger stat scale', () => {
    const source = new GameState();
    const save = source.toSave(0);
    delete save.flags[POWER_SCALE_SAVE_FLAG];
    save.player.hp = 1;
    save.player.mp = 0;

    const loaded = new GameState();
    loaded.loadFrom(save);

    expect(loaded.flags[POWER_SCALE_SAVE_FLAG]).toBe(true);
    expect(loaded.hp).toBe(loaded.derived.maxHp);
    expect(loaded.mp).toBe(loaded.derived.maxMp);
  });
});

describe('temporary skill buffs', () => {
  it('addBuff raises derived stats and expireBuffs reverts them', () => {
    const gs = new GameState();
    gs.recompute(false);
    const base = gs.derived.physAtk;
    gs.addBuff({ physAtk: 14 }, 10000, 1000);
    expect(gs.derived.physAtk).toBe(base + 14);
    expect(gs.expireBuffs(5000)).toBe(false); // still running
    expect(gs.derived.physAtk).toBe(base + 14);
    expect(gs.expireBuffs(11001)).toBe(true); // expired
    expect(gs.derived.physAtk).toBe(base);
    expect(gs.tempBuffs.length).toBe(0);
  });

  it('buffs stack and expire independently', () => {
    const gs = new GameState();
    gs.recompute(false);
    const base = gs.derived.physAtk;
    gs.addBuff({ physAtk: 10 }, 1000, 0);
    gs.addBuff({ physAtk: 5 }, 5000, 0);
    expect(gs.derived.physAtk).toBe(base + 15);
    gs.expireBuffs(2000);
    expect(gs.derived.physAtk).toBe(base + 5);
  });
});

