import { describe, it, expect } from 'vitest';
import jobsJson from '@/data/defs/jobs.json';
import { totalExpForLevel } from '@/stats/leveling';
import { allEnemyDefs } from '@/enemies/enemy-defs';

/**
 * Progression budget: getting one job to 4次職 should take roughly 20 hours.
 * Time is governed by (a) total exp required across the multi-job path and
 * (b) the best farmable exp/hour. We don't know the real kill rate, so we
 * assume a steady farm rate and assert the estimate stays in a 20h-ish band.
 * If the curve, job requirements, or enemy exp drift, this catches it.
 */
type Job = { id: string; unlockConditions?: { type: string; jobId?: string; level?: number }[] };
const JOBS = new Map((jobsJson as { jobs: Job[] }).jobs.map((j) => [j.id, j]));

/** Highest job level each prerequisite job must reach to enter `jobId`. */
function requiredLevels(jobId: string, acc = new Map<string, number>()): Map<string, number> {
  const j = JOBS.get(jobId);
  for (const c of j?.unlockConditions ?? []) {
    if (c.type === 'jobLevel' && c.jobId && c.level != null) {
      acc.set(c.jobId, Math.max(acc.get(c.jobId) ?? 0, c.level));
      requiredLevels(c.jobId, acc);
    } else if (c.type === 'charLevel' && c.level != null) {
      acc.set('adventurer', Math.max(acc.get('adventurer') ?? 0, c.level));
    }
  }
  return acc;
}

describe('progression budget (~20h to one 4次職)', () => {
  const ASSUMED_KILLS_PER_HOUR = 720; // 12/min steady farm in a respawning zone

  it('total exp to a 4次職 path lands near a 20h grind', () => {
    const acc = requiredLevels('aramikagura');
    expect(acc.size).toBeGreaterThan(0);
    let totalExp = 0;
    for (const lv of acc.values()) totalExp += totalExpForLevel(lv);

    const topExp = Math.max(...allEnemyDefs().filter((d) => !d.isBoss).map((d) => d.expReward));
    const hours = totalExp / (topExp * ASSUMED_KILLS_PER_HOUR);

    // Best-case farm should be in a sane band; real play (early inefficiency)
    // trends toward the upper end / ~20h.
    expect(hours, `est ${hours.toFixed(1)}h (exp ${totalExp}, top ${topExp})`).toBeGreaterThan(12);
    expect(hours, `est ${hours.toFixed(1)}h (exp ${totalExp}, top ${topExp})`).toBeLessThan(30);
  });
});
