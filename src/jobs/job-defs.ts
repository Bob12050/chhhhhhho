import jobsJson from '@/data/defs/jobs.json';
import type { BaseStats, DerivedStats } from '@/stats/stats';

/**
 * Job definitions (data-driven). A job contributes base-stat and derived
 * modifiers (via computeDerived), restricts equippable weapon tags, and is
 * entered by satisfying data-driven unlock conditions. Tiers 0..4 branch via
 * parentJobIds; Phase 1 ships tier 0 (novice) and tier 1 (warrior).
 */
export interface JobUnlock {
  level?: number;
  requiresJob?: string;
  requiresSkill?: string;
  flag?: string;
}

export interface JobDef {
  id: string;
  name: string;
  tier: number;
  parentJobIds: string[];
  description: string;
  unlock?: JobUnlock;
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
