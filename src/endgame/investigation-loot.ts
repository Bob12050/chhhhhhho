import { Rng } from '@/core/rng';
import {
  allEquipment,
  type EquipmentAffix,
  type EquipmentDef,
} from '@/data/items';
import { normalizeRank, rarityLabel } from '@/data/rarity';
import { canEquipClass, canEquipWeapon } from '@/equipment/restrictions';
import { getJob } from '@/jobs/job-defs';
import type { GameState } from '@/player/game-state';
import type { QuestDef } from '@/quests/quest-defs';
import type { DerivedStats } from '@/stats/stats';

interface AffixTemplate {
  id: string;
  label: string;
  stat: keyof DerivedStats;
  applies: (def: EquipmentDef) => boolean;
  roll: (rng: Rng, power: number) => number;
}

const intRoll = (base: number, step: number, spread: number) =>
  (rng: Rng, power: number): number => rng.intRange(base + step * power, base + step * power + spread);
const rateRoll = (base: number, step: number, spread: number) =>
  (rng: Rng, power: number): number =>
    Number(((base + step * power + rng.intRange(0, spread)) / 100).toFixed(2));

const AFFIXES: readonly AffixTemplate[] = [
  { id: 'force', label: '物攻', stat: 'physAtk', applies: (d) => (d.derived.physAtk ?? 0) > 0, roll: intRoll(2, 2, 3) },
  { id: 'arcana', label: '魔攻', stat: 'magAtk', applies: (d) => (d.derived.magAtk ?? 0) > 0, roll: intRoll(2, 2, 3) },
  { id: 'vitality', label: 'HP', stat: 'maxHp', applies: () => true, roll: intRoll(14, 12, 16) },
  { id: 'spirit', label: 'MP', stat: 'maxMp', applies: (d) => d.slot !== 'main_hand' || (d.derived.magAtk ?? 0) > 0, roll: intRoll(5, 5, 7) },
  { id: 'guard', label: '防御', stat: 'def', applies: (d) => d.slot !== 'main_hand' || (d.derived.def ?? 0) > 0, roll: intRoll(1, 2, 3) },
  { id: 'ward', label: '魔防', stat: 'magDef', applies: (d) => d.slot !== 'main_hand' || (d.derived.magDef ?? 0) > 0, roll: intRoll(1, 2, 3) },
  { id: 'focus', label: '命中', stat: 'accuracy', applies: (d) => d.slot === 'main_hand' || d.slot === 'hands', roll: intRoll(1, 2, 3) },
  { id: 'agility', label: '回避', stat: 'evasion', applies: (d) => d.slot !== 'waist', roll: intRoll(1, 2, 3) },
  { id: 'critical', label: '会心', stat: 'critRate', applies: (d) => d.slot === 'main_hand' || d.slot.startsWith('accessory'), roll: rateRoll(0, 1, 1) },
  { id: 'haste', label: '攻速', stat: 'atkSpeed', applies: (d) => d.slot === 'main_hand' || d.slot === 'hands', roll: rateRoll(3, 2, 2) },
  { id: 'stride', label: '移動', stat: 'moveSpeed', applies: (d) => d.slot === 'feet' || d.slot === 'back', roll: intRoll(0, 1, 2) },
  { id: 'fortune', label: 'ドロ率', stat: 'dropRate', applies: (d) => d.slot.startsWith('accessory') || d.slot === 'back', roll: rateRoll(0, 1, 1) },
  { id: 'prosperity', label: '金運', stat: 'goldRate', applies: (d) => d.slot.startsWith('accessory') || d.slot === 'waist', roll: rateRoll(0, 1, 1) },
  { id: 'drain', label: '吸血', stat: 'lifesteal', applies: (d) => d.slot === 'main_hand', roll: rateRoll(0, 1, 0) },
];

function jobCompatible(gs: GameState, def: EquipmentDef): boolean {
  const job = getJob(gs.jobId);
  if (def.slot === 'main_hand') {
    return canEquipWeapon(job?.equippableWeaponTags ?? [], def.weaponTags);
  }
  return canEquipClass(job?.family, def.classRestrictions);
}

