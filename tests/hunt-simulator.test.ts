import { describe, expect, it } from 'vitest';
import { huntSimulationQuests, simulateHunt } from '@/balance/hunt-simulator';

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
});
