import type { BossAttackDef, BossPhaseDef } from '@/enemies/enemy-defs';

/**
 * Boss attack scheduler. Pure logic (no Phaser import) so it runs headless in
 * Vitest: the scene supplies an `Arena` of callbacks (draw a telegraph, spawn a
 * projectile, damage the player, ...) and steps the brain with `update(dtMs)`.
 *
 * Behaviour: attacks fire round-robin on a global cooldown while the player is
 * within engage range. Every attack telegraphs first. At `enrageAtHpPct` the
 * boss enrages once: attack cadence and movement speed up.
 */
export interface Arena {
  /** Boss position (physics source of truth). */
  bossPos(): { x: number; y: number };
  playerPos(): { x: number; y: number };
  /** Boss HP fraction 0..1 (drives enrage). */
  hpPct(): number;
  /** Show a warning circle, then call back when it detonates. */
  telegraph(x: number, y: number, radius: number, ms: number, onDone: () => void): void;
  /** Show the full path of a charge before movement begins. */
  telegraphCharge(
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    speed: number,
    durationMs: number,
    telegraphMs: number,
    onDone: () => void,
  ): void;
  /** Show every projectile direction before a burst is released. */
  telegraphShots(
    x: number,
    y: number,
    angles: readonly number[],
    ms: number,
    onDone: () => void,
  ): void;
  /** Blast visual + player damage check is the scene's job. */
  explode(x: number, y: number, radius: number, damage: number): void;
  /** Hold the boss in place (cast pose) for ms. */
  hold(ms: number): void;
  /** Dash the boss toward (x, y) at speed for ms (contact damage applies). */
  dash(x: number, y: number, speed: number, ms: number): void;
  fireProjectile(angleRad: number, speed: number, damage: number): void;
  /** Spawn one minion near the boss; returns false when refused (cap/space). */
  summon(enemyId: string): boolean;
  /** Live minions this boss has summoned (for the cap). */
  minionCount(): number;
  /** Movement speed multiplier hook (enrage). */
  setSpeedMult(mult: number): void;
  /** One-shot enrage cue (flash / roar / tint). */
  onEnrage(): void;
  /** Deterministic-enough randomness source (injectable for tests). */
  random(): number;
}

/** Base damage for an attack = contactDamage × damageMult. */
const ENGAGE_RANGE = 320;
const BASE_COOLDOWN_MS = 2400;
const ENRAGE_COOLDOWN_MULT = 0.6;
const ENRAGE_SPEED_MULT = 1.25;
/** Initial delay so bosses don't open with an instant attack. */
const FIRST_ATTACK_DELAY_MS = 1200;

export class BossBrain {
  private readonly attacks: readonly BossAttackDef[];
  private readonly contactDamage: number;
  private readonly enrageAt: number;
  private readonly phase?: BossPhaseDef;
  private readonly arena: Arena;
  private cooldown = FIRST_ATTACK_DELAY_MS;
  private nextIndex = 0;
  private enraged = false;
  private busyMs = 0;

  constructor(
    arena: Arena,
    attacks: readonly BossAttackDef[],
    contactDamage: number,
    enrageAtHpPct?: number,
    phase?: BossPhaseDef,
  ) {
    this.arena = arena;
    this.attacks = attacks;
    this.contactDamage = contactDamage;
    this.enrageAt = enrageAtHpPct ?? 0.5;
    this.phase = phase;
  }

  isEnraged(): boolean {
    return this.enraged;
  }

  isBusy(): boolean {
    return this.busyMs > 0;
  }

  /** Reserve a clean window for an arena-level mechanic such as a pulse. */
  defer(ms: number): void {
    this.busyMs = Math.max(this.busyMs, ms);
  }

