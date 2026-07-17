import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { migrate } from '@/save/schema';
import { allEnemyDefs, getEnemyDef } from '@/enemies/enemy-defs';
import { getMaterial } from '@/data/items';
import {
  BESTIARY_REGIONS,
  bestiaryEquipmentGuide,
  bestiaryHabitatGuide,
  bestiaryRegionProgress,
  bestiaryRewardFlag,
  catalogedEnemyIds,
  claimBestiaryRegionReward,
  uncatalogedEnemyIds,
} from '@/bestiary/bestiary-catalog';

const roundTrip = (gs: GameState): GameState => {
  const loaded = new GameState();
  loaded.loadFrom(migrate(JSON.parse(JSON.stringify(gs.toSave(0))), 0));
  return loaded;
};

describe('bestiary kill counts', () => {
  it('accumulate per enemy and survive a save round trip', () => {
    const gs = new GameState();
    gs.addKill('slime');
    gs.addKill('slime');
    gs.addKill('boss_flame');
    const loaded = roundTrip(gs);
    expect(loaded.killCounts['slime']).toBe(2);
    expect(loaded.killCounts['boss_flame']).toBe(1);
    expect(loaded.killCounts['bat']).toBeUndefined();
  });

  it('legacy saves seed defeated bosses from their kill flags', () => {
    const gs = new GameState();
    gs.flags['boss_boss_flame_killed'] = true;
    const save = JSON.parse(JSON.stringify(gs.toSave(0)));
    delete save.killCounts; // simulate a pre-bestiary save
    const loaded = new GameState();
    loaded.loadFrom(migrate(save, 0));
    expect(loaded.killCounts['boss_flame']).toBe(1);
  });

  it('every enemy has bestiary flavor text', () => {
    for (const e of allEnemyDefs()) {
      expect(e.description, e.id).toBeTruthy();
    }
  });

  it('retains the normal and boss taxonomy inside regional chapters', () => {
    const all = allEnemyDefs();
    const bosses = all.filter((e) => e.isBoss);
    const normals = all.filter((e) => !e.isBoss);
    expect(bosses.length + normals.length).toBe(all.length);
    expect(bosses.length).toBeGreaterThanOrEqual(28);
    expect(normals.length).toBeGreaterThanOrEqual(10);
  });

  it('places every enemy in exactly one regional chapter', () => {
    const ids = catalogedEnemyIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(uncatalogedEnemyIds()).toEqual([]);
    expect(ids.length).toBe(allEnemyDefs().length);
  });

  it('gives every entry a real habitat and an equipment lead', () => {
    for (const enemy of allEnemyDefs()) {
      const habitat = bestiaryHabitatGuide(enemy.id);
      expect(habitat.discovered, enemy.id).toBeTruthy();
      expect(habitat.discovered, enemy.id).not.toContain('未知');
      expect(bestiaryEquipmentGuide(enemy), enemy.id).not.toBeNull();
    }
  });

  it('uses valid materials for every regional reward', () => {
    for (const region of BESTIARY_REGIONS) {
      expect(getMaterial(region.reward.materialId), region.id).toBeDefined();
      expect(region.reward.gold).toBeGreaterThan(0);
      expect(region.reward.quantity).toBeGreaterThan(0);
    }
  });

  it('reports field habitats and ranked boss hunts without exposing fake locations', () => {
    expect(bestiaryHabitatGuide('slime')).toMatchObject({
      short: 'みどりの草原ほか',
    });
    expect(bestiaryHabitatGuide('boss_treant')).toMatchObject({
      short: '★1 大型狩猟',
      rank: 1,
    });
  });

  it('links a discovered boss to its craftable equipment series', () => {
    const treant = getEnemyDef('boss_treant');
    expect(treant).toBeDefined();
    const guide = bestiaryEquipmentGuide(treant!);
    expect(guide?.title).toBe('もりの主シリーズ');
    expect(guide?.itemIds).toContain('lord_mace');
  });

  it('grants each regional completion reward exactly once', () => {
    const gs = new GameState();
    const region = BESTIARY_REGIONS[0];
    for (const id of region.enemyIds) gs.addKill(id);
    const progress = bestiaryRegionProgress(region, gs.killCounts);
    expect(progress).toMatchObject({ found: region.enemyIds.length, complete: true });

    const goldBefore = gs.gold;
    expect(claimBestiaryRegionReward(gs, region)).toBe(true);
    expect(gs.gold).toBe(goldBefore + region.reward.gold);
    expect(gs.materials[region.reward.materialId]).toBe(region.reward.quantity);
    expect(gs.flags[bestiaryRewardFlag(region.id)]).toBe(true);
    expect(claimBestiaryRegionReward(gs, region)).toBe(false);
    expect(gs.materials[region.reward.materialId]).toBe(region.reward.quantity);

    const loaded = roundTrip(gs);
    expect(claimBestiaryRegionReward(loaded, region)).toBe(false);
    expect(loaded.materials[region.reward.materialId]).toBe(region.reward.quantity);
  });
});
