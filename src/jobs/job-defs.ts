import jobsJson from '@/data/defs/jobs.json';
import type { BaseStats, DerivedStats } from '@/stats/stats';

/**
 * Job definitions (data-driven). A job contributes base-stat and derived
 * modifiers (via computeDerived), restricts equippable weapon tags, and is
 * entered by satisfying data-driven unlock conditions. Tiers 0..4 branch via
 * parentJobIds. The canonical tree is tier 0 (adventurer) + 1次〜4次職; the
 * gameplay that grows per-job levels lands in later phases (data-first).
 */
export type UnlockCondition =
  /** A specific job must have reached `level` (multi-job system). */
  | { type: 'jobLevel'; jobId: string; level: number }
  /** The character's active-job level must be at least `level`. */
  | { type: 'charLevel'; level: number }
  /** A skill must be learned. */
  | { type: 'skill'; skillId: string }
  /** A save flag must be set (e.g. boss defeated). */
  | { type: 'flag'; flag: string }
  /** A quest must be cleared. Quest content is TBD (high-difficulty trial). */
  | { type: 'quest'; questId: string };

export interface JobDef {
  id: string;
  name: string;
  tier: number;
  parentJobIds: string[];
  description: string;
  /** All conditions must be satisfied to change into this job (AND). */
  unlockConditions: UnlockCondition[];
  baseStatModifiers?: Partial<BaseStats>;
  derivedModifiers?: Partial<DerivedStats>;
  equippableWeaponTags: string[];
  skillTreeId?: string;
}

interface JobsFile {
  jobs: JobDef[];
}

const jobs = new Map<string, JobDef>();
for (const j of (jobsJson as unknown as JobsFile).jobs) jobs.set(j.id, j);

export function getJob(id: string): JobDef | undefined {
  return jobs.get(id);
}

export function allJobs(): JobDef[] {
  return [...jobs.values()];
}
