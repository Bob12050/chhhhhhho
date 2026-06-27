import townJson from '@/data/defs/maps/town.json';
import fieldJson from '@/data/defs/maps/field.json';
import forestJson from '@/data/defs/maps/forest.json';
import dungeonJson from '@/data/defs/maps/dungeon.json';
import canyonJson from '@/data/defs/maps/canyon.json';
import volcanoJson from '@/data/defs/maps/volcano.json';
import bossRoomJson from '@/data/defs/maps/boss_room.json';
import arenaVolcanoJson from '@/data/defs/maps/arena_volcano.json';
import arenaGroveJson from '@/data/defs/maps/arena_grove.json';
import arenaMarshJson from '@/data/defs/maps/arena_marsh.json';
import arenaCavernJson from '@/data/defs/maps/arena_cavern.json';
import arenaPeakJson from '@/data/defs/maps/arena_peak.json';

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
  /** If set, the portal is locked until this flag is true (boss gating). */
  requiresFlag?: string;
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
  /** Interaction action id (e.g. "equip"); omit for a plain talk NPC. */
  action?: string;
  /** Dialogue shown on interact (talk NPCs). */
  dialogueId?: string;
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
  /** Fast-travel listing. Maps without this still travel (order last). */
  travel?: {
    /** Sort order in the travel list (ascending). */
    order?: number;
    /** Hide from the travel list (e.g. cutscene-only rooms). */
    hidden?: boolean;
    /** If set, locked in the list until this flag is true. */
    unlockFlag?: string;
    /** Short blurb shown under the name. */
    note?: string;
  };
}

const maps = new Map<string, MapDef>();
for (const m of [
  townJson,
  fieldJson,
  forestJson,
  dungeonJson,
  canyonJson,
  volcanoJson,
  bossRoomJson,
  arenaVolcanoJson,
  arenaGroveJson,
  arenaMarshJson,
  arenaCavernJson,
  arenaPeakJson,
] as unknown as MapDef[]) {
  maps.set(m.id, m);
}

export function getMap(id: string): MapDef | undefined {
  return maps.get(id);
}

export function allMaps(): MapDef[] {
  return [...maps.values()];
}

/** Maps shown in the fast-travel list, sorted by travel.order then name. */
export function travelMaps(): MapDef[] {
  return [...maps.values()]
    .filter((m) => !m.travel?.hidden)
    .sort(
      (a, b) =>
        (a.travel?.order ?? 999) - (b.travel?.order ?? 999) || a.name.localeCompare(b.name),
    );
}

/** Resolve a spawn point, falling back to `default` then map center. */
export function spawnPoint(map: MapDef, name: string | undefined): { x: number; y: number } {
  const p = (name && map.spawns[name]) || map.spawns.default || Object.values(map.spawns)[0];
  if (p) return { x: p[0], y: p[1] };
  return { x: map.size.w / 2, y: map.size.h / 2 };
}
