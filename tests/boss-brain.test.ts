import { describe, it, expect } from 'vitest';
import { BossBrain, type Arena } from '@/enemies/boss-brain';
import { allEnemyDefs } from '@/enemies/enemy-defs';

/**
 * BossBrain is engine-independent: a fake Arena records what the brain asked
 * the scene to do, and we step time manually.
 */
interface Log {
  telegraphs: { x: number; y: number; radius: number; ms: number }[];
  chargeTelegraphs: { x: number; y: number; targetX: number; targetY: number; ms: number }[];
  shotTelegraphs: { angles: number[]; ms: number }[];
  rootTelegraphs: { angles: number[]; length: number; width: number; ms: number }[];
  rootStrikes: { angles: number[]; length: number; width: number; damage: number }[];
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
    telegraphs: [], chargeTelegraphs: [], shotTelegraphs: [], rootTelegraphs: [], rootStrikes: [],
    explosions: [], dashes: [], shots: [], summons: [],
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
    telegraphCharge: (x, y, targetX, targetY, _speed, _durationMs, ms, onDone) => {
      log.chargeTelegraphs.push({ x, y, targetX, targetY, ms });
      pending.push(onDone);
    },
    telegraphShots: (_x, _y, angles, ms, onDone) => {
      log.shotTelegraphs.push({ angles: [...angles], ms });
      pending.push(onDone);
    },
    telegraphRootLanes: (_x, _y, angles, length, width, ms, onDone) => {
      log.rootTelegraphs.push({ angles: [...angles], length, width, ms });
      pending.push(onDone);
    },
    strikeRootLanes: (_x, _y, angles, length, width, damage) => {
      log.rootStrikes.push({ angles: [...angles], length, width, damage });
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

  it('telegraphs every projectile direction before releasing a burst', () => {
    const made = makeArena() as ReturnType<typeof makeArena> & { flush: () => void };
    const brain = new BossBrain(
      made.arena,
      [{
        type: 'shots',
        count: 5,
        speed: 180,
        damageMult: 0.5,
        telegraphMs: 650,
        spread: 'aim',
        arcDeg: 40,
      }],
      20,
    );
    step(brain, 1300);
    expect(made.log.shotTelegraphs).toHaveLength(1);
    expect(made.log.shotTelegraphs[0].angles).toHaveLength(5);
    expect(made.log.shots).toHaveLength(0);
    made.flush();
    expect(made.log.shots).toHaveLength(5);
  });

  it('telegraphs the complete charge lane before the dash', () => {
    const made = makeArena() as ReturnType<typeof makeArena> & { flush: () => void };
    const brain = new BossBrain(
      made.arena,
      [{ type: 'charge', speed: 360, durationMs: 500, telegraphMs: 700 }],
      20,
    );
    step(brain, 1300);
    expect(made.log.chargeTelegraphs).toHaveLength(1);
    expect(made.log.dashes).toHaveLength(0);
    made.flush();
    expect(made.log.dashes).toEqual([{ speed: 360, ms: 500 }]);
  });

  it('telegraphs a root fan before all lanes erupt', () => {
    const made = makeArena() as ReturnType<typeof makeArena> & { flush: () => void };
    const brain = new BossBrain(
      made.arena,
      [{
        type: 'root_lanes',
        count: 3,
        length: 260,
        width: 30,
        damageMult: 1.2,
        telegraphMs: 900,
        spreadDeg: 60,
      }],
      20,
    );
    step(brain, 1300);
    expect(made.log.rootTelegraphs).toHaveLength(1);
    expect(made.log.rootTelegraphs[0].angles).toHaveLength(3);
    expect(made.log.rootStrikes).toHaveLength(0);
    made.flush();
    expect(made.log.rootStrikes).toEqual([{
      angles: made.log.rootTelegraphs[0].angles,
      length: 260,
      width: 30,
      damage: 24,
    }]);
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

  it('defers its next attack for arena-level mechanics', () => {
    const { arena, log } = makeArena();
    const brain = new BossBrain(
      arena,
      [{ type: 'shots', count: 1, speed: 100, damageMult: 1, spread: 'radial' }],
      10,
    );
    step(brain, 1_100);
    brain.defer(1_000);
    step(brain, 900);
    expect(log.shots).toHaveLength(0);
    step(brain, 300);
    expect(log.shots).toHaveLength(1);
  });

  it('accelerates cooldown cadence without shortening a busy attack window', () => {
    const made = makeArena() as ReturnType<typeof makeArena> & { flush: () => void };
    const brain = new BossBrain(
      made.arena,
      [{ type: 'aoe', radius: 40, damageMult: 1, telegraphMs: 800 }],
      10,
    );
    for (let elapsed = 0; elapsed < 700; elapsed += 100) brain.update(100, 2);
    expect(made.log.telegraphs).toHaveLength(1);
    brain.update(500, 2);
    expect(brain.isBusy()).toBe(true);
    brain.update(300, 2);
    expect(brain.isBusy()).toBe(false);
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

  it('switches to the named phase attack set and cadence at the threshold', () => {
    let hp = 1;
    const { arena, log } = makeArena({ hpPct: () => hp });
    const brain = new BossBrain(
      arena,
      [{ type: 'shots', count: 1, speed: 100, damageMult: 1, spread: 'radial' }],
      10,
      0.5,
      {
        name: '第二形態',
        speedMult: 1.12,
        cooldownMult: 0.75,
        attacks: [
          { type: 'shots', count: 4, speed: 120, damageMult: 0.5, spread: 'radial' },
        ],
      },
    );
    step(brain, 500);
    hp = 0.4;
    step(brain, 800);
    expect(brain.isEnraged()).toBe(true);
    expect(log.speedMult).toBe(1.12);
    expect(log.shots).toHaveLength(4);
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

  it('gives every rank-seven boss themed warnings and a telegraphed second phase', () => {
    const ids = [
      'boss_slime_abyss',
      'boss_flarelis',
      'boss_luxmordo',
      'boss_crimson_abyss',
      'boss_almagia',
    ];
    const byId = new Map(allEnemyDefs().map((boss) => [boss.id, boss]));
    for (const id of ids) {
      const boss = byId.get(id);
      expect(boss?.bossStyle?.warningColor, `${id} warning colour`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(boss?.phase?.name, `${id} phase name`).toBeTruthy();
      expect(boss?.phase?.attacks?.length, `${id} phase attacks`).toBeGreaterThanOrEqual(3);
      for (const attack of [...(boss?.attacks ?? []), ...(boss?.phase?.attacks ?? [])]) {
        if (attack.type === 'shots') {
          expect(attack.telegraphMs, `${id} shot telegraph`).toBeGreaterThanOrEqual(500);
        }
      }
    }
  });

  it('gives the treant its authored root phase and break gauge', () => {
    const treant = allEnemyDefs().find((boss) => boss.id === 'boss_treant');
    expect(treant?.attacks?.some((attack) => attack.type === 'root_lanes')).toBe(true);
    expect(treant?.phase?.name).toBe('森の怒り');
    expect(treant?.phase?.attacks?.some((attack) => attack.type === 'root_lanes')).toBe(true);
    expect(treant?.stagger?.downMs).toBeGreaterThanOrEqual(2_000);
  });
});
