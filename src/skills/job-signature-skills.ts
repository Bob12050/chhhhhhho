import type { ClassFamily } from '@/jobs/job-defs';
import type { SkillDef } from '@/skills/skill-defs';

interface SignatureSkillSpec {
  key: string;
  name: string;
  description: string;
  mpCost: number;
  cooldown: number;
  powerMult?: number;
  reach?: number;
  radius?: number;
  knockback?: number;
  scaling: 'phys' | 'mag';
  fx: 'slash' | 'impact' | 'magic';
  icon: string;
  effect?: 'damage' | 'projectile' | 'heal' | 'buff';
  projSpeed?: number;
  projCount?: number;
  buffStats?: SkillDef['buffStats'];
  buffMs?: number;
  element?: string;
}

interface JobSkillKit {
  jobId: string;
  family: ClassFamily;
  tier: number;
  skills: readonly [SignatureSkillSpec, SignatureSkillSpec];
}

const JOB_SKILL_KITS: readonly JobSkillKit[] = [
  {
    jobId: 'fighter', family: 'warrior', tier: 1,
    skills: [
      { key: 'break_bash', name: 'ブレイクバッシュ', description: '盾ごと踏み込み、敵を大きく弾く。', mpCost: 8, cooldown: 1200, powerMult: 2.2, reach: 34, radius: 40, knockback: 58, scaling: 'phys', fx: 'impact', icon: 'power_strike' },
      { key: 'fortress', name: 'フォートレス', description: '構えを固め、物理・魔法防御を高める。', mpCost: 12, cooldown: 18000, scaling: 'phys', fx: 'impact', icon: 'w_warcry', effect: 'buff', buffStats: { def: 14, magDef: 8 }, buffMs: 10000 },
    ],
  },
  {
    jobId: 'mage', family: 'mage', tier: 1,
    skills: [
      { key: 'mana_spear', name: 'マナスピア', description: '凝縮した魔力の槍を一直線に放つ。', mpCost: 9, cooldown: 1100, powerMult: 2.3, scaling: 'mag', fx: 'magic', icon: 'm_firebolt', effect: 'projectile', projSpeed: 280 },
      { key: 'overcharge', name: 'オーバーチャージ', description: '魔力回路を開き、魔攻と詠唱速度を高める。', mpCost: 14, cooldown: 18000, scaling: 'mag', fx: 'magic', icon: 'm_thunder', effect: 'buff', buffStats: { magAtk: 14, atkSpeed: 0.08 }, buffMs: 10000 },
    ],
  },
  {
    jobId: 'priest', family: 'cleric', tier: 1,
    skills: [
      { key: 'healing_prayer', name: '癒しの祈り', description: '祈りを捧げ、自身のHPを回復する。', mpCost: 10, cooldown: 7000, powerMult: 1.8, scaling: 'mag', fx: 'magic', icon: 'c_holylight', effect: 'heal' },
      { key: 'holy_punish', name: 'ホーリーパニッシュ', description: '聖なる衝撃で前方を打ち払う。', mpCost: 12, cooldown: 1500, powerMult: 2.5, reach: 36, radius: 44, knockback: 36, scaling: 'mag', fx: 'impact', icon: 'c_smite', element: 'holy' },
    ],
  },
  {
    jobId: 'thief', family: 'thief', tier: 1,
    skills: [
      { key: 'flash_edge', name: 'フラッシュエッジ', description: '一瞬で間合いを詰め、急所を斬る。', mpCost: 7, cooldown: 700, powerMult: 2.0, reach: 40, radius: 34, knockback: 8, scaling: 'phys', fx: 'slash', icon: 't_quickstab' },
      { key: 'shadow_step', name: 'シャドウステップ', description: '影の歩法で回避・移動・攻撃速度を高める。', mpCost: 11, cooldown: 17000, scaling: 'phys', fx: 'magic', icon: 't_phantom', effect: 'buff', buffStats: { evasion: 10, moveSpeed: 8, atkSpeed: 0.12 }, buffMs: 9000 },
    ],
  },
  {
    jobId: 'pet_raiser', family: 'tamer', tier: 1,
    skills: [
      { key: 'beast_rush', name: 'ビーストラッシュ', description: '相棒と呼吸を合わせ、前方へ突撃する。', mpCost: 8, cooldown: 1200, powerMult: 2.2, reach: 40, radius: 44, knockback: 34, scaling: 'phys', fx: 'impact', icon: 'b_beastclaw' },
      { key: 'heart_link', name: 'ハートリンク', description: '相棒との絆で攻撃力と命中を高める。', mpCost: 13, cooldown: 18000, scaling: 'phys', fx: 'magic', icon: 'b_genesis', effect: 'buff', buffStats: { physAtk: 8, magAtk: 8, accuracy: 10 }, buffMs: 10000 },
    ],
  },
  {
    jobId: 'samurai', family: 'warrior', tier: 2,
    skills: [
      { key: 'iai_ichimonji', name: '居合・一文字', description: '鞘走りの一閃で広く斬り抜ける。', mpCost: 16, cooldown: 1500, powerMult: 3.3, reach: 46, radius: 48, knockback: 28, scaling: 'phys', fx: 'slash', icon: 'w_whirl' },
      { key: 'clear_mind', name: '明鏡止水', description: '心を澄ませ、物理攻撃と会心を高める。', mpCost: 20, cooldown: 19000, scaling: 'phys', fx: 'magic', icon: 'w_warcry', effect: 'buff', buffStats: { physAtk: 35, critRate: 0.12 }, buffMs: 10000 },
    ],
  },
  {
    jobId: 'sorcerer', family: 'mage', tier: 2,
    skills: [
      { key: 'element_burst', name: 'エレメントバースト', description: '三つの高密度魔弾を扇状に放つ。', mpCost: 20, cooldown: 1800, powerMult: 1.15, scaling: 'mag', fx: 'magic', icon: 'm_firebolt', effect: 'projectile', projSpeed: 250, projCount: 3, element: 'fire' },
      { key: 'arcana_drive', name: 'アルカナドライブ', description: '秘術を巡らせ、魔攻と最大MPを高める。', mpCost: 22, cooldown: 20000, scaling: 'mag', fx: 'magic', icon: 'm_thunder', effect: 'buff', buffStats: { magAtk: 40, maxMp: 30 }, buffMs: 11000 },
    ],
  },
  {
    jobId: 'holy_knight', family: 'cleric', tier: 2,
    skills: [
      { key: 'sacred_bash', name: 'セイクリッドバッシュ', description: '聖盾を叩きつけ、敵を強く押し返す。', mpCost: 17, cooldown: 1600, powerMult: 3.2, reach: 38, radius: 50, knockback: 62, scaling: 'phys', fx: 'impact', icon: 'c_smite', element: 'holy' },
      { key: 'guardian_aura', name: 'ガーディアンオーラ', description: '守護の光で物理・魔法防御を高める。', mpCost: 23, cooldown: 20000, scaling: 'mag', fx: 'magic', icon: 'c_holylight', effect: 'buff', buffStats: { def: 45, magDef: 35 }, buffMs: 11000 },
    ],
  },
  {
    jobId: 'ninja', family: 'thief', tier: 2,
    skills: [
      { key: 'fuuma_shuriken', name: '風魔手裏剣', description: '三枚の大型手裏剣を素早く放つ。', mpCost: 16, cooldown: 1400, powerMult: 1.1, scaling: 'phys', fx: 'slash', icon: 'b_volley', effect: 'projectile', projSpeed: 310, projCount: 3 },
      { key: 'mist_veil', name: '煙遁・朧', description: '煙に紛れ、回避・会心・移動を高める。', mpCost: 19, cooldown: 18000, scaling: 'phys', fx: 'magic', icon: 't_phantom', effect: 'buff', buffStats: { evasion: 20, critRate: 0.12, moveSpeed: 12 }, buffMs: 9000 },
    ],
  },
  {
    jobId: 'ranger', family: 'tamer', tier: 2,
    skills: [
      { key: 'arrow_rain', name: 'アローレイン', description: '五本の矢を扇状に一斉射撃する。', mpCost: 18, cooldown: 1700, powerMult: 0.75, scaling: 'phys', fx: 'magic', icon: 'b_volley', effect: 'projectile', projSpeed: 300, projCount: 5 },
      { key: 'hunters_eye', name: '狩人の眼', description: '獲物を見定め、攻撃・命中・会心を高める。', mpCost: 20, cooldown: 19000, scaling: 'phys', fx: 'magic', icon: 't_shadowfang', effect: 'buff', buffStats: { physAtk: 28, accuracy: 20, critRate: 0.1 }, buffMs: 10000 },
    ],
  },
  {
    jobId: 'sword_kaiser', family: 'warrior', tier: 3,
    skills: [
      { key: 'imperial_skyblade', name: '皇刃・天翔', description: '皇剣の一閃で前方一帯を断ち切る。', mpCost: 28, cooldown: 2100, powerMult: 4.8, reach: 52, radius: 58, knockback: 42, scaling: 'phys', fx: 'slash', icon: 'w_calamity' },
      { key: 'kaiser_spirit', name: '剣帝の覇気', description: '剣帝の気迫で物理攻撃と会心を高める。', mpCost: 32, cooldown: 21000, scaling: 'phys', fx: 'impact', icon: 'w_warcry', effect: 'buff', buffStats: { physAtk: 120, critRate: 0.15 }, buffMs: 11000 },
    ],
  },
  {
    jobId: 'grand_magia', family: 'mage', tier: 3,
    skills: [
      { key: 'astral_ray', name: 'アストラルレイ', description: '三条の星光を高速で撃ち出す。', mpCost: 32, cooldown: 2200, powerMult: 1.65, scaling: 'mag', fx: 'magic', icon: 'm_meteor', effect: 'projectile', projSpeed: 330, projCount: 3, element: 'holy' },
      { key: 'magia_overdrive', name: 'マギアオーバードライブ', description: '魔導炉を解放し、魔攻と詠唱速度を高める。', mpCost: 38, cooldown: 22000, scaling: 'mag', fx: 'magic', icon: 'm_thunder', effect: 'buff', buffStats: { magAtk: 130, atkSpeed: 0.15 }, buffMs: 11000 },
    ],
  },
  {
    jobId: 'shield_saber', family: 'cleric', tier: 3,
    skills: [
      { key: 'grand_shield', name: 'グランドシールド', description: '巨盾の衝撃で広範囲を押し潰す。', mpCost: 29, cooldown: 2200, powerMult: 4.5, reach: 42, radius: 62, knockback: 76, scaling: 'phys', fx: 'impact', icon: 'w_quake', element: 'holy' },
      { key: 'aegis_field', name: 'アイギスフィールド', description: '神盾の領域で物理・魔法防御を高める。', mpCost: 36, cooldown: 22000, scaling: 'mag', fx: 'magic', icon: 'c_genesis', effect: 'buff', buffStats: { def: 140, magDef: 100 }, buffMs: 12000 },
    ],
  },
  {
    jobId: 'avengista', family: 'thief', tier: 3,
    skills: [
      { key: 'revenge_edge', name: 'リベンジエッジ', description: '憎悪を刃へ変え、深く斬り裂く。', mpCost: 27, cooldown: 1700, powerMult: 4.6, reach: 44, radius: 50, knockback: 12, scaling: 'phys', fx: 'slash', icon: 't_shadowfang' },
      { key: 'blood_accel', name: 'ブラッドアクセル', description: '血気を燃やし、攻撃速度と吸血を高める。', mpCost: 34, cooldown: 21000, scaling: 'phys', fx: 'magic', icon: 't_phantom', effect: 'buff', buffStats: { physAtk: 110, atkSpeed: 0.18, lifesteal: 0.08 }, buffMs: 10000 },
    ],
  },
  {
    jobId: 'dual_star', family: 'tamer', tier: 3,
    skills: [
      { key: 'twin_nova', name: 'ツインノヴァ', description: '相棒と五つの星弾を一斉に放つ。', mpCost: 31, cooldown: 2100, powerMult: 1.0, scaling: 'phys', fx: 'magic', icon: 'b_volley', effect: 'projectile', projSpeed: 315, projCount: 5, element: 'holy' },
      { key: 'dual_link', name: 'デュアルリンク', description: '二つの魂を結び、攻撃・命中・会心を高める。', mpCost: 36, cooldown: 22000, scaling: 'phys', fx: 'magic', icon: 'b_genesis', effect: 'buff', buffStats: { physAtk: 80, magAtk: 80, accuracy: 25, critRate: 0.12 }, buffMs: 11000 },
    ],
  },
  {
    jobId: 'aramikagura', family: 'warrior', tier: 4,
    skills: [
      { key: 'crimson_kagura', name: '神楽剣・紅天', description: '紅蓮を纏う神速の一閃で焼き斬る。', mpCost: 46, cooldown: 2700, powerMult: 6.5, reach: 58, radius: 64, knockback: 48, scaling: 'phys', fx: 'slash', icon: 'w_calamity', element: 'fire' },
      { key: 'world_sunder', name: '天地開闢', description: '大地ごと断つ、剣神の最終奥義。', mpCost: 62, cooldown: 6500, powerMult: 7.8, reach: 54, radius: 78, knockback: 88, scaling: 'phys', fx: 'impact', icon: 'w_quake' },
    ],
  },
  {
    jobId: 'alvride', family: 'mage', tier: 4,
    skills: [
      { key: 'star_funeral', name: '終焉術式・星葬', description: '五つの星核を放ち、敵を光へ還す。', mpCost: 58, cooldown: 4800, powerMult: 1.55, scaling: 'mag', fx: 'magic', icon: 'm_meteor', effect: 'projectile', projSpeed: 350, projCount: 5, element: 'holy' },
      { key: 'grimoire_release', name: '禁書解放', description: '禁じられた頁を開き、魔力を限界突破する。', mpCost: 54, cooldown: 24000, scaling: 'mag', fx: 'magic', icon: 'm_thunder', effect: 'buff', buffStats: { magAtk: 300, critRate: 0.18, atkSpeed: 0.18 }, buffMs: 12000 },
    ],
  },
  {
    jobId: 'nirvadio', family: 'cleric', tier: 4,
    skills: [
      { key: 'divine_verdict', name: '神盾断罪', description: '神盾と聖刃で前方を光ごと粉砕する。', mpCost: 48, cooldown: 3000, powerMult: 6.6, reach: 48, radius: 72, knockback: 92, scaling: 'phys', fx: 'impact', icon: 'c_judgment', element: 'holy' },
      { key: 'eternal_sanctuary', name: '永劫の聖域', description: '永遠の加護を呼び、自身を大きく癒す。', mpCost: 55, cooldown: 11000, powerMult: 4.0, scaling: 'mag', fx: 'magic', icon: 'c_genesis', effect: 'heal' },
    ],
  },
  {
    jobId: 'noxtia', family: 'thief', tier: 4,
    skills: [
      { key: 'midnight_blades', name: '宵闇千刃', description: '五条の闇刃で逃げ場なく切り刻む。', mpCost: 47, cooldown: 3000, powerMult: 1.5, scaling: 'phys', fx: 'slash', icon: 't_phantom', effect: 'projectile', projSpeed: 360, projCount: 5 },
      { key: 'shadow_king', name: '影王の刻', description: '影王の力で攻撃・会心・速度を極限まで高める。', mpCost: 52, cooldown: 23000, scaling: 'phys', fx: 'magic', icon: 't_shadowfang', effect: 'buff', buffStats: { physAtk: 260, critRate: 0.22, atkSpeed: 0.2 }, buffMs: 11000 },
    ],
  },
  {
    jobId: 'oltarie', family: 'tamer', tier: 4,
    skills: [
      { key: 'astral_stampede', name: '星獣大行進', description: '星界の獣たちを呼び、広範囲を蹂躙する。', mpCost: 50, cooldown: 3600, powerMult: 7.1, reach: 58, radius: 80, knockback: 74, scaling: 'phys', fx: 'impact', icon: 'b_genesis', element: 'holy' },
      { key: 'soul_resonance', name: '魂環共鳴', description: '全ての相棒と共鳴し、二つの攻撃力を高める。', mpCost: 54, cooldown: 24000, scaling: 'phys', fx: 'magic', icon: 'b_beastclaw', effect: 'buff', buffStats: { physAtk: 180, magAtk: 180, accuracy: 35, critRate: 0.15 }, buffMs: 12000 },
    ],
  },
];

/** Two exact-job active skills for every promoted job. */
export const JOB_SIGNATURE_SKILLS: readonly SkillDef[] = JOB_SKILL_KITS.flatMap((kit) => {
  const firstId = `sig_${kit.jobId}_${kit.skills[0].key}`;
  return kit.skills.map((skill, index) => ({
    ...skill,
    id: `sig_${kit.jobId}_${skill.key}`,
    type: 'active' as const,
    family: kit.family,
    jobId: kit.jobId,
    minTier: kit.tier,
    requiredLevel: index === 0 ? 1 : 12,
    ...(index === 1 ? { requires: [firstId] } : {}),
  }));
});

export const SIGNATURE_SKILLS_PER_JOB = 2;
