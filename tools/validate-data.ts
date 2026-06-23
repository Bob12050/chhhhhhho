/**
 * Data validator. Detects: duplicate ids, missing references (visualId, slot),
 * invalid equip slots, invalid derived-stat keys, drop-rate anomalies, and
 * pose-atlas sheet dimension consistency. Engine-independent (no Phaser import)
 * so it runs under node/tsx and in CI. Exits non-zero on any error.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EQUIP_SLOTS } from '../src/equipment/slots';
import { VISUAL_ID_SET } from '../src/data/visual-ids';
import { SHEET_ROWS, MAX_FRAMES, SHEET_WIDTH, SHEET_HEIGHT } from '../src/paperdoll/pose-atlas';
import { CHAR_FRAME_W, CHAR_FRAME_H } from '../src/config/resolution';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors: string[] = [];
const slotSet = new Set<string>(EQUIP_SLOTS);
const DERIVED_KEYS = new Set([
  'maxHp',
  'maxMp',
  'physAtk',
  'magAtk',
  'def',
  'magDef',
  'accuracy',
  'evasion',
  'critRate',
  'atkSpeed',
  'moveSpeed',
]);

function err(msg: string): void {
  errors.push(msg);
}

function validateItems(): void {
  const file = JSON.parse(readFileSync(join(root, 'src/data/defs/items.json'), 'utf8')) as {
    materials: { id: string }[];
    consumables: { id: string; effect?: Record<string, number> }[];
    equipment: {
      id: string;
      slot: string;
      visualId: string;
      derived?: Record<string, number>;
      sellPrice?: number;
    }[];
  };

  const ids = new Set<string>();
  const check = (id: string, where: string): void => {
    if (!id) err(`${where}: empty id`);
    if (ids.has(id)) err(`Duplicate item id: ${id}`);
    ids.add(id);
  };
  const EFFECT_KEYS = new Set(['hp', 'mp']);

  for (const m of file.materials) check(m.id, 'material');
  for (const c of file.consumables ?? []) {
    check(c.id, 'consumable');
    for (const k of Object.keys(c.effect ?? {})) {
      if (!EFFECT_KEYS.has(k)) err(`Consumable ${c.id}: invalid effect "${k}"`);
    }
  }
  for (const e of file.equipment) {
    check(e.id, 'equipment');
    if (!slotSet.has(e.slot)) err(`Equipment ${e.id}: invalid slot "${e.slot}"`);
    if (!VISUAL_ID_SET.has(e.visualId)) err(`Equipment ${e.id}: unknown visualId "${e.visualId}"`);
    for (const k of Object.keys(e.derived ?? {})) {
      if (!DERIVED_KEYS.has(k)) err(`Equipment ${e.id}: invalid derived stat "${k}"`);
    }
    if (e.sellPrice != null && e.sellPrice < 0) err(`Equipment ${e.id}: negative sellPrice`);
  }
}

function validateSheetMath(): void {
  if (SHEET_WIDTH !== MAX_FRAMES * CHAR_FRAME_W) err('Sheet width mismatch with frame config');
  if (SHEET_HEIGHT !== SHEET_ROWS * CHAR_FRAME_H) err('Sheet height mismatch with frame config');
  if (SHEET_ROWS <= 0 || MAX_FRAMES <= 0) err('Invalid sheet row/frame count');
}

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(root, rel), 'utf8')) as T;
}

function validateDrops(itemIds: Set<string>): Set<string> {
  const file = readJson<{
    tables: { id: string; entries: { itemId: string; dropRate: number; min: number; max: number }[] }[];
  }>('src/data/defs/drops.json');
  const ids = new Set<string>();
  for (const t of file.tables) {
    if (ids.has(t.id)) err(`Duplicate drop table id: ${t.id}`);
    ids.add(t.id);
    for (const e of t.entries) {
      if (!itemIds.has(e.itemId)) err(`Drop ${t.id}: item "${e.itemId}" not in items.json`);
      if (e.dropRate < 0 || e.dropRate > 1) err(`Drop ${t.id}/${e.itemId}: dropRate out of [0,1]`);
      if (e.min < 0 || e.max < e.min) err(`Drop ${t.id}/${e.itemId}: invalid quantity range`);
    }
  }
  return ids;
}

function validateEnemies(itemIds: Set<string>, dropTableIds: Set<string>): Set<string> {
  void itemIds;
  const file = readJson<{ enemies: { id: string; dropTableId?: string }[] }>(
    'src/data/defs/enemies.json',
  );
  const ids = new Set<string>();
  for (const e of file.enemies) {
    if (ids.has(e.id)) err(`Duplicate enemy id: ${e.id}`);
    ids.add(e.id);
    if (e.dropTableId && !dropTableIds.has(e.dropTableId)) {
      err(`Enemy ${e.id}: unknown dropTableId "${e.dropTableId}"`);
    }
  }
  return ids;
}

function validateMaps(enemyIds: Set<string>): void {
  const files = ['town', 'field', 'dungeon', 'boss_room'];
  type MapDoc = {
    id: string;
    spawns: Record<string, [number, number]>;
    portals?: { to: string; toSpawn: string }[];
    enemies?: { type: string }[];
  };
  const maps = new Map<string, MapDoc>();
  for (const f of files) {
    const m = readJson<MapDoc>(`src/data/defs/maps/${f}.json`);
    if (maps.has(m.id)) err(`Duplicate map id: ${m.id}`);
    maps.set(m.id, m);
  }
  for (const m of maps.values()) {
    for (const e of m.enemies ?? []) {
      if (!enemyIds.has(e.type)) err(`Map ${m.id}: unknown enemy type "${e.type}"`);
    }
    for (const p of m.portals ?? []) {
      const target = maps.get(p.to);
      if (!target) {
        err(`Map ${m.id}: portal to unknown map "${p.to}"`);
      } else if (!(p.toSpawn in target.spawns)) {
        err(`Map ${m.id}: portal to ${p.to} uses missing spawn "${p.toSpawn}"`);
      }
    }
  }
}

function collectItemIds(): Set<string> {
  const file = readJson<{
    materials: { id: string }[];
    consumables: { id: string }[];
    equipment: { id: string }[];
  }>('src/data/defs/items.json');
  return new Set<string>([
    ...file.materials.map((m) => m.id),
    ...(file.consumables ?? []).map((c) => c.id),
    ...file.equipment.map((e) => e.id),
  ]);
}

validateItems();
validateSheetMath();
const itemIds = collectItemIds();
const dropTableIds = validateDrops(itemIds);
const enemyIds = validateEnemies(itemIds, dropTableIds);
validateMaps(enemyIds);

if (errors.length > 0) {
  console.error(`Data validation FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
} else {
  console.log('Data validation passed.');
}
