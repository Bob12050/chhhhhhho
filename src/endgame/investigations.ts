import { Rng } from '@/core/rng';
import { getEnemyDef } from '@/enemies/enemy-defs';
import type { GameState } from '@/player/game-state';
import {
  allQuests,
  replaceRuntimeQuests,
  type QuestDef,
} from '@/quests/quest-defs';

export const INVESTIGATION_GROUP = 'post-clear-investigations';
export const INVESTIGATION_PREFIX = 'investigation_';
export const INVESTIGATION_SEAL_ID = 'investigation_seal';
export const INVESTIGATION_BOARD_SIZE = 3;

interface Candidate {
  quest: QuestDef;
  enemyId: string;
  enemyName: string;
}

const CONDITIONS = [
  { label: '生命反応増大', hpBonus: 0.18, damageBonus: 0 },
  { label: '攻撃性増大', hpBonus: 0, damageBonus: 0.08 },
  { label: '深層共鳴', hpBonus: 0.1, damageBonus: 0.04 },
] as const;

function candidates(): Candidate[] {
  const byEnemy = new Map<string, Candidate>();
  for (const quest of allQuests()) {
    if (
      quest.investigation
      || quest.type !== 'hunt'
      || !quest.huntMap
      || quest.veteran
      || (quest.rank ?? 1) < 5
      || quest.objectives.length !== 1
      || quest.objectives[0].count !== 1
    ) continue;
    const enemyId = quest.objectives[0].enemyId;
    const enemy = getEnemyDef(enemyId);
    if (!enemy?.isBoss || byEnemy.has(enemyId)) continue;
    byEnemy.set(enemyId, { quest, enemyId, enemyName: enemy.name });
  }
  return [...byEnemy.values()].sort((a, b) => a.enemyId.localeCompare(b.enemyId));
}

function rewardRank(threat: number): number {
  if (threat >= 7) return 10;
  if (threat >= 4) return 9;
  return 8;
}

function nextSeed(seed: number, completed: number): number {
  return (Math.imul((seed ^ completed ^ 0x9e3779b9) >>> 0, 1664525) + 1013904223) >>> 0;
}

/** Rebuild the three deterministic contracts represented by the saved seed. */
export function syncInvestigationQuests(gs: GameState): QuestDef[] {
  const rng = new Rng(gs.investigationSeed || 1);
  const pool = candidates();
  const defs: QuestDef[] = [];
  const baseThreat = Math.min(10, 1 + Math.floor(gs.investigationsCompleted / 2));

  for (let index = 0; index < INVESTIGATION_BOARD_SIZE && pool.length > 0; index++) {
    const pick = pool.splice(rng.intRange(0, pool.length - 1), 1)[0];
    const threat = Math.min(10, baseThreat + rng.intRange(0, 2));
    const condition = CONDITIONS[rng.intRange(0, CONDITIONS.length - 1)];
    const hpMult = Number((1.1 + threat * 0.14 + condition.hpBonus).toFixed(2));
    const dmgMult = Number((1.02 + threat * 0.045 + condition.damageBonus).toFixed(2));
    const sealQty = 1 + Math.floor((threat - 1) / 3);
    defs.push({
      id: `${INVESTIGATION_PREFIX}${gs.investigationSeed.toString(16)}_${index}`,
      name: `調査：${pick.enemyName}`,
      type: 'hunt',
      description: `危険度${threat}・${condition.label}`,
      objectives: [{ type: 'kill', enemyId: pick.enemyId, count: 1 }],
      require: {
        minLevel: 90 + Math.min(6, Math.floor(threat / 2)),
        flag: 'main_story_complete',
      },
      rewards: {
        gold: 2400 + threat * 350,
        exp: 12000 + threat * 1200,
        items: { [INVESTIGATION_SEAL_ID]: sealQty },
      },
      rank: 7,
      huntMap: pick.quest.huntMap,
      huntModifiers: { hpMult, dmgMult },
      investigation: {
        threat,
        condition: condition.label,
        rewardRank: rewardRank(threat),
        boardSeed: gs.investigationSeed,
      },
    });
  }

  replaceRuntimeQuests(INVESTIGATION_GROUP, defs);
  return defs;
}

/** Complete one contract, raise the record, and deal a fresh board. */
export function advanceInvestigationBoard(gs: GameState): void {
  gs.investigationsCompleted += 1;
  gs.investigationSeed = nextSeed(gs.investigationSeed, gs.investigationsCompleted);
  gs.completedQuests = gs.completedQuests.filter((id) => !id.startsWith(INVESTIGATION_PREFIX));
  syncInvestigationQuests(gs);
}
