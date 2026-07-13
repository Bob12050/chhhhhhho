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

/** Resolve the exact combat multipliers used by both gameplay and diagnostics. */
export function huntStatModifiers(
  q: Pick<QuestDef, 'veteran' | 'huntModifiers'>,
): HuntStatModifiers {
  const veteran = !!q.veteran;
  return {
    hpMult: (q.huntModifiers?.hpMult ?? 1) * (veteran ? VETERAN_MODS.hpMult : 1),
    dmgMult: (q.huntModifiers?.dmgMult ?? 1) * (veteran ? VETERAN_MODS.dmgMult : 1),
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
