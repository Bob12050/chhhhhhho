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

export type QuestType = 'subjugation' | 'unlock' | 'hunt';

export interface QuestDef {
  id: string;
  name: string;
  type: QuestType;
  description: string;
  objectives: QuestObjective[];
  require?: QuestRequire;
  rewards: QuestReward;
  repeatable?: boolean;
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
