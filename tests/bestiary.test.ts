import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { migrate } from '@/save/schema';
import { allEnemyDefs } from '@/enemies/enemy-defs';

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

  it('roster splits cleanly into 通常 and ボス tabs', () => {
    const all = allEnemyDefs();
    const bosses = all.filter((e) => e.isBoss);
    const normals = all.filter((e) => !e.isBoss);
    expect(bosses.length + normals.length).toBe(all.length);
    expect(bosses.length).toBeGreaterThanOrEqual(28);
    expect(normals.length).toBeGreaterThanOrEqual(10);
  });
});
