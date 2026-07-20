/**
 * Pure hunt-wave logic for arena quests (連続狩猟/露払い). Objectives of a
 * hunt quest are consumed IN ORDER: the arena spawns only the first
 * incomplete objective's enemies; when it completes the next wave spawns.
 * Engine-independent so Vitest can cover the progression rules.
 */

import type { QuestDef } from './quest-defs';

/** Stat/reward modifiers applied to 歴戦 (veteran) hunt targets. */
export const VETERAN_MODS = {
  hpMult: 1.6,
  dmgMult: 1.3,
  /** Kill exp/gold multiplier. */
  rewardMult: 1.5,
  /** Added to the player's drop bonus (1 = drop chances doubled). */
  dropBonusAdd: 1,
} as const;

export interface HuntStatModifiers {
  hpMult: number;
  dmgMult: number;
  veteran: boolean;
}

const RANK_HP_MULTIPLIER = [0, 1, 1.35, 2.1, 3.2, 4.5, 6.5, 8] as const;
const RANK_DAMAGE_MULTIPLIER = [0, 0.7, 0.9, 1, 1.1, 1.8, 2.2, 2.5] as const;

/** Older main quests predate explicit stars; infer the same progression band. */
export function effectiveHuntRank(rank?: number, minLevel?: number): number {
  if (rank != null) return Math.max(1, Math.min(7, Math.round(rank)));
  const level = Math.max(1, Math.round(minLevel ?? 1));
  if (level >= 80) return 7;
  if (level >= 62) return 6;
  if (level >= 45) return 5;
  if (level >= 30) return 4;
  if (level >= 20) return 3;
  if (level >= 12) return 2;
  return 1;
}

/** Extra hunt vitality that accompanies the stronger R3-R10 weapon curve. */
export function huntRankHpMultiplier(rank = 1): number {
  const normalized = Math.max(1, Math.min(7, Math.round(rank)));
  return RANK_HP_MULTIPLIER[normalized];
}

/** Incoming damage growth that keeps higher-rank armour meaningful. */
export function huntRankDamageMultiplier(rank = 1): number {
  const normalized = Math.max(1, Math.min(7, Math.round(rank)));
  return RANK_DAMAGE_MULTIPLIER[normalized];
}

/** Resolve the exact combat multipliers used by both gameplay and diagnostics. */
export function huntStatModifiers(
  q: Pick<QuestDef, 'rank' | 'veteran' | 'huntModifiers' | 'require'>,
): HuntStatModifiers {
  const veteran = !!q.veteran;
  const rank = effectiveHuntRank(q.rank, q.require?.minLevel);
  return {
    hpMult:
      (q.huntModifiers?.hpMult ?? 1)
      * huntRankHpMultiplier(rank)
      * (veteran ? VETERAN_MODS.hpMult : 1),
    dmgMult:
      (q.huntModifiers?.dmgMult ?? 1)
      * huntRankDamageMultiplier(rank)
      * (veteran ? VETERAN_MODS.dmgMult : 1),
    veteran,
  };
}

export interface HuntWave {
  objectiveIndex: number;
  enemyId: string;
  /** Kills still needed to finish this objective. */
  remaining: number;
}

/**
 * The current wave = first objective with kills left. `null` when the quest
 * is finished (or has no objectives).
 */
export function currentWave(
  q: Pick<QuestDef, 'objectives'>,
  progress: Record<string, number> | undefined,
): HuntWave | null {
  for (let i = 0; i < q.objectives.length; i++) {
    const o = q.objectives[i];
    const have = progress?.[o.enemyId] ?? 0;
    if (have < o.count) {
      return { objectiveIndex: i, enemyId: o.enemyId, remaining: o.count - have };
    }
  }
  return null;
}

/**
 * How many of the wave's enemy may be alive at once. Bosses are always solo;
 * trash packs (露払い) are capped so mobile stays within the enemy budget.
 */
export function concurrentSpawnCount(remaining: number, isBoss: boolean): number {
  if (isBoss) return 1;
  return Math.max(1, Math.min(4, remaining));
}
