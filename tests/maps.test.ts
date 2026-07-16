import { describe, it, expect } from 'vitest';
import { allMaps, getMap, spawnPoint } from '@/maps/map-def';
import { getEnemyDef, allEnemyDefs } from '@/enemies/enemy-defs';
import { allQuests } from '@/quests/quest-defs';

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

  it('bosses are hunt-only: never walk-up in a zone, only spawned via huntMap quests', () => {
    // No map statically places a boss (they belong in quest arenas now).
    for (const m of allMaps()) {
      for (const e of m.enemies ?? []) {
        expect(getEnemyDef(e.type)!.isBoss, `${m.id} places boss ${e.type}`).toBeFalsy();
      }
    }
    // Every boss is reachable through at least one quest that spawns it (huntMap).
    const huntable = new Set(
      allQuests()
        .filter((q) => q.huntMap)
        .flatMap((q) => q.objectives.map((o) => o.enemyId)),
    );
    for (const b of allEnemyDefs().filter((d) => d.isBoss)) {
      expect(huntable.has(b.id), `${b.id} has no huntMap quest`).toBe(true);
    }
  });

  it('spawnPoint falls back when name is missing', () => {
    const town = getMap('town')!;
    const def = spawnPoint(town, 'does_not_exist');
    expect(def).toEqual(spawnPoint(town, 'default'));
  });

  it('keeps the town defeat respawn clear of scenery', () => {
    const town = getMap('town')!;
    const { x: spawnX, y: spawnY } = spawnPoint(town, 'respawn');
    const scenery = [
      ...(town.buildings ?? []).map((b) => [b.x, b.y, b.w, b.h] as const),
      ...(town.collisionRects ?? []),
    ];

    expect(town.spawns.respawn).toBeDefined();
    expect(spawnX).toBeGreaterThan(24);
    expect(spawnX).toBeLessThan(town.size.w - 24);
    expect(spawnY).toBeGreaterThan(32);
    expect(spawnY).toBeLessThan(town.size.h - 32);
    for (const [x, y, w, h] of scenery) {
      const insidePaddedScenery =
        spawnX >= x - 20 && spawnX <= x + w + 20 && spawnY >= y - 20 && spawnY <= y + h + 20;
      expect(insidePaddedScenery, `respawn is too close to scenery at ${x},${y}`).toBe(false);
    }
  });

  it('keeps illustrated-map entrances and enemy posts clear of painted scenery', () => {
    for (const mapId of ['forest', 'dungeon']) {
      const map = getMap(mapId)!;
      const actorPoints = [
        ...Object.entries(map.spawns).map(([name, [x, y]]) => ({ name: `spawn:${name}`, x, y })),
        ...(map.enemies ?? []).map((enemy, index) => ({
          name: `enemy:${enemy.type}:${index}`,
          x: enemy.x,
          y: enemy.y,
        })),
      ];

      for (const point of actorPoints) {
        for (const [x, y, w, h] of map.collisionRects ?? []) {
          const bodyTouchesScenery =
            point.x + 10 > x
            && point.x - 10 < x + w
            && point.y + 8 > y
            && point.y - 8 < y + h;
          expect(bodyTouchesScenery, `${mapId}:${point.name} touches scenery at ${x},${y}`).toBe(false);
        }
      }
    }
  });

  it('uses a stepped pond collider so the painted round corners stay walkable', () => {
    const forest = getMap('forest')!;
    const blocked = (px: number, py: number): boolean =>
      (forest.collisionRects ?? []).some(([x, y, w, h]) =>
        px >= x && px <= x + w && py >= y && py <= y + h,
      );

    expect(blocked(160, 650)).toBe(true);
    expect(blocked(60, 620)).toBe(false);
    expect(blocked(250, 780)).toBe(false);
  });
});
