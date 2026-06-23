import townJson from '@/data/defs/maps/town.json';
import fieldJson from '@/data/defs/maps/field.json';
import dungeonJson from '@/data/defs/maps/dungeon.json';
import bossRoomJson from '@/data/defs/maps/boss_room.json';

/**
 * Map definitions (data-driven). A map is a portrait area built from a ground
 * tile, optional central path, a border style, scattered obstacles, named
 * spawn points, portals to other maps, enemy spawns, and NPCs. The generic
 * `WorldScene` renders any of these by id. Validated by `tools/validate-data`.
 */
export type GroundKind = 'grass' | 'stone' | 'floor';
export type BorderKind = 'trees' | 'walls' | 'none';

export interface PortalDef {
  /** [x, y, w, h] in map pixels. */
  rect: [number, number, number, number];
  to: string;
  toSpawn: string;
  label?: string;
}

export interface MapEnemy {
  type: string;
  x: number;
  y: number;
}

export interface MapNpc {
  x: number;
  y: number;
  label: string;
  /** Interaction action id (e.g. "equip"); dialogue lands in M11. */
  action?: string;
}

export interface MapDef {
  id: string;
  name: string;
  size: { w: number; h: number };
  ground: GroundKind;
  path?: { axis: 'v' | 'h'; thickness: number };
  border: BorderKind;
  obstacles?: [number, number][];
  spawns: Record<string, [number, number]>;
  portals?: PortalDef[];
  enemies?: MapEnemy[];
  npcs?: MapNpc[];
}

const maps = new Map<string, MapDef>();
for (const m of [townJson, fieldJson, dungeonJson, bossRoomJson] as unknown as MapDef[]) {
  maps.set(m.id, m);
}

export function getMap(id: string): MapDef | undefined {
  return maps.get(id);
}

export function allMaps(): MapDef[] {
  return [...maps.values()];
}

/** Resolve a spawn point, falling back to `default` then map center. */
export function spawnPoint(map: MapDef, name: string | undefined): { x: number; y: number } {
  const p = (name && map.spawns[name]) || map.spawns.default || Object.values(map.spawns)[0];
  if (p) return { x: p[0], y: p[1] };
  return { x: map.size.w / 2, y: map.size.h / 2 };
}
