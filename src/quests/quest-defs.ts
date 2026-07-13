import questsJson from '@/data/defs/quests.json';

/**
 * Quest definitions (data-driven). v1 supports kill objectives (normal enemies
 * or bosses), optional availability gates, and rewards (gold/exp/items/flags).
 * Completing a quest can set flags — e.g. `quest_tier4_trial` which the job
 * tree already reads to unlock 4次職. Quest progress lives in the save.
 */
export type QuestObjective = { type: 'kill'; enemyId: string; count: number };

export interface QuestReward {
  gold?: number;
  exp?: number;
  items?: Record<string, number>;
  /** Flags set on turn-in (e.g. a job-unlock flag). */
  setFlags?: string[];
}

export interface QuestRequire {
  /** Minimum active-job level to accept. */
  minLevel?: number;
  /** A prerequisite quest must be completed first. */
  questDone?: string;
  /** A save flag must be set. */
  flag?: string;
}

export interface HuntModifiers {
  /** Quest-local target HP multiplier, combined with the veteran modifier. */
  hpMult?: number;
  /** Quest-local target contact/attack damage multiplier. */
  dmgMult?: number;
}

/** 'main' = the one-shot story line (own board tab, chained, non-repeatable). */
export type QuestType = 'subjugation' | 'unlock' | 'hunt' | 'main';

export interface QuestDef {
  id: string;
  name: string;
  type: QuestType;
  description: string;
  objectives: QuestObjective[];
  require?: QuestRequire;
  rewards: QuestReward;
  repeatable?: boolean;
  /** MH-style difficulty rank (★1〜★7). Drives board grouping/sorting. */
  rank?: number;
  /**
   * Monster-Hunter style hunt: while this quest is active, its target
   * enemies spawn in `huntMap`. Accepting it departs the player to that map.
   * The target despawns/returns on quest turn-in (re-accept to re-hunt).
   * Objectives are hunted IN ORDER (連続狩猟/露払い waves).
   */
  huntMap?: string;
  /** Optional quest-local scaling for rematches that reuse an earlier enemy. */
  huntModifiers?: HuntModifiers;
  /**
   * 歴戦 individual: hunt targets spawn with VETERAN_MODS (more HP/damage,
   * bigger kill rewards, doubled drop chances). See src/quests/hunt-logic.ts.
   */
  veteran?: boolean;
}

interface QuestsFile {
  quests: QuestDef[];
}

const quests = new Map<string, QuestDef>();
for (const q of (questsJson as unknown as QuestsFile).quests) quests.set(q.id, q);

export function getQuest(id: string): QuestDef | undefined {
  return quests.get(id);
}

export function allQuests(): QuestDef[] {
  return [...quests.values()];
}