  update(dtMs: number, cadenceMult = 1): void {
    if (this.attacks.length === 0) return;

    if (!this.enraged && this.arena.hpPct() <= this.enrageAt) {
      this.enraged = true;
      this.nextIndex = 0;
      this.arena.setSpeedMult(this.phase?.speedMult ?? ENRAGE_SPEED_MULT);
      this.arena.onEnrage();
    }

    if (this.busyMs > 0) {
      this.busyMs -= dtMs;
      return;
    }
    this.cooldown -= dtMs * Math.max(0.1, cadenceMult);
    if (this.cooldown > 0) return;

    const boss = this.arena.bossPos();
    const player = this.arena.playerPos();
    const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
    if (dist > ENGAGE_RANGE) return; // wait until the player engages

    const attacks = this.enraged && this.phase?.attacks?.length
      ? this.phase.attacks
      : this.attacks;
    const def = attacks[this.nextIndex % attacks.length];
    this.nextIndex++;
    this.cooldown = BASE_COOLDOWN_MS * (
      this.enraged ? this.phase?.cooldownMult ?? ENRAGE_COOLDOWN_MULT : 1
    );
    this.execute(def, boss, player);
  }

  private execute(
    def: BossAttackDef,
    boss: { x: number; y: number },
    player: { x: number; y: number },
  ): void {
    const dmg = (mult: number): number => Math.max(1, Math.round(this.contactDamage * mult));
    switch (def.type) {
      case 'aoe': {
        const count = def.count ?? 1;
        const center = def.at === 'self' ? boss : player;
        this.arena.hold(def.telegraphMs);
        this.busyMs = def.telegraphMs;
        for (let i = 0; i < count; i++) {
          // First blast on the target; extras scatter around it.
          const ang = this.arena.random() * Math.PI * 2;
          const r = i === 0 ? 0 : 24 + this.arena.random() * 56;
          const x = center.x + Math.cos(ang) * r;
          const y = center.y + Math.sin(ang) * r;
          this.arena.telegraph(x, y, def.radius, def.telegraphMs + i * 140, () =>
            this.arena.explode(x, y, def.radius, dmg(def.damageMult)),
          );
        }
        break;
      }
      case 'charge': {
        this.arena.hold(def.telegraphMs);
        this.busyMs = def.telegraphMs + def.durationMs;
        // Aim at where the player stood when the windup began (dodgeable).
        const tx = player.x;
        const ty = player.y;
        this.arena.telegraphCharge(
          boss.x,
          boss.y,
          tx,
          ty,
          def.speed,
          def.durationMs,
          def.telegraphMs,
          () => this.arena.dash(tx, ty, def.speed, def.durationMs),
        );
        break;
      }
      case 'shots': {
        const damage = dmg(def.damageMult);
        const angles: number[] = [];
        if (def.spread === 'radial') {
          for (let i = 0; i < def.count; i++) {
            angles.push((i / def.count) * Math.PI * 2);
          }
        } else {
          const base = Math.atan2(player.y - boss.y, player.x - boss.x);
          const arc = ((def.arcDeg ?? 50) * Math.PI) / 180;
          const n = Math.max(1, def.count);
          for (let i = 0; i < n; i++) {
            const t = n === 1 ? 0.5 : i / (n - 1);
            angles.push(base - arc / 2 + arc * t);
          }
        }
        const fire = (): void => {
          for (const angle of angles) this.arena.fireProjectile(angle, def.speed, damage);
        };
        const telegraphMs = def.telegraphMs ?? 0;
        if (telegraphMs > 0) {
          this.arena.hold(telegraphMs);
          this.busyMs = telegraphMs;
          this.arena.telegraphShots(boss.x, boss.y, angles, telegraphMs, fire);
        } else {
          const holdMs = 420;
          this.arena.hold(holdMs);
          this.busyMs = holdMs;
          fire();
        }
        break;
      }
      case 'summon': {
        const cap = def.maxMinions ?? 4;
        const holdMs = 500;
        this.arena.hold(holdMs);
        this.busyMs = holdMs;
        for (let i = 0; i < def.count; i++) {
          if (this.arena.minionCount() >= cap) break;
          if (!this.arena.summon(def.enemyId)) break;
        }
        break;
      }
    }
  }
}
