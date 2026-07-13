import { describe, expect, it } from 'vitest';
import { huntSimulationQuests, simulateHunt, simulateHuntBatch } from '@/balance/hunt-simulator';

const QUEST_ID = 'hunt_r2_01_zephys';

describe('hunt balance simulator', () => {
  it('runs 300 save-independent attempts from real quest data', () => {
    const result = simulateHunt({ questId: QUEST_ID, runs: 300, seed: 1234 });
    expect(result.runs).toBe(300);
    expect(result.clears).toBeGreaterThanOrEqual(0);
    expect(result.clears).toBeLessThanOrEqual(300);
    expect(result.averageTtkSec).toBeGreaterThan(0);
    expect(result.encounter.adjustedTotalHp).toBeGreaterThan(0);
    expect(result.drops.length).toBeGreaterThan(0);
  });

  it('is fully reproducible for a fixed seed', () => {
    const options = { questId: QUEST_ID, runs: 300, seed: 0xcafe };
    expect(simulateHunt(options)).toEqual(simulateHunt(options));
  });

  it('reacts predictably to HP, attack, and drop tuning', () => {
    const common = { questId: QUEST_ID, runs: 1000, seed: 77, playerLevel: 18 };
    const base = simulateHunt(common);
    const tougherHp = simulateHunt({ ...common, enemyHpScale: 1.5 });
    const tougherDamage = simulateHunt({ ...common, enemyDamageScale: 1.8 });
    const richerDrops = simulateHunt({ ...common, dropScale: 2 });

    expect(tougherHp.averageTtkSec).toBeGreaterThan(base.averageTtkSec * 1.45);
    expect(tougherDamage.clearRate).toBeLessThanOrEqual(base.clearRate);
    expect(richerDrops.drops.reduce((sum, drop) => sum + drop.total, 0)).toBeGreaterThanOrEqual(
      base.drops.reduce((sum, drop) => sum + drop.total, 0),
    );
  });

  it('exposes repeatable hunts grouped across all seven ranks', () => {
    const quests = huntSimulationQuests();
    const ranks = new Set(quests.map((quest) => quest.rank));
    expect([...ranks].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const quest of quests) {
      const result = simulateHunt({ questId: quest.id, runs: 10, seed: 1 });
      expect(result.questId).toBe(quest.id);
      expect(result.averageTtkSec).toBeGreaterThan(0);
    }
  });

  it('diagnoses every hunt and sorts the batch by tuning priority', () => {
    const batch = simulateHuntBatch({ runs: 50, seed: 4321 });
    expect(batch.entries).toHaveLength(huntSimulationQuests().length);
    expect(batch.totalAttempts).toBe(batch.entries.length * 50);
    expect(Object.values(batch.counts).reduce((sum, count) => sum + count, 0)).toBe(batch.entries.length);
    for (let i = 1; i < batch.entries.length; i++) {
      expect(batch.entries[i - 1]!.score).toBeGreaterThanOrEqual(batch.entries[i]!.score);
    }
    expect(simulateHuntBatch({ runs: 50, seed: 4321 })).toEqual(batch);
  });

  it('uses encounter-specific timing targets', () => {
    const mob = simulateHunt({ questId: 'hunt_r1_06_wolf_pack', runs: 10, seed: 1 });
    const boss = simulateHunt({ questId: 'subj_treant', runs: 10, seed: 1 });
    const prelude = simulateHunt({ questId: 'hunt_r1_03_grove_prelude', runs: 10, seed: 1 });
    const multi = simulateHunt({ questId: 'hunt_r1_05_twin_guardians', runs: 10, seed: 1 });

    expect(mob.encounter.kind).toBe('mob');
    expect(boss.encounter.kind).toBe('boss');
    expect(prelude.encounter.kind).toBe('prelude');
    expect(multi.encounter.kind).toBe('multiBoss');
    expect(mob.target.ttkSec).toBeLessThan(boss.target.ttkSec);
    expect(prelude.target.ttkSec).toBeGreaterThan(boss.target.ttkSec);
    expect(multi.target.ttkSec).toBeGreaterThan(boss.target.ttkSec);
  });

  it('keeps all rank 1-2 hunts out of urgent tuning at the benchmark', () => {
    const early = simulateHuntBatch({ runs: 300, seed: 12345 }).entries.filter(
      (entry) => entry.result.rank <= 2,
    );
    expect(early).not.toHaveLength(0);
    expect(early.filter((entry) => entry.status === 'critical' || entry.status === 'adjust')).toEqual([]);
    expect(early.every((entry) => entry.result.clearRate >= 0.75)).toBe(true);
  });
});
