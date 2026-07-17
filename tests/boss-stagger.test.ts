import { describe, expect, it } from 'vitest';
import { BossStaggerMeter } from '@/combat/boss-stagger';

describe('BossStaggerMeter', () => {
  it('fills from hits, rewards skills, and opens one timed down window', () => {
    const meter = new BossStaggerMeter({
      max: 30,
      downMs: 2_000,
      damageRate: 0.5,
      skillBonus: 5,
      decayPerSecond: 0,
    });
    expect(meter.hit({ damage: 20, skill: false, crit: false, weak: false })).toBe(false);
    expect(meter.ratio).toBeCloseTo(1 / 3);
    expect(meter.hit({ damage: 30, skill: true, crit: false, weak: false })).toBe(false);
    expect(meter.ratio).toBeCloseTo(22 / 30);
    expect(meter.hit({ damage: 20, skill: false, crit: false, weak: false })).toBe(true);
    expect(meter.isDown).toBe(true);
    expect(meter.hit({ damage: 999, skill: true, crit: true, weak: true })).toBe(false);
    meter.update(2_000);
    expect(meter.isDown).toBe(false);
  });

  it('decays only after the post-hit grace period', () => {
    const meter = new BossStaggerMeter({
      max: 100,
      downMs: 1_000,
      damageRate: 1,
      decayDelayMs: 500,
      decayPerSecond: 10,
    });
    meter.hit({ damage: 20, skill: false, crit: false, weak: false });
    meter.update(500);
    expect(meter.ratio).toBeCloseTo(0.2);
    meter.update(1_000);
    expect(meter.ratio).toBeCloseTo(0.1);
  });
});
