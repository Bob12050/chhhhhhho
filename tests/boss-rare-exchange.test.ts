import { describe, expect, it } from 'vitest';
import {
  BOSS_RARE_EXCHANGE_COST,
  allBossRareExchanges,
  exchangeBossRareMaterial,
  getBossRareExchangeForDropTable,
} from '@/crafting/boss-rare-exchange';
import { getMaterial } from '@/data/items';
import dropsJson from '@/data/defs/drops.json';
import { GameState } from '@/player/game-state';
import { simulateHunt } from '@/balance/hunt-simulator';

interface DropTableDef {
  id: string;
  entries: { itemId: string; dropRate: number }[];
}

const tables = (dropsJson as { tables: DropTableDef[] }).tables;

describe('boss rare material exchange', () => {
  it('covers every boss drop table exactly once with a valid rare material', () => {
    expect(BOSS_RARE_EXCHANGE_COST).toBe(12);
    const exchanges = allBossRareExchanges();
    const covered = exchanges.flatMap((exchange) => exchange.dropTableIds);
    const bossTables = tables.filter((table) => table.id.startsWith('boss_')).map((table) => table.id);
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual([...bossTables].sort());

    for (const exchange of exchanges) {
      expect(getMaterial(exchange.rareMaterialId)?.rarity ?? 0).toBeGreaterThanOrEqual(8);
      expect(getMaterial(exchange.proofItemId)?.sellPrice).toBe(0);
      for (const tableId of exchange.dropTableIds) {
        const rareDrop = tables
          .find((table) => table.id === tableId)
          ?.entries.find((entry) => entry.itemId === exchange.rareMaterialId);
        expect(rareDrop?.dropRate ?? 0).toBeGreaterThan(0);
        expect(rareDrop?.dropRate ?? 1).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('exchanges exactly twelve proofs without consuming an incomplete stack', () => {
    const exchange = getBossRareExchangeForDropTable('boss_skoll')!;
    const gs = new GameState();
    gs.addMaterial(exchange.proofItemId, 11);
    expect(exchangeBossRareMaterial(gs, exchange.rareMaterialId)).toBe(false);
    expect(gs.materials[exchange.proofItemId]).toBe(11);

    gs.addMaterial(exchange.proofItemId, 1);
    expect(exchangeBossRareMaterial(gs, exchange.rareMaterialId)).toBe(true);
    expect(gs.materials[exchange.proofItemId] ?? 0).toBe(0);
    expect(gs.materials[exchange.rareMaterialId]).toBe(1);
  });

  it('keeps hunt proof progress through save and load', () => {
    const exchange = getBossRareExchangeForDropTable('boss_zephys')!;
    const gs = new GameState();
    gs.addMaterial(exchange.proofItemId, 7);
    const loaded = new GameState();
    loaded.loadFrom(gs.toSave(0));
    expect(loaded.materials[exchange.proofItemId]).toBe(7);
  });

  it('includes one guaranteed proof for every successful simulated boss hunt', () => {
    const result = simulateHunt({ questId: 'hunt_r5_02_skoll', runs: 100, seed: 1205 });
    const proof = result.drops.find((drop) => drop.itemId === 'hunt_proof_skoll');
    expect(proof?.total).toBe(result.clears);
    expect(proof?.runsWithDrop).toBe(result.clears);
  });
});
