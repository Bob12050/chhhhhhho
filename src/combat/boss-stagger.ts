import type { BossStaggerDef } from '@/enemies/enemy-defs';

export interface BossStaggerHit {
  damage: number;
  skill: boolean;
  crit: boolean;
  weak: boolean;
}

/** Engine-independent boss break gauge, including decay and down timing. */
export class BossStaggerMeter {
  private value = 0;
  private downRemainingMs = 0;
  private decayDelayMs = 0;

  constructor(private readonly cfg: BossStaggerDef) {}

  get ratio(): number {
    return Math.max(0, Math.min(1, this.value / this.cfg.max));
  }

  get isDown(): boolean {
    return this.downRemainingMs > 0;
  }

  get downMs(): number {
    return this.cfg.downMs;
  }

  hit(hit: BossStaggerHit): boolean {
    if (this.isDown || this.cfg.max <= 0) return false;
    const gain = Math.min(
      this.cfg.max * 0.4,
      Math.max(3, Math.round(hit.damage * (this.cfg.damageRate ?? 0.25)))
        + (hit.skill ? this.cfg.skillBonus ?? 0 : 0)
        + (hit.crit ? this.cfg.critBonus ?? 0 : 0)
        + (hit.weak ? this.cfg.weaknessBonus ?? 0 : 0),
    );
    this.value = Math.min(this.cfg.max, this.value + gain);
    this.decayDelayMs = this.cfg.decayDelayMs ?? 1_600;
    if (this.value < this.cfg.max) return false;
    this.value = 0;
    this.downRemainingMs = this.cfg.downMs;
    return true;
  }

  update(dtMs: number): void {
    if (this.downRemainingMs > 0) {
      this.downRemainingMs = Math.max(0, this.downRemainingMs - dtMs);
      return;
    }
    if (this.decayDelayMs > 0) {
      this.decayDelayMs = Math.max(0, this.decayDelayMs - dtMs);
      return;
    }
    const decay = this.cfg.decayPerSecond ?? 0;
    if (decay > 0) this.value = Math.max(0, this.value - (decay * dtMs) / 1000);
  }
}
