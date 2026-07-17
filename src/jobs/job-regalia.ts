import regaliaJson from '@/data/defs/job-regalia.json';
import type { EquipmentDef } from '@/data/items';
import type { QuestDef } from '@/quests/quest-defs';
import type { DerivedStats } from '@/stats/stats';

export interface JobRegaliaRecord {
  jobId: string;
  jobName: string;
  itemName: string;
  appearance: string;
  rarity: number;
  levelRequirement: number;
  rank: number;
  trialName: string;
  huntMap: string;
  enemyId: string;
  derived: Partial<DerivedStats>;
}

interface JobRegaliaFile {
  regalia: JobRegaliaRecord[];
}

export const JOB_REGALIA: readonly JobRegaliaRecord[] = (
  regaliaJson as unknown as JobRegaliaFile
).regalia;

const GOLD_BY_RANK = [0, 350, 700, 1200, 2200, 3500, 5200, 8000];
const EXP_BY_RANK = [0, 900, 1800, 3200, 6000, 11000, 20000, 36000];

export function jobRegaliaItemId(jobId: string): string {
  return `job_regalia_${jobId}`;
}

export function jobRegaliaQuestId(jobId: string): string {
  return `job_regalia_trial_${jobId}`;
}

export function jobRegaliaForJob(jobId: string): JobRegaliaRecord | undefined {
  return JOB_REGALIA.find((entry) => entry.jobId === jobId);
}

/** Authored full-body job looks exposed as exact-job torso equipment. */
export function buildJobRegaliaEquipment(): EquipmentDef[] {
  return JOB_REGALIA.map((entry) => ({
    id: jobRegaliaItemId(entry.jobId),
    name: entry.itemName,
    slot: 'torso',
    rarity: entry.rarity,
    visualId: 'vest_cloth',
    appearance: entry.appearance,
    element: 'none',
    levelRequirement: entry.levelRequirement,
    jobRequirements: [entry.jobId],
    derived: { ...entry.derived },
    sellPrice: 0,
    series: '職業専用装備',
    description: `${entry.jobName}だけが身につけられる職業専用の一式装備。装備すると固有の姿に変わる。`,
  }));
}

/** One-time class trials that award the matching regalia. */
export function buildJobRegaliaQuests(): QuestDef[] {
  return JOB_REGALIA.map((entry) => ({
    id: jobRegaliaQuestId(entry.jobId),
    name: entry.trialName,
    type: 'unlock',
    description: `${entry.itemName}を継ぐ資格を示すため、${entry.jobName}で指定された大型モンスターを討伐せよ。`,
    objectives: [{ type: 'kill', enemyId: entry.enemyId, count: 1 }],
    require: {
      minLevel: entry.levelRequirement,
      jobId: entry.jobId,
    },
    rewards: {
      gold: GOLD_BY_RANK[entry.rank] ?? 0,
      exp: EXP_BY_RANK[entry.rank] ?? 0,
      items: { [jobRegaliaItemId(entry.jobId)]: 1 },
    },
    rank: entry.rank,
    huntMap: entry.huntMap,
  }));
}
