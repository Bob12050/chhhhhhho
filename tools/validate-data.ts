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
import { isValidRank, minJobTierForRank } from '../src/data/rarity';
import { CLASS_FAMILIES } from '../src/jobs/job-defs';
import { JOB_APPEARANCE_IDS } from '../src/jobs/job-appearance-ids';
import { ELEMENTS } from '../src/combat/elements';
import { SHEET_ROWS, MAX_FRAMES, SHEET_WIDTH, SHEET_HEIGHT } from '../src/paperdoll/pose-atlas';
import { CHAR_FRAME_W, CHAR_FRAME_H } from '../src/config/resolution';
import { JOB_SIGNATURE_SKILLS, SIGNATURE_SKILLS_PER_JOB } from '../src/skills/job-signature-skills';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors: string[] = [];
const slotSet = new Set<string>(EQUIP_SLOTS);
// The 12 canonical weapon tags (item_system_spec v0.1 §1.4). No new tags.
const WEAPON_TAGS = new Set([
  'sword',
  'axe',
  'spear',
  'katana',
  'staff',
  'wand',
  'mace',
  'dagger',
  'whip',
  'shuriken',
  'bow',
  'shield',
]);
const CLASS_FAMILY_SET = new Set<string>(CLASS_FAMILIES);
const ELEMENT_SET = new Set<string>(ELEMENTS);
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
  'dropRate',
  'lifesteal',
  'goldRate',
]);
/**
 * atkSpeed is ADDED to a ×1 multiplier, so equipment values must stay well
 * below 1 (0.1〜0.5 ≈ +10〜50% swing speed). Values ≥1 once shipped by
 * accident and made weapons swing 3〜11× fast — never again.
 */
const MAX_EQUIP_ATKSPEED = 0.6;

function err(msg: string): void {
  errors.push(msg);
}

