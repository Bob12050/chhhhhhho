import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '@/player/game-state';

describe('GameState equipment & stats', () => {
  let gs: GameState;
  beforeEach(() => {
    gs = new GameState();
    gs.recompute(false);
    gs.fullHeal();
  });

  it('equipping increases derived stats immediately', () => {
    const before = gs.derived.physAtk;
    gs.equip('main_hand', 'iron_sword'); // +9 physAtk
    expect(gs.derived.physAtk).toBe(before + 9);
  });

  it('unequipping reverts derived stats', () => {
    gs.equip('main_hand', 'iron_sword');
    const equipped = gs.derived.physAtk;
    gs.equip('main_hand', null);
    expect(gs.derived.physAtk).toBeLessThan(equipped);
  });

  it('stacking armor adds defense and max hp', () => {
    const hp0 = gs.derived.maxHp;
    gs.equip('head', 'iron_helm'); // def+5, maxHp+10
    gs.equip('torso', 'iron_plate'); // def+8, maxHp+18
    expect(gs.derived.maxHp).toBe(hp0 + 28);
    expect(gs.derived.def).toBeGreaterThan(0);
  });

  it('allocating a stat point requires available points', () => {
    expect(gs.allocateStat('STR')).toBe(false);
    gs.statPoints = 2;
    const atk = gs.derived.physAtk;
    expect(gs.allocateStat('STR')).toBe(true);
    expect(gs.derived.physAtk).toBe(atk + 2);
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
});