function chooseBase(gs: GameState, rank: number, rng: Rng): EquipmentDef {
  const authored = allEquipment();
  let pool = authored.filter(
    (def) => def.rarity === rank && def.levelRequirement <= gs.level && jobCompatible(gs, def),
  );
  if (pool.length === 0) pool = authored.filter((def) => def.rarity === rank && jobCompatible(gs, def));
  if (pool.length === 0) pool = authored.filter((def) => def.rarity === rank);
  if (pool.length === 0) {
    pool = authored
      .slice()
      .sort((a, b) => Math.abs(a.rarity - rank) - Math.abs(b.rarity - rank))
      .filter((def, _i, arr) => Math.abs(def.rarity - rank) === Math.abs(arr[0].rarity - rank));
  }
  if (pool.length === 0) throw new Error('No equipment definitions available for investigation loot');

  // Pick the slot first so the large weapon catalogue does not crowd armour
  // and accessories out of the reward table.
  const slots = [...new Set(pool.map((def) => def.slot))].sort();
  const slot = slots[rng.intRange(0, slots.length - 1)];
  const slotPool = pool.filter((def) => def.slot === slot).sort((a, b) => a.id.localeCompare(b.id));
  return slotPool[rng.intRange(0, slotPool.length - 1)];
}

function affixCount(rank: number): number {
  if (rank >= 10) return 4;
  if (rank >= 9) return 3;
  return 2;
}

function rollAffixes(base: EquipmentDef, rank: number, rng: Rng): EquipmentAffix[] {
  const power = Math.max(1, rank - 7);
  const pool = AFFIXES.filter((affix) => affix.applies(base));
  const out: EquipmentAffix[] = [];
  while (out.length < affixCount(rank) && pool.length > 0) {
    const template = pool.splice(rng.intRange(0, pool.length - 1), 1)[0];
    out.push({
      id: template.id,
      label: template.label,
      stat: template.stat,
      value: template.roll(rng, power),
    });
  }
  return out;
}

function lootSeed(gs: GameState, quest: QuestDef): number {
  const boardSeed = quest.investigation?.boardSeed ?? gs.investigationSeed;
  return (
    boardSeed
    ^ Math.imul(gs.investigationsCompleted + 1, 0x85ebca6b)
    ^ Math.imul(gs.slot + 1, 0xc2b2ae35)
  ) >>> 0;
}

/** Create the unique R8-R10 equipment piece awarded by one investigation. */
export function generateInvestigationEquipment(gs: GameState, quest: QuestDef): EquipmentDef {
  if (!quest.investigation) throw new Error('Investigation metadata is required to generate loot');
  const rank = normalizeRank(quest.investigation.rewardRank);
  const rng = new Rng(lootSeed(gs, quest));
  const base = chooseBase(gs, rank, rng);
  const affixes = rollAffixes(base, rank, rng);
  const derived = { ...base.derived };
  const mutable = derived as Record<keyof DerivedStats, number | undefined>;
  for (const affix of affixes) mutable[affix.stat] = (mutable[affix.stat] ?? 0) + affix.value;
  const id = `ig_${gs.slot}_${quest.investigation.boardSeed.toString(36)}_${(
    gs.investigationsCompleted + 1
  ).toString(36)}`;

  const def: EquipmentDef = {
    ...base,
    id,
    name: `深層・${base.name}`,
    rarity: rank,
    derived,
    weaponTags: base.weaponTags ? [...base.weaponTags] : undefined,
    classRestrictions: base.classRestrictions ? [...base.classRestrictions] : undefined,
    sellPrice: 0,
    description: `調査危険度${quest.investigation.threat}で発見。${affixSummary({ ...base, generated: {
      source: 'investigation',
      baseId: base.id,
      threat: quest.investigation.threat,
      affixes,
      upgradeLevel: 0,
    } })}`,
    series: '深層調査',
    generated: {
      source: 'investigation',
      baseId: base.id,
      threat: quest.investigation.threat,
      affixes,
      upgradeLevel: 0,
    },
  };
  return def;
}

export function formatAffix(affix: EquipmentAffix): string {
  const percent = affix.stat === 'critRate'
    || affix.stat === 'dropRate'
    || affix.stat === 'lifesteal'
    || affix.stat === 'goldRate';
  const value = percent
    ? `${Math.round(affix.value * 100)}%`
    : affix.stat === 'atkSpeed'
      ? affix.value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
      : `${Math.round(affix.value)}`;
  return `${affix.label}+${value}`;
}

export function affixSummary(def: EquipmentDef, limit = 4): string {
  const affixes = def.generated?.affixes ?? [];
  const shown = affixes.slice(0, limit).map(formatAffix).join(' / ');
  return affixes.length > limit ? `${shown} / …` : shown;
}

export function investigationLootLabel(def: EquipmentDef): string {
  return `${rarityLabel(def.rarity)} ${def.name}`;
}
