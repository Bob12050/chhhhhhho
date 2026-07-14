import { SKILL_TEX } from '@/assets/gen/textures';
import type { SkillDef } from '@/skills/skill-defs';

export interface SkillVisual {
  icon: string;
  accent: number;
}

const ELEMENT_ACCENT: Record<string, number> = {
  fire: 0xd96545,
  ice: 0x65b9df,
  thunder: 0xd9bd4c,
  holy: 0xe0c875,
};

const FAMILY_ACCENT: Record<string, number> = {
  warrior: 0xb85d54,
  mage: 0x5d83c5,
  cleric: 0xc3a759,
  thief: 0x766fb8,
  tamer: 0x8b6ca4,
};

function fallbackIcon(def: SkillDef): string {
  if (def.effect === 'heal') return SKILL_TEX.c_holylight;
  if (def.effect === 'buff') return SKILL_TEX.w_warcry;
  if (def.effect === 'projectile') return SKILL_TEX.b_volley;
  if (def.fx === 'magic') return SKILL_TEX.m_firebolt;
  if (def.fx === 'impact') return SKILL_TEX.power_strike;
  return SKILL_TEX.slash;
}

/** Visual identity shared by the combat HUD and skill menus. */
export function getSkillVisual(def: SkillDef): SkillVisual {
  const icon = SKILL_TEX[def.id as keyof typeof SKILL_TEX] ?? fallbackIcon(def);
  const accent =
    (def.effect === 'heal' ? 0x69b987 : undefined)
    ?? ELEMENT_ACCENT[def.element ?? '']
    ?? FAMILY_ACCENT[def.family ?? '']
    ?? (def.effect === 'buff' ? 0xd2a84e : 0x6685b7);
  return { icon, accent };
}
