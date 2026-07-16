import exchangesJson from '@/data/defs/boss-rare-exchanges.json';
import type { GameState } from '@/player/game-state';

export interface BossRareExchangeDef {
  rareMaterialId: string;
  proofItemId: string;
  dropTableIds: string[];
}

interface BossRareExchangesFile {
  exchangeCost: number;
  exchanges: BossRareExchangeDef[];
}

const file = exchangesJson as BossRareExchangesFile;
const exchanges = file.exchanges;
const byRareMaterial = new Map(exchanges.map((entry) => [entry.rareMaterialId, entry]));
const byDropTable = new Map<string, BossRareExchangeDef>();
for (const entry of exchanges) {
  for (const dropTableId of entry.dropTableIds) byDropTable.set(dropTableId, entry);
}

export const BOSS_RARE_EXCHANGE_COST = file.exchangeCost;

export function allBossRareExchanges(): BossRareExchangeDef[] {
  return [...exchanges];
}

export function getBossRareExchangeForMaterial(
  materialId: string,
): BossRareExchangeDef | undefined {
  return byRareMaterial.get(materialId);
}

export function getBossRareExchangeForDropTable(
  dropTableId: string,
): BossRareExchangeDef | undefined {
  return byDropTable.get(dropTableId);
}

export function exchangeBossRareMaterial(gs: GameState, rareMaterialId: string): boolean {
  const exchange = getBossRareExchangeForMaterial(rareMaterialId);
  if (!exchange || (gs.materials[exchange.proofItemId] ?? 0) < BOSS_RARE_EXCHANGE_COST) {
    return false;
  }
  if (!gs.removeMaterial(exchange.proofItemId, BOSS_RARE_EXCHANGE_COST)) return false;
  gs.addMaterial(exchange.rareMaterialId, 1);
  return true;
}