function validateItems(): void {
  const file = JSON.parse(readFileSync(join(root, 'src/data/defs/items.json'), 'utf8')) as {
    materials: { id: string; rarity?: number }[];
    consumables: { id: string; effect?: Record<string, number> }[];
    equipment: {
      id: string;
      slot: string;
      visualId: string;
      rarity?: number;
      weaponTags?: string[];
      classRestrictions?: string[];
      jobRequirements?: string[];
      appearance?: string;
      derived?: Record<string, number>;
      sellPrice?: number;
      element?: string;
    }[];
  };

  const ids = new Set<string>();
  const jobIds = new Set(
    readJson<{ jobs: { id: string }[] }>('src/data/defs/jobs.json').jobs.map((job) => job.id),
  );
  const appearanceIds = new Set<string>(JOB_APPEARANCE_IDS);
  const check = (id: string, where: string): void => {
    if (!id) err(`${where}: empty id`);
    if (ids.has(id)) err(`Duplicate item id: ${id}`);
    ids.add(id);
  };
  const EFFECT_KEYS = new Set(['hp', 'mp']);

  for (const m of file.materials) {
    check(m.id, 'material');
    if (m.rarity != null && !isValidRank(m.rarity))
      err(`Material ${m.id}: rarity must be an integer R1〜R10 (got ${m.rarity})`);
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
    if (e.rarity != null && !isValidRank(e.rarity))
      err(`Equipment ${e.id}: rarity must be an integer R1〜R10 (got ${e.rarity})`);
    // Weapon tags: only on main_hand, only from the 12 canonical tags.
    if (e.weaponTags) {
      if (e.slot !== 'main_hand')
        err(`Equipment ${e.id}: weaponTags only allowed on main_hand`);
      for (const t of e.weaponTags) {
        if (!WEAPON_TAGS.has(t)) err(`Equipment ${e.id}: unknown weaponTag "${t}"`);
      }
    }
    // Class restrictions: only the 5 families; weapons use weaponTags instead.
    if (e.classRestrictions) {
      if (e.slot === 'main_hand')
        err(`Equipment ${e.id}: weapons restrict by weaponTags, not classRestrictions`);
      for (const f of e.classRestrictions) {
        if (!CLASS_FAMILY_SET.has(f)) err(`Equipment ${e.id}: unknown class family "${f}"`);
      }
    }
    for (const jobId of e.jobRequirements ?? []) {
      if (!jobIds.has(jobId)) err(`Equipment ${e.id}: unknown job requirement "${jobId}"`);
    }
    if (e.appearance != null && !appearanceIds.has(e.appearance)) {
      err(`Equipment ${e.id}: unknown appearance "${e.appearance}"`);
    }
    if (e.appearance != null && !e.jobRequirements?.length) {
      err(`Equipment ${e.id}: full-body appearance needs an exact job requirement`);
    }
    for (const k of Object.keys(e.derived ?? {})) {
      if (!DERIVED_KEYS.has(k)) err(`Equipment ${e.id}: invalid derived stat "${k}"`);
    }
    const atkSp = (e.derived as Record<string, number> | undefined)?.atkSpeed;
    if (atkSp != null && atkSp > MAX_EQUIP_ATKSPEED)
      err(`Equipment ${e.id}: atkSpeed ${atkSp} > ${MAX_EQUIP_ATKSPEED} (it's a multiplier bonus, use 0.1〜0.5)`);
    if (e.sellPrice != null && e.sellPrice < 0) err(`Equipment ${e.id}: negative sellPrice`);
    if (e.element != null && !ELEMENT_SET.has(e.element))
      err(`Equipment ${e.id}: unknown element "${e.element}"`);
    // Only weapons carry an offensive element (armour element would be inert).
    if (e.element != null && e.element !== 'none' && e.slot !== 'main_hand')
      err(`Equipment ${e.id}: element only meaningful on main_hand weapons`);
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
  const file = readJson<{
    enemies: {
      id: string;
      isBoss?: boolean;
      dropTableId?: string;
      weakness?: string;
      resist?: string;
      attacks?: Record<string, unknown>[];
      enrageAtHpPct?: number;
      variantOf?: string;
    }[];
  }>('src/data/defs/enemies.json');
  const ids = new Set<string>();
  const summonRefs: [string, string][] = [];
  const variantRefs: [string, string][] = [];
  for (const e of file.enemies) {
    if (ids.has(e.id)) err(`Duplicate enemy id: ${e.id}`);
    ids.add(e.id);
    if (e.dropTableId && !dropTableIds.has(e.dropTableId)) {
      err(`Enemy ${e.id}: unknown dropTableId "${e.dropTableId}"`);
    }
    if (e.weakness != null && !ELEMENT_SET.has(e.weakness))
      err(`Enemy ${e.id}: unknown weakness "${e.weakness}"`);
    if (e.resist != null && !ELEMENT_SET.has(e.resist))
      err(`Enemy ${e.id}: unknown resist "${e.resist}"`);
    if (e.weakness === 'none') err(`Enemy ${e.id}: weakness "none" is meaningless`);
    if (e.resist === 'none') err(`Enemy ${e.id}: resist "none" is meaningless`);
    if (e.weakness != null && e.weakness === e.resist)
      err(`Enemy ${e.id}: weakness and resist are the same element`);
    // 亜種 (variant) must reference its base species.
    if (e.variantOf != null) {
      if (e.variantOf === e.id) err(`Enemy ${e.id}: variantOf references itself`);
      else variantRefs.push([e.id, e.variantOf]);
    }
    // Boss attack patterns.
    if (e.attacks && !e.isBoss) err(`Enemy ${e.id}: attacks are boss-only`);
    if (e.enrageAtHpPct != null && !(e.enrageAtHpPct > 0 && e.enrageAtHpPct <= 1))
      err(`Enemy ${e.id}: enrageAtHpPct out of (0,1]`);
    for (const [i, a] of (e.attacks ?? []).entries()) {
      const at = `Enemy ${e.id}: attacks[${i}]`;
      const num = (k: string): number => a[k] as number;
      switch (a.type) {
        case 'aoe':
          if (!(num('radius') > 0)) err(`${at}: radius must be > 0`);
          if (!(num('damageMult') > 0)) err(`${at}: damageMult must be > 0`);
          if (!(num('telegraphMs') >= 300)) err(`${at}: telegraphMs must be >= 300 (must be dodgeable)`);
          if (a.count != null && !(num('count') >= 1)) err(`${at}: count must be >= 1`);
          if (a.at != null && a.at !== 'player' && a.at !== 'self') err(`${at}: bad "at"`);
          break;
        case 'charge':
          if (!(num('speed') > 0)) err(`${at}: speed must be > 0`);
          if (!(num('durationMs') > 0)) err(`${at}: durationMs must be > 0`);
          if (!(num('telegraphMs') >= 300)) err(`${at}: telegraphMs must be >= 300 (must be dodgeable)`);
          break;
        case 'shots':
          if (!(num('count') >= 1)) err(`${at}: count must be >= 1`);
          if (!(num('speed') > 0)) err(`${at}: speed must be > 0`);
          if (!(num('damageMult') > 0)) err(`${at}: damageMult must be > 0`);
          if (a.spread !== 'radial' && a.spread !== 'aim') err(`${at}: bad spread`);
          break;
        case 'summon':
          if (typeof a.enemyId !== 'string') err(`${at}: summon needs enemyId`);
          else summonRefs.push([`${at}`, a.enemyId]);
          if (!(num('count') >= 1)) err(`${at}: count must be >= 1`);
          break;
        case 'root_lanes':
          if (!(num('count') >= 1)) err(`${at}: count must be >= 1`);
          if (!(num('length') > 0)) err(`${at}: length must be > 0`);
          if (!(num('width') > 0)) err(`${at}: width must be > 0`);
          if (!(num('damageMult') > 0)) err(`${at}: damageMult must be > 0`);
          if (!(num('telegraphMs') >= 300)) err(`${at}: telegraphMs must be >= 300 (must be dodgeable)`);
          if (a.spreadDeg != null && !(num('spreadDeg') > 0 && num('spreadDeg') <= 180)) {
            err(`${at}: spreadDeg must be in (0,180]`);
          }
          break;
        default:
          err(`${at}: unknown type "${String(a.type)}"`);
      }
    }
  }
  for (const [at, id] of summonRefs) {
    if (!ids.has(id)) err(`${at}: summon enemyId "${id}" unknown`);
  }
  for (const [vid, base] of variantRefs) {
    if (!ids.has(base)) err(`Enemy ${vid}: variantOf "${base}" unknown`);
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

/** Map ids with a 'boss' spawn point (hunt arenas need one). */
const bossSpawnMaps = new Set<string>();

function validateMaps(enemyIds: Set<string>, dialogueIds: Set<string>): Set<string> {
  const files = [
    'town', 'field', 'forest', 'dungeon', 'canyon', 'volcano', 'snowfield', 'desert', 'boss_room',
    'arena_volcano', 'arena_grove', 'arena_marsh', 'arena_cavern', 'arena_peak',
    'arena_night', 'arena_plain', 'arena_swamp', 'arena_canyon', 'arena_frost',
    'arena_ruins', 'arena_abyss',
  ];
  type MapDoc = {
    id: string;
    size: { w: number; h: number };
    spawns: Record<string, [number, number]>;
    portals?: { to: string; toSpawn: string }[];
    enemies?: { type: string }[];
    npcs?: { dialogueId?: string }[];
    buildings?: {
      x: number; y: number; w: number; h: number; style: string; shop?: string;
      shadowType?: string; npcType?: string; signIcon?: string;
      props?: { kind: string; dx: number; dy: number }[];
    }[];
    water?: [number, number, number, number][];
    collisionRects?: [number, number, number, number][];
    landmarks?: { x: number; y: number; kind: string }[];
    path?: { axis: string; thickness: number; wind?: number };
    travel?: { order?: number; hidden?: boolean; unlockFlag?: string; note?: string };
  };
  const BUILDING_STYLES = new Set(['wood', 'stone', 'plaster']);
  const maps = new Map<string, MapDoc>();
  const travelOrders = new Map<number, string>();
  for (const f of files) {
    const m = readJson<MapDoc>(`src/data/defs/maps/${f}.json`);
    if (maps.has(m.id)) err(`Duplicate map id: ${m.id}`);
    maps.set(m.id, m);
    if (m.spawns && 'boss' in m.spawns) bossSpawnMaps.add(m.id);
    const order = m.travel?.order;
    if (order != null && !m.travel?.hidden) {
      const dup = travelOrders.get(order);
      if (dup) err(`Map ${m.id}: travel.order ${order} duplicates ${dup}`);
      else travelOrders.set(order, m.id);
    }
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
    const LANDMARKS = new Set(['big_tree', 'ruin', 'stone_circle', 'campfire']);
    if (m.path?.wind != null && !(m.path.wind >= 0 && m.path.wind <= 40))
      err(`Map ${m.id}: path.wind out of [0,40] (road could leave the map)`);
    for (const [i, r] of (m.water ?? []).entries()) {
      const [x, y, ww, wh] = r;
      if (!(ww > 0) || !(wh > 0)) err(`Map ${m.id}: water[${i}] non-positive size`);
      if (x < 0 || y < 0 || x + ww > m.size.w || y + wh > m.size.h)
        err(`Map ${m.id}: water[${i}] out of bounds`);
    }
    for (const [i, r] of (m.collisionRects ?? []).entries()) {
      const [x, y, ww, wh] = r;
      if (!(ww > 0) || !(wh > 0)) err(`Map ${m.id}: collisionRects[${i}] non-positive size`);
      if (x < 0 || y < 0 || x + ww > m.size.w || y + wh > m.size.h)
        err(`Map ${m.id}: collisionRects[${i}] out of bounds`);
    }
    for (const [i, lm] of (m.landmarks ?? []).entries()) {
      if (!LANDMARKS.has(lm.kind)) err(`Map ${m.id}: landmark[${i}] unknown kind "${lm.kind}"`);
      if (lm.x < 0 || lm.y < 0 || lm.x > m.size.w || lm.y > m.size.h)
        err(`Map ${m.id}: landmark[${i}] out of bounds`);
    }
    for (const [i, b] of (m.buildings ?? []).entries()) {
      if (!BUILDING_STYLES.has(b.style))
        err(`Map ${m.id}: building[${i}] unknown style "${b.style}"`);
      if (!(b.w > 0) || !(b.h > 0)) err(`Map ${m.id}: building[${i}] non-positive size`);
      if (b.x < 0 || b.y < 0 || b.x + b.w > m.size.w || b.y + b.h > m.size.h)
        err(`Map ${m.id}: building[${i}] out of map bounds`);
      if (b.shop && !['general', 'craft', 'guild', 'house'].includes(b.shop))
        err(`Map ${m.id}: building[${i}] unknown shop "${b.shop}"`);
      if (b.shadowType && !['soft', 'hard', 'none'].includes(b.shadowType))
        err(`Map ${m.id}: building[${i}] unknown shadowType "${b.shadowType}"`);
      if (b.npcType && !['merchant', 'smith', 'guild', 'elder', 'villager'].includes(b.npcType))
        err(`Map ${m.id}: building[${i}] unknown npcType "${b.npcType}"`);
      if (b.signIcon && !['sword', 'hammer', 'shield', 'potion', 'scroll', 'coin'].includes(b.signIcon))
        err(`Map ${m.id}: building[${i}] unknown signIcon "${b.signIcon}"`);
      for (const [j, pr] of (b.props ?? []).entries()) {
        if (!['barrel', 'crate', 'signpost', 'lantern', 'banner'].includes(pr.kind))
          err(`Map ${m.id}: building[${i}].props[${j}] unknown kind "${pr.kind}"`);
      }
    }
  }
  return new Set(maps.keys());
}

function collectItemIds(): Set<string> {
  const file = readJson<{
    materials: { id: string }[];
    consumables: { id: string }[];
    petItems: { id: string }[];
    equipment: { id: string }[];
  }>('src/data/defs/items.json');
  const regalia = readJson<{ regalia: { jobId: string }[] }>(
    'src/data/defs/job-regalia.json',
  );
  return new Set<string>([
    ...file.materials.map((m) => m.id),
    ...(file.consumables ?? []).map((c) => c.id),
    ...(file.petItems ?? []).map((p) => p.id),
    ...file.equipment.map((e) => e.id),
    ...regalia.regalia.flatMap((entry) => [
      `job_regalia_${entry.jobId}_head`,
      `job_regalia_${entry.jobId}`,
      `job_regalia_${entry.jobId}_weapon`,
    ]),
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
  const itemsFile = readJson<{ equipment: { id: string }[] }>('src/data/defs/items.json');
  const equipmentIds = new Set(itemsFile.equipment.map((e) => e.id));
  const file = readJson<{
    recipes: {
      id: string;
      resultItemId: string;
      resultQty: number;
      materials: Record<string, number>;
      consumeEquipment?: string[];
      gold: number;
    }[];
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
    // Upgrade recipes consume equipment pieces; each must be a real equipment id.
    for (const eq of r.consumeEquipment ?? []) {
      if (!equipmentIds.has(eq)) err(`Recipe ${r.id}: consumeEquipment "${eq}" is not equipment`);
    }
  }
}

function validateBossRareMaterials(): void {
  const items = readJson<{
    materials: { id: string; rarity?: number }[];
    equipment: { id: string }[];
  }>('src/data/defs/items.json');
  const rareMaterialIds = new Set(
    items.materials.filter((m) => (m.rarity ?? 0) >= 8).map((m) => m.id),
  );
  const equipmentIds = new Set(items.equipment.map((e) => e.id));
  const drops = readJson<{
    tables: { id: string; entries: { itemId: string; dropRate: number }[] }[];
  }>('src/data/defs/drops.json');
  const recipes = readJson<{
    recipes: { resultItemId: string; materials: Record<string, number> }[];
  }>('src/data/defs/recipes.json').recipes;

  for (const table of drops.tables.filter((t) => t.id.startsWith('boss_'))) {
    const bossRares = table.entries.filter(
      (e) => e.dropRate > 0 && e.dropRate <= 0.1 && rareMaterialIds.has(e.itemId),
    );
    if (bossRares.length === 0) {
      err(`Boss drop ${table.id}: no R8+ rare material at 10% or lower`);
      continue;
    }
    for (const rare of bossRares) {
      const hasEquipmentUse = recipes.some(
        (r) => equipmentIds.has(r.resultItemId) && (r.materials[rare.itemId] ?? 0) > 0,
      );
      if (!hasEquipmentUse) {
        err(
          `Boss drop ${table.id}: rare material "${rare.itemId}" is not used by any equipment recipe`,
        );
      }
    }
  }
}

function validateBossRareExchanges(itemIds: Set<string>, dropTableIds: Set<string>): void {
  const items = readJson<{
    materials: { id: string; rarity?: number; sellPrice: number }[];
  }>('src/data/defs/items.json');
  const materialById = new Map(items.materials.map((m) => [m.id, m]));
  const drops = readJson<{
    tables: { id: string; entries: { itemId: string; dropRate: number }[] }[];
  }>('src/data/defs/drops.json');
  const tableById = new Map(drops.tables.map((t) => [t.id, t]));
  const file = readJson<{
    exchangeCost: number;
    exchanges: {
      rareMaterialId: string;
      proofItemId: string;
      dropTableIds: string[];
    }[];
  }>('src/data/defs/boss-rare-exchanges.json');

  if (file.exchangeCost !== 12) {
    err(`Boss rare exchange: exchangeCost must be 12 (got ${file.exchangeCost})`);
  }
  const rareIds = new Set<string>();
  const proofIds = new Set<string>();
  const coveredTables = new Set<string>();
  for (const exchange of file.exchanges) {
    if (rareIds.has(exchange.rareMaterialId)) {
      err(`Boss rare exchange: duplicate rare material "${exchange.rareMaterialId}"`);
    }
    rareIds.add(exchange.rareMaterialId);
    if (proofIds.has(exchange.proofItemId)) {
      err(`Boss rare exchange: duplicate proof item "${exchange.proofItemId}"`);
    }
    proofIds.add(exchange.proofItemId);

    const rare = materialById.get(exchange.rareMaterialId);
    const proof = materialById.get(exchange.proofItemId);
    if (!itemIds.has(exchange.rareMaterialId) || !rare) {
      err(`Boss rare exchange: unknown rare material "${exchange.rareMaterialId}"`);
    } else if ((rare.rarity ?? 0) < 8) {
      err(`Boss rare exchange: "${exchange.rareMaterialId}" must be R8+`);
    }
    if (!itemIds.has(exchange.proofItemId) || !proof) {
      err(`Boss rare exchange: unknown proof item "${exchange.proofItemId}"`);
    } else if (proof.sellPrice !== 0) {
      err(`Boss rare exchange: proof "${exchange.proofItemId}" must not be sellable`);
    }
    if (exchange.dropTableIds.length === 0) {
      err(`Boss rare exchange ${exchange.rareMaterialId}: no drop tables`);
    }
    for (const tableId of exchange.dropTableIds) {
      if (!dropTableIds.has(tableId)) {
        err(`Boss rare exchange ${exchange.rareMaterialId}: unknown drop table "${tableId}"`);
        continue;
      }
      if (coveredTables.has(tableId)) {
        err(`Boss rare exchange: drop table "${tableId}" is covered more than once`);
      }
      coveredTables.add(tableId);
      const table = tableById.get(tableId);
      const rareDrop = table?.entries.find((entry) => entry.itemId === exchange.rareMaterialId);
      if (!rareDrop || rareDrop.dropRate <= 0 || rareDrop.dropRate > 0.1) {
        err(
          `Boss rare exchange ${tableId}: "${exchange.rareMaterialId}" is not a 1-10% drop`,
        );
      }
    }
  }

  for (const table of drops.tables.filter((t) => t.id.startsWith('boss_'))) {
    if (!coveredTables.has(table.id)) {
      err(`Boss rare exchange: drop table "${table.id}" has no hunt proof`);
    }
  }
}

function validateBossSetBonuses(): void {
  const items = readJson<{
    equipment: { id: string; slot: string }[];
  }>('src/data/defs/items.json');
  const equipmentById = new Map(items.equipment.map((item) => [item.id, item]));
  const recipeResults = new Set(
    readJson<{ recipes: { resultItemId: string }[] }>('src/data/defs/recipes.json').recipes
      .map((recipe) => recipe.resultItemId),
  );
  const exchangeRareIds = new Set(
    readJson<{ exchanges: { rareMaterialId: string }[] }>(
      'src/data/defs/boss-rare-exchanges.json',
    ).exchanges.map((exchange) => exchange.rareMaterialId),
  );
  const file = readJson<{
    sets: {
      id: string;
      name: string;
      rareMaterialId: string;
      maxPieces: number;
      pieceIds: string[];
      bonuses: {
        pieces: number;
        name: string;
        description: string;
        derived?: Record<string, number>;
        combat?: {
          damageRate?: number;
          damageReduction?: number;
          critDamage?: number;
          bossDamage?: number;
          skillPower?: number;
          lowHpDamage?: number;
          healOnKillRate?: number;
          onHit?: { chance: number; power: number; element: string; label: string };
        };
      }[];
    }[];
  }>('src/data/defs/boss-set-bonuses.json');

  const setIds = new Set<string>();
  const rareIds = new Set<string>();
  const combatKeys = new Set([
    'damageRate',
    'damageReduction',
    'critDamage',
    'bossDamage',
    'skillPower',
    'lowHpDamage',
    'healOnKillRate',
    'onHit',
  ]);
  for (const set of file.sets) {
    if (setIds.has(set.id)) err(`Boss set: duplicate id "${set.id}"`);
    setIds.add(set.id);
    if (!set.name) err(`Boss set ${set.id}: empty name`);
    if (rareIds.has(set.rareMaterialId)) {
      err(`Boss set: duplicate rare material "${set.rareMaterialId}"`);
    }
    rareIds.add(set.rareMaterialId);
    if (!exchangeRareIds.has(set.rareMaterialId)) {
      err(`Boss set ${set.id}: rare material "${set.rareMaterialId}" has no exchange family`);
    }
    if (set.maxPieces !== 4) err(`Boss set ${set.id}: maxPieces must be 4`);
    if (new Set(set.pieceIds).size !== set.pieceIds.length) {
      err(`Boss set ${set.id}: duplicate piece id`);
    }
    const slots = new Set<string>();
    for (const itemId of set.pieceIds) {
      const item = equipmentById.get(itemId);
      if (!item) {
        err(`Boss set ${set.id}: unknown equipment "${itemId}"`);
        continue;
      }
      slots.add(item.slot);
      if (!recipeResults.has(itemId)) err(`Boss set ${set.id}: "${itemId}" has no recipe`);
    }
    if (slots.size < set.maxPieces) {
      err(`Boss set ${set.id}: only ${slots.size} simultaneously equippable slots`);
    }
    const thresholds = set.bonuses.map((bonus) => bonus.pieces).sort((a, b) => a - b);
    if (thresholds.length !== 2 || thresholds[0] !== 2 || thresholds[1] !== 4) {
      err(`Boss set ${set.id}: bonuses must contain exactly 2-piece and 4-piece tiers`);
    }
    for (const bonus of set.bonuses) {
      if (!bonus.name || !bonus.description) {
        err(`Boss set ${set.id}/${bonus.pieces}: name and description are required`);
      }
      for (const key of Object.keys(bonus.derived ?? {})) {
        if (!DERIVED_KEYS.has(key)) err(`Boss set ${set.id}: invalid derived stat "${key}"`);
      }
      for (const key of Object.keys(bonus.combat ?? {})) {
        if (!combatKeys.has(key)) err(`Boss set ${set.id}: invalid combat bonus "${key}"`);
      }
      const combat = bonus.combat;
      for (const value of [
        combat?.damageRate,
        combat?.damageReduction,
        combat?.critDamage,
        combat?.bossDamage,
        combat?.skillPower,
        combat?.lowHpDamage,
        combat?.healOnKillRate,
      ]) {
        if (value != null && (value < 0 || value > 0.5)) {
          err(`Boss set ${set.id}/${bonus.pieces}: combat value ${value} out of [0,0.5]`);
        }
      }
      if (combat?.onHit) {
        if (combat.onHit.chance <= 0 || combat.onHit.chance > 1) {
          err(`Boss set ${set.id}: onHit chance out of (0,1]`);
        }
        if (combat.onHit.power <= 0 || combat.onHit.power > 1) {
          err(`Boss set ${set.id}: onHit power out of (0,1]`);
        }
        if (!ELEMENT_SET.has(combat.onHit.element) || combat.onHit.element === 'none') {
          err(`Boss set ${set.id}: invalid onHit element "${combat.onHit.element}"`);
        }
        if (!combat.onHit.label) err(`Boss set ${set.id}: empty onHit label`);
      }
    }
  }
  for (const rareId of exchangeRareIds) {
    if (!rareIds.has(rareId)) err(`Boss set: exchange rare "${rareId}" has no set`);
  }
}

function validateSkills(): Set<string> {
  const file = readJson<{
    skills: {
      id: string;
      type: string;
      requires?: string[];
      derived?: Record<string, number>;
      fx?: string;
      icon?: string;
      family?: string;
      jobId?: string;
      scaling?: string;
      minTier?: number;
      element?: string;
      effect?: string;
      projSpeed?: number;
      projCount?: number;
      buffStats?: Record<string, number>;
      buffMs?: number;
    }[];
  }>('src/data/defs/skills.json');
  const jobsFile = readJson<{
    jobs: { id: string; family?: string; tier: number }[];
  }>('src/data/defs/jobs.json');
  const jobsById = new Map(jobsFile.jobs.map((job) => [job.id, job]));
  const skillRows = [...file.skills, ...JOB_SIGNATURE_SKILLS];
  const FX_STYLES = new Set(['slash', 'impact', 'magic']);
  const SCALINGS = new Set(['phys', 'mag']);
  const ids = new Set<string>();
  for (const s of skillRows) {
    if (ids.has(s.id)) err(`Duplicate skill id: ${s.id}`);
    ids.add(s.id);
    if (s.type !== 'active' && s.type !== 'passive') err(`Skill ${s.id}: bad type "${s.type}"`);
    if (s.fx !== undefined && !FX_STYLES.has(s.fx)) err(`Skill ${s.id}: unknown fx "${s.fx}"`);
    if (s.scaling !== undefined && !SCALINGS.has(s.scaling))
      err(`Skill ${s.id}: unknown scaling "${s.scaling}"`);
    if (s.family !== undefined && !CLASS_FAMILY_SET.has(s.family))
      err(`Skill ${s.id}: unknown class family "${s.family}"`);
    if (s.jobId !== undefined) {
      const job = jobsById.get(s.jobId);
      if (!job) err(`Skill ${s.id}: unknown exact job "${s.jobId}"`);
      else {
        if (s.family !== job.family) err(`Skill ${s.id}: family does not match job ${s.jobId}`);
        if (s.minTier !== job.tier) err(`Skill ${s.id}: tier does not match job ${s.jobId}`);
      }
    }
    if (s.minTier !== undefined && (!Number.isInteger(s.minTier) || s.minTier < 1 || s.minTier > 4))
      err(`Skill ${s.id}: minTier must be an integer 1〜4 (got ${s.minTier})`);
    if (s.minTier !== undefined && s.family === undefined)
      err(`Skill ${s.id}: minTier set without a family`);
    if (s.family !== undefined && s.scaling !== undefined && s.type === 'passive')
      err(`Skill ${s.id}: passive skill should not set scaling`);
    if (s.element !== undefined && !ELEMENT_SET.has(s.element))
      err(`Skill ${s.id}: unknown element "${s.element}"`);
    if (s.element !== undefined && s.type === 'passive')
      err(`Skill ${s.id}: passive skill should not set element`);
    // Effect kinds + their required params.
    const EFFECTS = new Set(['damage', 'projectile', 'heal', 'buff']);
    if (s.effect !== undefined) {
      if (!EFFECTS.has(s.effect)) err(`Skill ${s.id}: unknown effect "${s.effect}"`);
      if (s.type === 'passive') err(`Skill ${s.id}: passive skill should not set effect`);
    }
    if (s.effect === 'projectile') {
      if (s.projSpeed !== undefined && !(s.projSpeed > 0)) err(`Skill ${s.id}: projSpeed must be > 0`);
      if (s.projCount !== undefined && !(s.projCount >= 1)) err(`Skill ${s.id}: projCount must be >= 1`);
    }
    if (s.effect === 'buff') {
      if (!s.buffStats || Object.keys(s.buffStats).length === 0)
        err(`Skill ${s.id}: buff needs buffStats`);
      if (!(s.buffMs !== undefined && s.buffMs > 0)) err(`Skill ${s.id}: buff needs buffMs > 0`);
      for (const k of Object.keys(s.buffStats ?? {})) {
        if (!DERIVED_KEYS.has(k)) err(`Skill ${s.id}: invalid buff stat "${k}"`);
      }
    }
    if (s.effect === 'heal' && s.element !== undefined)
      err(`Skill ${s.id}: heals should not carry an attack element`);
    for (const k of Object.keys(s.derived ?? {})) {
      if (!DERIVED_KEYS.has(k)) err(`Skill ${s.id}: invalid derived stat "${k}"`);
    }
  }
  // Prereq existence + acyclic.
  for (const job of jobsFile.jobs.filter((entry) => entry.id !== 'adventurer')) {
    const count = skillRows.filter((skill) => skill.jobId === job.id).length;
    if (count !== SIGNATURE_SKILLS_PER_JOB) {
      err(`Job ${job.id}: expected ${SIGNATURE_SKILLS_PER_JOB} signature skills, got ${count}`);
    }
  }
  const byId = new Map(skillRows.map((s) => [s.id, s]));
  for (const s of skillRows) {
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
  for (const s of skillRows) visit(s.id, new Set());
  return ids;
}

function validateJobs(skillIds: Set<string>): void {
  const file = readJson<{
    jobs: {
      id: string;
      parentJobIds?: string[];
      family?: string;
      equippableWeaponTags?: string[];
      unlockConditions?: Record<string, unknown>[];
      baseStatModifiers?: Record<string, number>;
      derivedModifiers?: Record<string, number>;
      appearance?: string;
    }[];
  }>('src/data/defs/jobs.json');
  const ids = new Set(file.jobs.map((j) => j.id));
  const APPEARANCE_SET = new Set<string>(JOB_APPEARANCE_IDS);
  const BASE_KEYS = new Set(['STR', 'VIT', 'INT', 'DEX', 'LUK']);
  const COND_TYPES = new Set(['jobLevel', 'charLevel', 'skill', 'flag', 'quest']);
  for (const j of file.jobs) {
    for (const p of j.parentJobIds ?? []) if (!ids.has(p)) err(`Job ${j.id}: unknown parent "${p}"`);
    if (!Array.isArray(j.unlockConditions))
      err(`Job ${j.id}: missing unlockConditions array`);
    for (const c of j.unlockConditions ?? []) {
      const type = c.type as string;
      if (!COND_TYPES.has(type)) {
        err(`Job ${j.id}: invalid unlock condition type "${type}"`);
        continue;
      }
      if (type === 'jobLevel') {
        if (!ids.has(c.jobId as string)) err(`Job ${j.id}: unlock jobLevel jobId "${c.jobId}" unknown`);
        if (typeof c.level !== 'number') err(`Job ${j.id}: jobLevel condition needs numeric level`);
      }
      if (type === 'charLevel' && typeof c.level !== 'number')
        err(`Job ${j.id}: charLevel condition needs numeric level`);
      if (type === 'skill' && !skillIds.has(c.skillId as string))
        err(`Job ${j.id}: unlock skill "${c.skillId}" unknown`);
      // 'flag' and 'quest' reference runtime/TBD state; not cross-validated here.
    }
    for (const k of Object.keys(j.baseStatModifiers ?? {}))
      if (!BASE_KEYS.has(k)) err(`Job ${j.id}: invalid base stat "${k}"`);
    for (const k of Object.keys(j.derivedModifiers ?? {}))
      if (!DERIVED_KEYS.has(k)) err(`Job ${j.id}: invalid derived stat "${k}"`);
    if (j.family != null && !CLASS_FAMILY_SET.has(j.family))
      err(`Job ${j.id}: unknown class family "${j.family}"`);
    if (j.appearance != null && !APPEARANCE_SET.has(j.appearance))
      err(`Job ${j.id}: unknown appearance "${j.appearance}"`);
    for (const t of j.equippableWeaponTags ?? [])
      if (!WEAPON_TAGS.has(t)) err(`Job ${j.id}: unknown weaponTag "${t}"`);
  }
}

function validateJobRegalia(enemyIds: Set<string>, mapIds: Set<string>): void {
  type Regalia = {
    jobId: string;
    jobName: string;
    itemName: string;
    appearance: string;
    rarity: number;
    levelRequirement: number;
    rank: number;
    trialName: string;
    huntMap: string;
    enemyId: string;
    derived: Record<string, number>;
  };
  const entries = readJson<{ regalia: Regalia[] }>(
    'src/data/defs/job-regalia.json',
  ).regalia;
  const jobs = readJson<{
    jobs: { id: string; name: string; tier: number; appearance?: string }[];
  }>('src/data/defs/jobs.json').jobs;
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const appearanceIds = new Set<string>(JOB_APPEARANCE_IDS);
  const baseItemIds = new Set(
    readJson<{ equipment: { id: string }[] }>('src/data/defs/items.json').equipment
      .map((item) => item.id),
  );
  const baseQuestIds = new Set(
    readJson<{ quests: { id: string }[] }>('src/data/defs/quests.json').quests
      .map((quest) => quest.id),
  );
  const seenJobs = new Set<string>();
  const seenItems = new Set<string>();
  const seenQuests = new Set<string>();

  for (const entry of entries) {
    const at = `Job regalia ${entry.jobId}`;
    const job = jobsById.get(entry.jobId);
    if (!job) {
      err(`${at}: unknown job`);
      continue;
    }
    if (seenJobs.has(entry.jobId)) err(`${at}: duplicate job entry`);
    seenJobs.add(entry.jobId);
    if (entry.jobName !== job.name) err(`${at}: jobName does not match jobs.json`);
    if (entry.appearance !== job.appearance) err(`${at}: appearance does not match the job`);
    if (!appearanceIds.has(entry.appearance)) {
      err(`${at}: unknown appearance "${entry.appearance}"`);
    }
    if (!isValidRank(entry.rarity)) err(`${at}: rarity must be R1〜R10`);
    if (minJobTierForRank(entry.rarity) !== job.tier) {
      err(`${at}: rarity R${entry.rarity} does not match job tier ${job.tier}`);
    }
    if (!Number.isInteger(entry.levelRequirement) || entry.levelRequirement < 1 || entry.levelRequirement > 99) {
      err(`${at}: levelRequirement must be an integer 1〜99`);
    }
    if (!Number.isInteger(entry.rank) || entry.rank < 1 || entry.rank > 7) {
      err(`${at}: rank must be an integer 1〜7`);
    }
    if (!entry.itemName || !entry.trialName) err(`${at}: itemName and trialName are required`);
    if (!enemyIds.has(entry.enemyId)) err(`${at}: unknown enemy "${entry.enemyId}"`);
    if (!mapIds.has(entry.huntMap)) err(`${at}: unknown huntMap "${entry.huntMap}"`);
    if (!bossSpawnMaps.has(entry.huntMap)) err(`${at}: huntMap has no boss spawn`);
    for (const key of Object.keys(entry.derived ?? {})) {
      if (!DERIVED_KEYS.has(key)) err(`${at}: invalid derived stat "${key}"`);
    }

    const itemIds = [
      `job_regalia_${entry.jobId}_head`,
      `job_regalia_${entry.jobId}`,
      `job_regalia_${entry.jobId}_weapon`,
    ];
    const questId = `job_regalia_trial_${entry.jobId}`;
    for (const itemId of itemIds) {
      if (seenItems.has(itemId) || baseItemIds.has(itemId)) {
        err(`${at}: duplicate item id "${itemId}"`);
      }
      seenItems.add(itemId);
    }
    if (seenQuests.has(questId) || baseQuestIds.has(questId)) err(`${at}: duplicate quest id "${questId}"`);
    seenQuests.add(questId);
  }

  for (const job of jobs.filter((entry) => entry.appearance)) {
    if (!seenJobs.has(job.id)) err(`Job regalia: ${job.id} has no class outfit`);
  }
}

function validateQuests(itemIds: Set<string>, enemyIds: Set<string>, mapIds: Set<string>): void {
  const file = readJson<{
    quests: {
      id: string;
      type: string;
      objectives: { type: string; enemyId: string; count: number }[];
      require?: { questDone?: string; jobId?: string };
      rewards: { items?: Record<string, number> };
      huntMap?: string;
      huntModifiers?: { hpMult?: unknown; dmgMult?: unknown };
      rank?: number;
      veteran?: unknown;
    }[];
  }>('src/data/defs/quests.json');
  const QTYPES = new Set(['subjugation', 'unlock', 'hunt', 'main']);
  const ids = new Set(file.quests.map((q) => q.id));
  const jobIds = new Set(
    readJson<{ jobs: { id: string }[] }>('src/data/defs/jobs.json').jobs.map((job) => job.id),
  );
  for (const q of file.quests) {
    if (q.huntMap && !mapIds.has(q.huntMap))
      err(`Quest ${q.id}: huntMap "${q.huntMap}" is not a known map`);
    if (q.huntMap && mapIds.has(q.huntMap) && !bossSpawnMaps.has(q.huntMap))
      err(`Quest ${q.id}: huntMap "${q.huntMap}" has no 'boss' spawn point`);
    if (q.veteran != null && typeof q.veteran !== 'boolean')
      err(`Quest ${q.id}: veteran must be a boolean`);
    if (q.veteran === true && !q.huntMap)
      err(`Quest ${q.id}: veteran only applies to hunt quests (needs huntMap)`);
    if (q.huntModifiers != null && !q.huntMap)
      err(`Quest ${q.id}: huntModifiers only apply to hunt quests (needs huntMap)`);
    for (const [key, value] of Object.entries(q.huntModifiers ?? {})) {
      if (key !== 'hpMult' && key !== 'dmgMult')
        err(`Quest ${q.id}: unknown hunt modifier "${key}"`);
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        err(`Quest ${q.id}: huntModifiers.${key} must be a positive number`);
    }
    if (q.rank != null && (!Number.isInteger(q.rank) || q.rank < 1 || q.rank > 7))
      err(`Quest ${q.id}: rank must be an integer 1〜7 (got ${q.rank})`);
    if (!QTYPES.has(q.type)) err(`Quest ${q.id}: invalid type "${q.type}"`);
    if (!q.objectives?.length) err(`Quest ${q.id}: needs at least one objective`);
    for (const o of q.objectives ?? []) {
      if (o.type !== 'kill') err(`Quest ${q.id}: invalid objective type "${o.type}"`);
      if (!enemyIds.has(o.enemyId)) err(`Quest ${q.id}: unknown enemy "${o.enemyId}"`);
      if (!(o.count >= 1)) err(`Quest ${q.id}: objective count must be >= 1`);
    }
    if (q.require?.questDone && !ids.has(q.require.questDone))
      err(`Quest ${q.id}: requires unknown quest "${q.require.questDone}"`);
    if (q.require?.jobId && !jobIds.has(q.require.jobId))
      err(`Quest ${q.id}: requires unknown job "${q.require.jobId}"`);
    for (const id of Object.keys(q.rewards?.items ?? {})) {
      if (!itemIds.has(id)) err(`Quest ${q.id}: reward item "${id}" not in items.json`);
    }
  }
}

function validateTutorial(): void {
  const file = readJson<{
    introVersion: number;
    steps: { id: string; title: string; body: string; anchor: string; advanceOn?: string }[];
    npcHints?: { action: string; text: string }[];
  }>('src/data/defs/tutorial.json');
  const ANCHORS = new Set(['none', 'stick', 'attack', 'bag']);
  const ADVANCE = new Set(['enemy:died', 'ui:open-inventory']);
  const NPC_ACTIONS = new Set(['quest', 'craft', 'item', 'job']);
  if (!(file.introVersion >= 1)) err('Tutorial: introVersion must be >= 1');
  if (!file.steps?.length) err('Tutorial: needs at least one step');
  const seen = new Set<string>();
  for (const s of file.steps ?? []) {
    if (!s.id) err('Tutorial: a step is missing its id');
    if (seen.has(s.id)) err(`Tutorial: duplicate step id "${s.id}"`);
    seen.add(s.id);
    if (!s.title || !s.body) err(`Tutorial step ${s.id}: title and body are required`);
    if (!ANCHORS.has(s.anchor)) err(`Tutorial step ${s.id}: invalid anchor "${s.anchor}"`);
    if (s.advanceOn && !ADVANCE.has(s.advanceOn))
      err(`Tutorial step ${s.id}: invalid advanceOn "${s.advanceOn}"`);
  }
  const hintSeen = new Set<string>();
  for (const hn of file.npcHints ?? []) {
    if (!NPC_ACTIONS.has(hn.action)) err(`Tutorial npcHint: invalid action "${hn.action}"`);
    if (hintSeen.has(hn.action)) err(`Tutorial npcHint: duplicate action "${hn.action}"`);
    hintSeen.add(hn.action);
    if (!hn.text) err(`Tutorial npcHint ${hn.action}: text is required`);
  }
}

function validateShops(itemIds: Set<string>): void {
  const file = readJson<{
    shops: { id: string; name: string; stock: { itemId: string; price: number }[] }[];
  }>('src/data/defs/shops.json');
  const seen = new Set<string>();
  for (const s of file.shops ?? []) {
    if (!s.id || !s.name) err('Shop: id and name are required');
    if (seen.has(s.id)) err(`Shop: duplicate id "${s.id}"`);
    seen.add(s.id);
    for (const [i, e] of (s.stock ?? []).entries()) {
      if (!itemIds.has(e.itemId)) err(`Shop ${s.id}: stock[${i}] unknown item "${e.itemId}"`);
      if (!(e.price > 0) || !Number.isInteger(e.price))
        err(`Shop ${s.id}: stock[${i}] price must be a positive integer`);
    }
  }
}

const itemIds = collectItemIds();
const dropTableIds = validateDrops(itemIds);
const enemyIds = validateEnemies(itemIds, dropTableIds);
const dialogueIds = validateDialogue();
const mapIds = validateMaps(enemyIds, dialogueIds);
validateRecipes(itemIds);
validateBossRareMaterials();
validateBossRareExchanges(itemIds, dropTableIds);
validateBossSetBonuses();
const skillIds = validateSkills();
validateJobs(skillIds);
validatePets();
validateQuests(itemIds, enemyIds, mapIds);
validateJobRegalia(enemyIds, mapIds);
validateShops(itemIds);
validateTutorial();

if (errors.length > 0) {
  console.error(`Data validation FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
} else {
  console.log('Data validation passed.');
}
