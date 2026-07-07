import type { GameState } from '@/player/game-state';
import { getMaterial, getConsumable, getEquipment } from '@/data/items';
import { bus } from '@/core/event-bus';
import type { Recipe } from '@/crafting/recipes';

/** Why a recipe can't be crafted right now (or null if it can). */
export type CraftBlock = 'gold' | 'materials' | 'equipment' | null;

/** Count of each required equipment piece (upgrade recipes consume gear). */
function requiredEquipment(r: Recipe): Map<string, number> {
  const need = new Map<string, number>();
  for (const id of r.consumeEquipment ?? []) need.set(id, (need.get(id) ?? 0) + 1);
  return need;
}

export function craftBlock(gs: GameState, r: Recipe): CraftBlock {
  for (const [id, qty] of Object.entries(r.materials)) {
    if ((gs.materials[id] ?? 0) < qty) return 'materials';
  }
  for (const [id, qty] of requiredEquipment(r)) {
    if (gs.ownedEquipmentCount(id) < qty) return 'equipment';
  }
  if (gs.gold < r.gold) return 'gold';
  return null;
}

export function canCraft(gs: GameState, r: Recipe): boolean {
  return craftBlock(gs, r) === null;
}

/**
 * MH-style recipe discovery: a recipe shows up once the player has SEEN any of
 * its material inputs (obtained at least once, even if since spent), or owns a
 * piece of gear the recipe consumes (upgrade recipes), or needs no materials at
 * all. Keeps the craft list from being a wall of unobtainable spoilers.
 */
export function isRecipeVisible(gs: GameState, r: Recipe): boolean {
  const matIds = Object.keys(r.materials);
  if (matIds.length === 0 && (r.consumeEquipment ?? []).length === 0) return true;
  if (matIds.some((id) => gs.seenMaterials[id])) return true;
  if ((r.consumeEquipment ?? []).some((id) => gs.ownedEquipmentCount(id) > 0)) return true;
  return false;
}

/** Level requirement of a recipe's result (0 for materials/consumables). */
function resultLevel(r: Recipe): number {
  return getEquipment(r.resultItemId)?.levelRequirement ?? 0;
}

/** Visible recipes: craftable first, each group sorted by result level. */
export function visibleRecipes(
  gs: GameState,
  all: Recipe[],
): { visible: Recipe[]; hidden: number } {
  const visible = all.filter((r) => isRecipeVisible(gs, r));
  const byLevel = (a: Recipe, b: Recipe): number =>
    resultLevel(a) - resultLevel(b) || a.resultItemId.localeCompare(b.resultItemId);
  const craftable = visible.filter((r) => craftBlock(gs, r) === null).sort(byLevel);
  const rest = visible.filter((r) => craftBlock(gs, r) !== null).sort(byLevel);
  return { visible: [...craftable, ...rest], hidden: all.length - visible.length };
}

/** Consume inputs and grant the result. Returns false if not affordable. */
export function craft(gs: GameState, r: Recipe): boolean {
  if (!canCraft(gs, r)) return false;
  gs.addGold(-r.gold);
  gs.consumeMaterials(r.materials);
  for (const id of r.consumeEquipment ?? []) gs.removeEquipment(id);
  grantResult(gs, r.resultItemId, r.resultQty);
  gs.flags['crafted_any'] = true;
  bus.emit('craft:made', { recipeId: r.id });
  return true;
}

function grantResult(gs: GameState, itemId: string, qty: number): void {
  if (getMaterial(itemId)) gs.addMaterial(itemId, qty);
  else if (getConsumable(itemId)) gs.addConsumable(itemId, qty);
  else if (getEquipment(itemId)) for (let i = 0; i < qty; i++) gs.addEquipment(itemId);
}
