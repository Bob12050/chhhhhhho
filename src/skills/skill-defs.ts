import skillsJson from '@/data/defs/skills.json';
import type { DerivedStats } from '@/stats/stats';
import type { ClassFamily } from '@/jobs/job-defs';

/**
 * Skill definitions (data-driven). Active skills are forward strikes with a
 * power multiplier / reach / MP cost / cooldown; passive skills contribute
 * derived-stat modifiers via computeDerived. Learning is gated by level,
 * prerequisite skills, and (for job skills) the active job's class family.
 * Effect composition expands in later phases.
 */
export type SkillType = 'active' | 'passive';

/** Which stat an active skill scales off. Defaults to 'phys'. */
export type SkillScaling = 'phys' | 'mag';

export interface SkillDef {
  id: string;
  name: string;
  type: SkillType;
  description: string;
  // Active
  mpCost?: number;
  cooldown?: number; // ms
  powerMult?: number; // damage = (phys|mag)Atk * powerMult
  reach?: number;
  radius?: number;
  knockback?: number;
  /** Which attack stat the damage scales off ('phys' default | 'mag'). */
  scaling?: SkillScaling;
  /** Visual style for the cast effect ('slash' | 'impact' | 'magic'). */
  fx?: string;
  /**
   * Element carried by this skill's damage (see elements.ts). Omitted/`none`
   * falls back to the equipped weapon's element so martial skills still riding
   * an elemental weapon proc its status.
   */
  element?: string;
  // Passive
  derived?: Partial<DerivedStats>;
  // Learning gates
  requiredLevel?: number;
  requires?: string[];
  /**
   * Class family this skill belongs to. Only learnable while the active job's
   * family matches. Omitted = common skill, learnable by any job.
   */
  family?: ClassFamily;
  /**
   * Minimum job tier (1=1次職 … 4=4次職) required to learn. The active job must
   * have reached this tier, so promotion — not just character level — unlocks
   * higher skills. Omitted = no tier gate (common skills).
   */
  minTier?: number;
}

interface SkillsFile {
  skills: SkillDef[];
}

const skills = new Map<string, SkillDef>();
for (const s of (skillsJson as unknown as SkillsFile).skills) skills.set(s.id, s);

export function getSkill(id: string): SkillDef | undefined {
  return skills.get(id);
}

export function allSkills(): SkillDef[] {
  return [...skills.values()];
}
