/**
 * Stat model and the SINGLE derived-stat calculator. UI and combat both read
 * from compute() so displayed and effective values can never diverge. Pure and
 * engine-independent (unit-tested under Vitest).
 */

export interface BaseStats {
  STR: number;
  VIT: number;
  INT: number;
  DEX: number;
  LUK: number;
}

export interface DerivedStats {
  maxHp: number;
  maxMp: number;
  physAtk: number;
  magAtk: number;
  def: number;
  magDef: number;
  accuracy: number;
  evasion: number;
  critRate: number; // 0..1
  atkSpeed: number; // multiplier (1 = base)
  moveSpeed: number; // logical px/sec
  /** Drop-chance bonus (0.15 = +15%). From LUK and charm-type accessories. */
  dropRate: number;
  /** 吸血: fraction of dealt damage returned as HP (0.05 = 5%). Gear-only. */
  lifesteal: number;
  /** 金運: gold-gain bonus (0.2 = +20%). Gear-only. */
  goldRate: number;
}

/** Flat additive modifiers, e.g. from equipment / job / passives. */
export interface StatModifiers {
  base?: Partial<BaseStats>;
  derived?: Partial<DerivedStats>;
}

export const ZERO_BASE: BaseStats = { STR: 0, VIT: 0, INT: 0, DEX: 0, LUK: 0 };

export function addBase(a: BaseStats, b: Partial<BaseStats>): BaseStats {
  return {
    STR: a.STR + (b.STR ?? 0),
    VIT: a.VIT + (b.VIT ?? 0),
    INT: a.INT + (b.INT ?? 0),
    DEX: a.DEX + (b.DEX ?? 0),
    LUK: a.LUK + (b.LUK ?? 0),
  };
}

/**
 * Compute derived stats. Order: base stats (incl. allocated points) -> job &
 * passive base modifiers -> equipment base modifiers -> formula -> additive
 * derived modifiers. Centralized so there is exactly one source of truth.
 */
export function computeDerived(
  baseStats: BaseStats,
  modifiers: readonly StatModifiers[] = [],
): DerivedStats {
  // 1) Fold in base-stat modifiers.
  let base = baseStats;
  for (const m of modifiers) if (m.base) base = addBase(base, m.base);

  // 2) Formula from base stats.
  const derived: DerivedStats = {
    maxHp: 30 + base.VIT * 8 + base.STR * 1,
    maxMp: 10 + base.INT * 6,
    physAtk: 2 + base.STR * 2 + Math.floor(base.DEX * 0.5),
    magAtk: 2 + base.INT * 2,
    def: Math.floor(base.VIT * 1.0),
    magDef: Math.floor(base.INT * 0.7 + base.VIT * 0.3),
    accuracy: 75 + base.DEX * 2,
    evasion: Math.floor(base.DEX * 1.0 + base.LUK * 0.5),
    critRate: Math.min(0.5, 0.02 + base.LUK * 0.005),
    atkSpeed: 1 + base.DEX * 0.01,
    moveSpeed: 90,
    // 運 literally: LUK makes materials drop more (5 LUK ≈ +1.5%).
    dropRate: base.LUK * 0.003,
    // Boss-gear specials: no base-stat contribution, equipment only.
    lifesteal: 0,
    goldRate: 0,
  };

  // 3) Additive derived modifiers (equipment etc.).
  for (const m of modifiers) {
    if (!m.derived) continue;
    for (const k of Object.keys(m.derived) as (keyof DerivedStats)[]) {
      derived[k] += m.derived[k] ?? 0;
    }
  }

  // Clamp.
  derived.critRate = Math.max(0, Math.min(1, derived.critRate));
  derived.lifesteal = Math.max(0, Math.min(0.5, derived.lifesteal));
  derived.goldRate = Math.max(0, derived.goldRate);
  derived.maxHp = Math.max(1, Math.round(derived.maxHp));
  derived.maxMp = Math.max(0, Math.round(derived.maxMp));
  return derived;
}
