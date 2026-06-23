import skillsJson from '@/data/defs/skills.json';
import type { DerivedStats } from '@/stats/stats';

/**
 * Skill definitions (data-driven). Active skills are forward strikes with a
 * power multiplier / reach / MP cost / cooldown; passive skills contribute
 * derived-stat modifiers via computeDerived. Learning is gated by level and
 * prerequisite skills. Effect composition expands in later phases.
 */
export type SkillType = 'active' | 'passive';

export interface SkillDef {
  id: string;
  name: string;
  type: SkillType;
  description: string;
  // Active
  mpCost?: number;
  cooldown?: number; // ms
  powerMult?: number; // damage = physAtk * powerMult
  reach?: number;
  radius?: number;
  knockback?: number;
  // Passive
  derived?: Partial<DerivedStats>;
  // Learning gates
  requiredLevel?: number;
  requires?: string[];
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
