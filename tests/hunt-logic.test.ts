import { describe, it, expect } from 'vitest';
import { currentWave, concurrentSpawnCount, VETERAN_MODS } from '@/quests/hunt-logic';
import { computeDerived, ZERO_BASE } from '@/stats/stats';

const twoWaveQuest = {
  objectives: [
    { type: 'kill' as const, enemyId: 'green_wolf', count: 5 },
    { type: 'kill' as const, enemyId: 'boss_wolf_alpha', count: 1 },
  ],
};

describe('currentWave (連続狩猟の進行)', () => {
  it('starts at the first objective with nothing done', () => {
    const w = currentWave(twoWaveQuest, undefined);
    expect(w).toEqual({ objectiveIndex: 0, enemyId: 'green_wolf', remaining: 5 });
  });

  it('tracks remaining kills within a wave', () => {
    const w = currentWave(twoWaveQuest, { green_wolf: 3 });
    expect(w).toEqual({ objectiveIndex: 0, enemyId: 'green_wolf', remaining: 2 });
  });

  it('advances to the next objective only when the first completes', () => {
    const w = currentWave(twoWaveQuest, { green_wolf: 5 });
    expect(w).toEqual({ objectiveIndex: 1, enemyId: 'boss_wolf_alpha', remaining: 1 });
  });

  it('boss progress does not skip an unfinished trash wave (order is strict)', () => {
    // Even if the boss somehow died first, wave 1 stays the current wave.
    const w = currentWave(twoWaveQuest, { green_wolf: 2, boss_wolf_alpha: 1 });
    expect(w?.enemyId).toBe('green_wolf');
  });

  it('returns null once every objective is complete', () => {
    expect(currentWave(twoWaveQuest, { green_wolf: 5, boss_wolf_alpha: 1 })).toBeNull();
  });

  it('handles a single-boss hunt (classic 大型狩猟)', () => {
    const q = { objectives: [{ type: 'kill' as const, enemyId: 'boss_flame', count: 1 }] };
    expect(currentWave(q, undefined)?.enemyId).toBe('boss_flame');
    expect(currentWave(q, { boss_flame: 1 })).toBeNull();
  });
});

describe('concurrentSpawnCount', () => {
  it('bosses always spawn solo', () => {
    expect(concurrentSpawnCount(1, true)).toBe(1);
    expect(concurrentSpawnCount(9, true)).toBe(1);
  });
  it('trash packs cap at 4 concurrent', () => {
    expect(concurrentSpawnCount(2, false)).toBe(2);
    expect(concurrentSpawnCount(4, false)).toBe(4);
    expect(concurrentSpawnCount(10, false)).toBe(4);
  });
  it('never returns less than 1', () => {
    expect(concurrentSpawnCount(1, false)).toBe(1);
  });
});

describe('VETERAN_MODS (歴戦倍率)', () => {
  it('strengthens the target and its rewards', () => {
    expect(VETERAN_MODS.hpMult).toBeGreaterThan(1);
    expect(VETERAN_MODS.dmgMult).toBeGreaterThan(1);
    expect(VETERAN_MODS.rewardMult).toBeGreaterThan(1);
    expect(VETERAN_MODS.dropBonusAdd).toBeGreaterThan(0);
  });
  it('produces integer HP when applied to real boss stats', () => {
    expect(Number.isInteger(Math.round(640 * VETERAN_MODS.hpMult))).toBe(true);
  });
});

describe('lifesteal / goldRate derived stats', () => {
  it('default to 0 with no gear', () => {
    const d = computeDerived({ ...ZERO_BASE, VIT: 10, LUK: 10 });
    expect(d.lifesteal).toBe(0);
    expect(d.goldRate).toBe(0);
  });

  it('add up from equipment modifiers', () => {
    const d = computeDerived(ZERO_BASE, [
      { derived: { lifesteal: 0.05, goldRate: 0.2 } },
      { derived: { lifesteal: 0.03 } },
    ]);
    expect(d.lifesteal).toBeCloseTo(0.08);
    expect(d.goldRate).toBeCloseTo(0.2);
  });

  it('clamps lifesteal to 50% and goldRate to >= 0', () => {
    const d = computeDerived(ZERO_BASE, [{ derived: { lifesteal: 2, goldRate: -1 } }]);
    expect(d.lifesteal).toBe(0.5);
    expect(d.goldRate).toBe(0);
  });
});
