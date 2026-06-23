import { describe, it, expect } from 'vitest';
import { allMaps, getMap, spawnPoint } from '@/maps/map-def';
import { getEnemyDef } from '@/enemies/enemy-defs';

describe('map definitions', () => {
  it('every portal targets an existing map + spawn', () => {
    for (const m of allMaps()) {
      for (const p of m.portals ?? []) {
        const target = getMap(p.to);
        expect(target, `${m.id} -> ${p.to}`).toBeDefined();
        expect(target!.spawns[p.toSpawn], `${m.id} -> ${p.to}#${p.toSpawn}`).toBeDefined();
      }
    }
  });

  it('every enemy spawn references a known enemy def', () => {
    for (const m of allMaps()) {
      for (const e of m.enemies ?? []) {
        expect(getEnemyDef(e.type), `${m.id} enemy ${e.type}`).toBeDefined();
      }
    }
  });

  it('spawnPoint falls back when name is missing', () => {
    const town = getMap('town')!;
    const def = spawnPoint(town, 'does_not_exist');
    expect(def).toEqual(spawnPoint(town, 'default'));
  });
});
