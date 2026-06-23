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
import { RARITY_SET } from '../src/data/rarity';
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
    materials: { id: string; rarity?: string }[];
    consumables: { id: string; effect?: Record<string, number> }[];
    equipment: {
      id: string;
      slot: string;
      visualId: string;
      rarity?: string;
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

  for (const m of file.materials) {
    check(m.id, 'material');
    if (m.rarity != null && !RARITY_SET.has(m.rarity))
      err(`Material ${m.id}: invalid rarity "${m.rarity}"`);
  }
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
    if (e.rarity != null && !RARITY_SET.has(e.rarity))
      err(`Equipment ${e.id}: invalid rarity "${e.rarity}"`);
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

function validateDialogue(): Set<string> {
  const file = readJson<{ dialogues: { id: string }[] }>('src/data/defs/dialogue.json');
  const ids = new Set<string>();
  for (const d of file.dialogues) {
    if (ids.has(d.id)) err(`Duplicate dialogue id: ${d.id}`);
    ids.add(d.id);
  }
  return ids;
}

function validateMaps(enemyIds: Set<string>, dialogueIds: Set<string>): void {
  const files = ['town', 'field', 'dungeon', 'boss_room'];
  type MapDoc = {
    id: string;
    spawns: Record<string, [number, number]>;
    portals?: { to: string; toSpawn: string }[];
    enemies?: { type: string }[];
    npcs?: { dialogueId?: string }[];
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
    for (const n of m.npcs ?? []) {
      if (n.dialogueId && !dialogueIds.has(n.dialogueId)) {
        err(`Map ${m.id}: npc references unknown dialogue "${n.dialogueId}"`);
      }
    }
  }
}

function collectItemIds(): Set<string> {
  const file = readJson<{
    materials: { id: string }[];
    consumables: { id: string }[];
    petItems: { id: string }[];
    equipment: { id: string }[];
  }>('src/data/defs/items.json');
  return new Set<string>([
    ...file.materials.map((m) => m.id),
    ...(file.consumables ?? []).map((c) => c.id),
    ...(file.petItems ?? []).map((p) => p.id),
    ...file.equipment.map((e) => e.id),
  ]);
}

function validatePets(): void {
  const petFile = readJson<{ pets: { id: string; passive?: Record<string, number> }[] }>(
    'src/data/defs/pets.json',
  );
  const petIds = new Set(petFile.pets.map((p) => p.id));
  for (const p of petFile.pets) {
    for (const k of Object.keys(p.passive ?? {}))
      if (!DERIVED_KEYS.has(k)) err(`Pet ${p.id}: invalid derived stat "${k}"`);
  }
  const items = readJson<{ petItems?: { id: string; petId: string }[] }>('src/data/defs/items.json');
  for (const pi of items.petItems ?? []) {
    if (!petIds.has(pi.petId)) err(`Pet item ${pi.id}: unknown petId "${pi.petId}"`);
  }
}

validateItems();
validateSheetMath();
function validateRecipes(itemIds: Set<string>): void {
  const file = readJson<{
    recipes: { id: string; resultItemId: string; resultQty: number; materials: Record<string, number>; gold: number }[];
  }>('src/data/defs/recipes.json');
  const ids = new Set<string>();
  for (const r of file.recipes) {
    if (ids.has(r.id)) err(`Duplicate recipe id: ${r.id}`);
    ids.add(r.id);
    if (!itemIds.has(r.resultItemId)) err(`Recipe ${r.id}: unknown result "${r.resultItemId}"`);
    if (r.resultQty < 1) err(`Recipe ${r.id}: resultQty < 1`);
    if (r.gold < 0) err(`Recipe ${r.id}: negative gold`);
    for (const [id, qty] of Object.entries(r.materials)) {
      if (!itemIds.has(id)) err(`Recipe ${r.id}: unknown material "${id}"`);
      if (qty < 1) err(`Recipe ${r.id}: material "${id}" qty < 1`);
    }
  }
}

function validateSkills(): Set<string> {
  const file = readJson<{
    skills: { id: string; type: string; requires?: string[]; derived?: Record<string, number> }[];
  }>('src/data/defs/skills.json');
  const ids = new Set<string>();
  for (const s of file.skills) {
    if (ids.has(s.id)) err(`Duplicate skill id: ${s.id}`);
    ids.add(s.id);
    if (s.type !== 'active' && s.type !== 'passive') err(`Skill ${s.id}: bad type "${s.type}"`);
    for (const k of Object.keys(s.derived ?? {})) {
      if (!DERIVED_KEYS.has(k)) err(`Skill ${s.id}: invalid derived stat "${k}"`);
    }
  }
  // Prereq existence + acyclic.
  const byId = new Map(file.skills.map((s) => [s.id, s]));
  for (const s of file.skills) {
    for (const r of s.requires ?? []) {
      if (!byId.has(r)) err(`Skill ${s.id}: unknown prerequisite "${r}"`);
    }
  }
  const state = new Map<string, number>(); // 0=visiting,1=done
  const visit = (id: string, stack: Set<string>): void => {
    if (state.get(id) === 1) return;
    if (stack.has(id)) {
      err(`Skill prerequisite cycle at "${id}"`);
      return;
    }
    stack.add(id);
    for (const r of byId.get(id)?.requires ?? []) if (byId.has(r)) visit(r, stack);
    stack.delete(id);
    state.set(id, 1);
  };
  for (const s of file.skills) visit(s.id, new Set());
  return ids;
}

function validateJobs(skillIds: Set<string>): void {
  const file = readJson<{
    jobs: {
      id: string;
      parentJobIds?: string[];
      unlock?: { requiresJob?: string; requiresSkill?: string };
      baseStatModifiers?: Record<string, number>;
      derivedModifiers?: Record<string, number>;
    }[];
  }>('src/data/defs/jobs.json');
  const ids = new Set(file.jobs.map((j) => j.id));
  const BASE_KEYS = new Set(['STR', 'VIT', 'INT', 'DEX', 'LUK']);
  for (const j of file.jobs) {
    for (const p of j.parentJobIds ?? []) if (!ids.has(p)) err(`Job ${j.id}: unknown parent "${p}"`);
    if (j.unlock?.requiresJob && !ids.has(j.unlock.requiresJob))
      err(`Job ${j.id}: unlock requiresJob "${j.unlock.requiresJob}" unknown`);
    if (j.unlock?.requiresSkill && !skillIds.has(j.unlock.requiresSkill))
      err(`Job ${j.id}: unlock requiresSkill "${j.unlock.requiresSkill}" unknown`);
    for (const k of Object.keys(j.baseStatModifiers ?? {}))
      if (!BASE_KEYS.has(k)) err(`Job ${j.id}: invalid base stat "${k}"`);
    for (const k of Object.keys(j.derivedModifiers ?? {}))
      if (!DERIVED_KEYS.has(k)) err(`Job ${j.id}: invalid derived stat "${k}"`);
  }
}

const itemIds = collectItemIds();
const dropTableIds = validateDrops(itemIds);
const enemyIds = validateEnemies(itemIds, dropTableIds);
const dialogueIds = validateDialogue();
validateMaps(enemyIds, dialogueIds);
validateRecipes(itemIds);
const skillIds = validateSkills();
validateJobs(skillIds);
validatePets();

if (errors.length > 0) {
  console.error(`Data validation FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
} else {
  console.log('Data validation passed.');
}
