import regaliaJson from '@/data/defs/job-regalia.json';
import type { EquipmentDef } from '@/data/items';
import type { QuestDef } from '@/quests/quest-defs';
import type { DerivedStats } from '@/stats/stats';
import { getJob } from '@/jobs/job-defs';

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
export const JOB_REGALIA_PARTS = ['head', 'torso', 'weapon'] as const;
export type JobRegaliaPart = (typeof JOB_REGALIA_PARTS)[number];

/** Torso keeps the original id so existing saves remain valid. */
export function jobRegaliaItemId(jobId: string, part: JobRegaliaPart = 'torso'): string {
  const base = `job_regalia_${jobId}`;
  return part === 'torso' ? base : `${base}_${part}`;
}

export function jobRegaliaItemIds(jobId: string): Record<JobRegaliaPart, string> {
  return {
    head: jobRegaliaItemId(jobId, 'head'),
    torso: jobRegaliaItemId(jobId, 'torso'),
    weapon: jobRegaliaItemId(jobId, 'weapon'),
  };
}

export function jobRegaliaQuestId(jobId: string): string {
  return `job_regalia_trial_${jobId}`;
}

export function jobRegaliaForJob(jobId: string): JobRegaliaRecord | undefined {
  return JOB_REGALIA.find((entry) => entry.jobId === jobId);
}

const PART_META: Record<JobRegaliaPart, {
  slot: EquipmentDef['slot'];
  label: string;
  visualId: string;
}> = {
  head: { slot: 'head', label: '頭具', visualId: 'helm_iron' },
  torso: { slot: 'torso', label: '胴衣', visualId: 'vest_cloth' },
  weapon: { slot: 'main_hand', label: '武器', visualId: 'sword_iron' },
};

const OFFENSE_STATS = new Set<keyof DerivedStats>([
  'physAtk',
  'magAtk',
  'accuracy',
  'critRate',
  'atkSpeed',
  'lifesteal',
]);
const MAGIC_STATS = new Set<keyof DerivedStats>(['magDef', 'maxMp']);
const UTILITY_STATS = new Set<keyof DerivedStats>(['evasion', 'dropRate', 'goldRate', 'moveSpeed']);

/** Split the former one-piece total without changing full-set power. */
export function splitJobRegaliaDerived(
  total: Partial<DerivedStats>,
): Record<JobRegaliaPart, Partial<DerivedStats>> {
  const out: Record<JobRegaliaPart, Partial<DerivedStats>> = {
    head: {},
    torso: {},
    weapon: {},
  };
  for (const [rawKey, rawValue] of Object.entries(total)) {
    const key = rawKey as keyof DerivedStats;
    const value = rawValue as number;
    const weights: readonly [number, number, number] = OFFENSE_STATS.has(key)
      ? [0, 0, 1]
      : MAGIC_STATS.has(key)
        ? [0.35, 0.45, 0.2]
        : UTILITY_STATS.has(key)
          ? [0.35, 0.25, 0.4]
          : [0.3, 0.55, 0.15];
    const precision = Math.abs(value) < 1 ? 1000 : 1;
    const head = Math.round(value * weights[0] * precision) / precision;
    const torso = Math.round(value * weights[1] * precision) / precision;
    const weapon = Math.round((value - head - torso) * precision) / precision;
    if (head !== 0) out.head[key] = head;
    if (torso !== 0) out.torso[key] = torso;
    if (weapon !== 0) out.weapon[key] = weapon;
  }
  return out;
}

/** Three exact-job pieces complete the authored class appearance together. */
export function buildJobRegaliaEquipment(): EquipmentDef[] {
  return JOB_REGALIA.flatMap((entry) => {
    const split = splitJobRegaliaDerived(entry.derived);
    const weaponTag = getJob(entry.jobId)?.equippableWeaponTags[0];
    return JOB_REGALIA_PARTS.map((part): EquipmentDef => {
      const meta = PART_META[part];
      return {
        id: jobRegaliaItemId(entry.jobId, part),
        name: `${entry.itemName}・${meta.label}`,
        slot: meta.slot,
        rarity: entry.rarity,
        visualId: meta.visualId,
        appearance: entry.appearance,
        ...(part === 'weapon' && weaponTag ? { weaponTags: [weaponTag] } : {}),
        element: 'none',
        levelRequirement: entry.levelRequirement,
        jobRequirements: [entry.jobId],
        derived: split[part],
        sellPrice: 0,
        series: entry.itemName,
        description: `${entry.jobName}専用の${meta.label}。頭・胴・武器の3点を装備すると固有の姿が完成する。`,
      };
    });
  });
}

/** One-time class trials that award the matching regalia. */
export function buildJobRegaliaQuests(): QuestDef[] {
  return JOB_REGALIA.map((entry) => {
    const ids = jobRegaliaItemIds(entry.jobId);
    return {
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
        items: {
          [ids.head]: 1,
          [ids.torso]: 1,
          [ids.weapon]: 1,
        },
      },
      rank: entry.rank,
      huntMap: entry.huntMap,
    } satisfies QuestDef;
  });
}
