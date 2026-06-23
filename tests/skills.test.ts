import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { getSkill } from '@/skills/skill-defs';

describe('skills', () => {
  it('gates learning by points, level, and prerequisites', () => {
    const gs = new GameState();
    gs.level = 1;
    gs.skillPoints = 0;
    gs.recompute(false);

    // power_strike needs Lv3 + slash; with no points -> 'points' first.
    expect(gs.skillLearnBlock('power_strike')).toBe('points');
    gs.skillPoints = 5;
    expect(gs.skillLearnBlock('power_strike')).toBe('level');
    gs.level = 3;
    expect(gs.skillLearnBlock('power_strike')).toBe('requires');
    gs.learnSkill('slash');
    expect(gs.skillLearnBlock('power_strike')).toBeNull();
  });

  it('assigns learned actives to skill slots', () => {
    const gs = new GameState();
    gs.level = 3;
    gs.skillPoints = 3;
    gs.learnSkill('slash');
    gs.learnSkill('power_strike');
    expect(gs.skillSlots).toContain('slash');
    expect(gs.skillSlots).toContain('power_strike');
  });

  it('passive skills modify derived stats', () => {
    const gs = new GameState();
    gs.level = 2;
    gs.skillPoints = 1;
    gs.recompute(false);
    const hp0 = gs.derived.maxHp;
    gs.learnSkill('toughness');
    const passive = getSkill('toughness')!;
    expect(gs.derived.maxHp).toBe(hp0 + (passive.derived!.maxHp ?? 0));
  });

  it('level-up grants a skill point', () => {
    const gs = new GameState();
    gs.recompute(false);
    const p0 = gs.skillPoints;
    gs.gainExp(100000); // force several level-ups
    expect(gs.skillPoints).toBeGreaterThan(p0);
  });
});
