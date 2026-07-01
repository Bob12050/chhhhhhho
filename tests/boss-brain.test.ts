import { describe, it, expect } from 'vitest';
import { BossBrain, type Arena } from '@/enemies/boss-brain';
import { allEnemyDefs } from '@/enemies/enemy-defs';

/**
 * BossBrain is engine-independent: a fake Arena records what the brain asked
 * the scene to do, and we step time manually.
 */
interface Log {
  telegraphs: { x: number; y: number; radius: number; ms: number }[];
  explosions: { x: number; y: number; radius: number; damage: number }[];
  dashes: { speed: number; ms: number }[];
  shots: { angle: number; speed: number; damage: number }[];
  summons: string[];
  holds: number[];
  speedMult: number;
  enraged: number;
}

function makeArena(overrides?: Partial<Arena> & { hp?: () => number }): { arena: Arena; log: Log } {
  const log: Log = {
    telegraphs: [], explosions: [], dashes: [], shots: [], summons: [],
    holds: [], speedMult: 1, enraged: 0,
  };
  const pending: (() => void)[] = [];
  const arena: Arena = {
    bossPos: () => ({ x: 0, y: 0 }),
    playerPos: () => ({ x: 50, y: 0 }), // in engage range
    hpPct: () => 1,
    telegraph: (x, y, radius, ms, onDone) => {
      log.telegraphs.push({ x, y, radius, ms });
      pending.push(onDone); // tests detonate manually via flush()
    },
    explode: (x, y, radius, damage) => log.explosions.push({ x, y, radius, damage }),
    hold: (ms) => log.holds.push(ms),
    dash: (_x, _y, speed, ms) => log.dashes.push({ speed, ms }),
    fireProjectile: (angle, speed, damage) => log.shots.push({ angle, speed, damage }),
    summon: (id) => {
      log.summons.push(id);
      return true;
    },
    minionCount: () => log.summons.length,
    setSpeedMult: (m) => {
      log.speedMult = m;
    },
    onEnrage: () => {
      log.enraged++;
    },
    random: () => 0.5,
    ...overrides,
  };
  return { arena, log, flush: () => pending.splice(0).forEach((f) => f()) } as unknown as {
    arena: Arena;
    log: Log;
  } & { flush: () => void };
}

const step = (brain: BossBrain, totalMs: number, dt = 100): void => {
  for (let t = 0; t < totalMs; t += dt) brain.update(dt);
};

describe('BossBrain', () => {
  it('fires attacks round-robin after the initial delay', () => {
    const { arena, log } = makeArena();
    const brain = new BossBrain(
      arena,
      [
        { type: 'shots', count: 4, speed: 100, damageMult: 0.5, spread: 'radial' },
        { type: 'summon', enemyId: 'slime', count: 1 },
      ],
      20,
    );
    step(brain, 1300); // past FIRST_ATTACK_DELAY → attack #1 (shots)
    expect(log.shots.length).toBe(4);
    expect(log.summons.length).toBe(0);
    step(brain, 3000); // past cooldown → attack #2 (summon)
    expect(log.summons).toEqual(['slime']);
  });

  it('aoe telegraphs first and only explodes when the telegraph resolves', () => {
    const made = makeArena() as ReturnType<typeof makeArena> & { flush: () => void };
    const brain = new BossBrain(
      made.arena,
      [{ type: 'aoe', radius: 40, damageMult: 1.5, telegraphMs: 800 }],
      20,
    );
    step(brain, 1300);
    expect(made.log.telegraphs.length).toBe(1);
    expect(made.log.telegraphs[0].radius).toBe(40);
    expect(made.log.explosions.length).toBe(0); // not yet detonated
    made.flush();
    expect(made.log.explosions.length).toBe(1);
    expect(made.log.explosions[0].damage).toBe(30); // 20 × 1.5
  });

  it('does not attack while the player is out of engage range', () => {
    const { arena, log } = makeArena({ playerPos: () => ({ x: 9999, y: 0 }) });
    const brain = new BossBrain(
      arena,
      [{ type: 'shots', count: 3, speed: 100, damageMult: 1, spread: 'radial' }],
      10,
    );
    step(brain, 5000);
    expect(log.shots.length).toBe(0);
  });

  it('enrages exactly once at the HP threshold and speeds up', () => {
    let hp = 1;
    const { arena, log } = makeArena({ hpPct: () => hp });
    const brain = new BossBrain(
      arena,
      [{ type: 'shots', count: 1, speed: 100, damageMult: 1, spread: 'radial' }],
      10,
      0.5,
    );
    step(brain, 500);
    expect(brain.isEnraged()).toBe(false);
    hp = 0.4;
    step(brain, 500);
    expect(brain.isEnraged()).toBe(true);
    expect(log.speedMult).toBeGreaterThan(1);
    step(brain, 3000);
    expect(log.enraged).toBe(1); // one-shot cue
  });

  it('summon respects the minion cap', () => {
    const { arena, log } = makeArena();
    const brain = new BossBrain(
      arena,
      [{ type: 'summon', enemyId: 'bat', count: 5, maxMinions: 2 }],
      10,
    );
    step(brain, 1300);
    expect(log.summons.length).toBe(2); // capped, not 5
  });
});

describe('boss attack data', () => {
  it('every boss has a pattern and every pattern telegraphs its aoe/charge', () => {
    const bosses = allEnemyDefs().filter((d) => d.isBoss);
    expect(bosses.length).toBeGreaterThanOrEqual(12);
    for (const b of bosses) {
      expect(b.attacks?.length, `${b.id} attacks`).toBeGreaterThanOrEqual(2);
      for (const a of b.attacks ?? []) {
        if (a.type === 'aoe' || a.type === 'charge') {
          expect(a.telegraphMs, `${b.id} telegraph`).toBeGreaterThanOrEqual(300);
        }
      }
    }
  });
});
