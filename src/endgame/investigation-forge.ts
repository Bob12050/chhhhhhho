import { getEquipment, type EquipmentAffix, type EquipmentDef } from '@/data/items';
import { normalizeRank } from '@/data/rarity';
import { EQUIP_SLOTS } from '@/equipment/slots';
import { formatAffix } from '@/endgame/investigation-loot';
import { INVESTIGATION_SEAL_ID } from '@/endgame/investigations';
import type { GameState } from '@/player/game-state';
import type { DerivedStats } from '@/stats/stats';

export const INVESTIGATION_CRYSTAL_ID = 'investigation_crystal';
export const MAX_INVESTIGATION_UPGRADE = 5;
export const UPGRADE_BONUS_PER_LEVEL = 6;

export interface InvestigationUpgradeCost {
  crystals: number;
  seals: number;
}

export type InvestigationUpgradeResult = 'ok' | 'unknown' | 'max' | 'materials';
export type InvestigationDismantleResult = 'ok' | 'unknown' | 'equipped';

const CRYSTAL_COST = [0, 4, 7, 10, 14, 19] as const;
const SEAL_COST = [0, 1, 1, 2, 2, 3] as const;
const RATE_STATS = new Set<keyof DerivedStats>([
  'critRate',
  'atkSpeed',
  'dropRate',
  'lifesteal',
  'goldRate',
]);

export function investigationUpgradeCost(def: EquipmentDef): InvestigationUpgradeCost | null {
  const level = def.generated?.upgradeLevel;
  if (level == null || level >= MAX_INVESTIGATION_UPGRADE) return null;
  const next = level + 1;
  return { crystals: CRYSTAL_COST[next], seals: SEAL_COST[next] };
}

export function investigationDismantleYield(def: EquipmentDef): number {
  if (!def.generated) return 0;
  const rank = normalizeRank(def.rarity);
  const base = rank >= 10 ? 15 : rank >= 9 ? 10 : 6;
  return base + def.generated.upgradeLevel * 2;
}

export function investigationUpgradeBonus(def: EquipmentDef): number {
  return (def.generated?.upgradeLevel ?? 0) * UPGRADE_BONUS_PER_LEVEL;
}

function withAffixes(base: EquipmentDef, affixes: readonly EquipmentAffix[]): Partial<DerivedStats> {
  const derived = { ...base.derived };
  const mutable = derived as Record<keyof DerivedStats, number | undefined>;
  for (const affix of affixes) mutable[affix.stat] = (mutable[affix.stat] ?? 0) + affix.value;
  return derived;
}

export function deriveInvestigationEquipmentStats(
  base: EquipmentDef,
  affixes: readonly EquipmentAffix[],
  level: number,
): Partial<DerivedStats> {
  const derived = withAffixes(base, affixes);
  const scale = 1 + (level * UPGRADE_BONUS_PER_LEVEL) / 100;
  const mutable = derived as Record<keyof DerivedStats, number | undefined>;
  for (const key of Object.keys(derived) as (keyof DerivedStats)[]) {
    const value = mutable[key] ?? 0;
    if (value <= 0) continue;
    mutable[key] = RATE_STATS.has(key)
      ? Number((value * scale).toFixed(3))
      : Math.max(Math.round(value * scale), Math.round(value) + level);
  }
  return derived;
}

/** Refresh saved investigation gear against the current authored base curve. */
export function rebaseInvestigationEquipment(def: EquipmentDef): EquipmentDef {
  if (!def.generated) return def;
  const base = getEquipment(def.generated.baseId);
  if (!base || base.generated) return def;
  const next = structuredClone(def);
  next.derived = deriveInvestigationEquipmentStats(
    base,
    next.generated!.affixes,
    next.generated!.upgradeLevel,
  );
  return next;
}

export function upgradeInvestigationEquipment(
  gs: GameState,
  id: string,
): InvestigationUpgradeResult {
  const current = gs.generatedEquipment[id];
  if (!current?.generated || !gs.equipmentOwned.includes(id)) return 'unknown';
  const cost = investigationUpgradeCost(current);
  if (!cost) return 'max';
  if (
    (gs.materials[INVESTIGATION_CRYSTAL_ID] ?? 0) < cost.crystals
    || (gs.materials[INVESTIGATION_SEAL_ID] ?? 0) < cost.seals
  ) return 'materials';

  const base = getEquipment(current.generated.baseId);
  if (!base || base.generated) return 'unknown';
  const next = structuredClone(current);
  next.generated!.upgradeLevel += 1;
  next.derived = deriveInvestigationEquipmentStats(
    base,
    next.generated!.affixes,
    next.generated!.upgradeLevel,
  );
  const affixes = next.generated!.affixes.map(formatAffix).join(' / ');
  next.description = `調査危険度${next.generated!.threat}で発見。強化+${next.generated!.upgradeLevel}。${affixes}`;

  // All validation is complete before resources are consumed.
  gs.removeMaterial(INVESTIGATION_CRYSTAL_ID, cost.crystals);
  gs.removeMaterial(INVESTIGATION_SEAL_ID, cost.seals);
  return gs.updateGeneratedEquipment(next) ? 'ok' : 'unknown';
}

export function dismantleInvestigationEquipment(
  gs: GameState,
  id: string,
): InvestigationDismantleResult {
  const def = gs.generatedEquipment[id];
  if (!def?.generated || !gs.equipmentOwned.includes(id)) return 'unknown';
  if (EQUIP_SLOTS.some((slot) => gs.equipment[slot] === id)) return 'equipped';
  const crystals = investigationDismantleYield(def);
  if (!gs.removeEquipment(id)) return 'unknown';
  gs.addMaterial(INVESTIGATION_CRYSTAL_ID, crystals);
  return 'ok';
}
