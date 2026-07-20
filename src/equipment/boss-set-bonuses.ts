import setBonusesJson from '@/data/defs/boss-set-bonuses.json';
import { scaleFlatCombatStats } from '@/balance/progression-scale';
import type { Element } from '@/combat/elements';
import type { EquipSlot } from '@/equipment/slots';
import type { DerivedStats, StatModifiers } from '@/stats/stats';

export interface BossSetOnHitProc {
  chance: number;
  power: number;
  element: Element;
  label: string;
}

export interface BossSetCombatBonus {
  damageRate?: number;
  damageReduction?: number;
  critDamage?: number;
  bossDamage?: number;
  skillPower?: number;
  lowHpDamage?: number;
  healOnKillRate?: number;
  onHit?: BossSetOnHitProc;
}

export interface BossSetTierDef {
  pieces: 2 | 4;
  name: string;
  description: string;
  derived?: Partial<DerivedStats>;
  combat?: BossSetCombatBonus;
}

export interface BossSetBonusDef {
  id: string;
  name: string;
  rareMaterialId: string;
  maxPieces: number;
  pieceIds: string[];
  bonuses: BossSetTierDef[];
}

export interface BossSetState {
  set: BossSetBonusDef;
  count: number;
  activeBonuses: BossSetTierDef[];
}

export interface ActiveBossSetCombat {
  damageRate: number;
  damageReduction: number;
  critDamage: number;
  bossDamage: number;
  skillPower: number;
  lowHpDamage: number;
  healOnKillRate: number;
  onHit: (BossSetOnHitProc & { setId: string })[];
}

interface BossSetBonusesFile {
  sets: BossSetBonusDef[];
}

const sets = (setBonusesJson as BossSetBonusesFile).sets.map((set) => ({
  ...set,
  bonuses: set.bonuses.map((bonus) => ({
    ...bonus,
    derived: bonus.derived ? scaleFlatCombatStats(bonus.derived) : undefined,
  })),
}));

export function allBossSetBonuses(): BossSetBonusDef[] {
  return [...sets];
}

export function bossSetStates(
  equipment: Readonly<Record<EquipSlot, string | null>>,
): BossSetState[] {
  const equipped = new Set(Object.values(equipment).filter((id): id is string => !!id));
  return sets.map((set) => {
    const count = Math.min(
      set.maxPieces,
      set.pieceIds.reduce((total, itemId) => total + (equipped.has(itemId) ? 1 : 0), 0),
    );
    return {
      set,
      count,
      activeBonuses: set.bonuses.filter((bonus) => count >= bonus.pieces),
    };
  });
}

export function activeBossSetStates(
  equipment: Readonly<Record<EquipSlot, string | null>>,
): BossSetState[] {
  return bossSetStates(equipment)
    .filter((state) => state.count > 0)
    .sort((a, b) => b.count - a.count || a.set.name.localeCompare(b.set.name, 'ja'));
}

export function bossSetStatModifiers(
  equipment: Readonly<Record<EquipSlot, string | null>>,
): StatModifiers[] {
  return bossSetStates(equipment).flatMap((state) =>
    state.activeBonuses
      .filter((bonus) => !!bonus.derived)
      .map((bonus) => ({ derived: bonus.derived })),
  );
}

export function activeBossSetCombat(
  equipment: Readonly<Record<EquipSlot, string | null>>,
): ActiveBossSetCombat {
  const result: ActiveBossSetCombat = {
    damageRate: 0,
    damageReduction: 0,
    critDamage: 0,
    bossDamage: 0,
    skillPower: 0,
    lowHpDamage: 0,
    healOnKillRate: 0,
    onHit: [],
  };
  for (const state of bossSetStates(equipment)) {
    for (const tier of state.activeBonuses) {
      const combat = tier.combat;
      if (!combat) continue;
      result.damageRate += combat.damageRate ?? 0;
      result.damageReduction += combat.damageReduction ?? 0;
      result.critDamage += combat.critDamage ?? 0;
      result.bossDamage += combat.bossDamage ?? 0;
      result.skillPower += combat.skillPower ?? 0;
      result.lowHpDamage += combat.lowHpDamage ?? 0;
      result.healOnKillRate += combat.healOnKillRate ?? 0;
      if (combat.onHit) result.onHit.push({ ...combat.onHit, setId: state.set.id });
    }
  }
  result.damageReduction = Math.min(0.5, result.damageReduction);
  result.healOnKillRate = Math.min(0.2, result.healOnKillRate);
  return result;
}
