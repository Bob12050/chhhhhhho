import type { GameState } from '@/player/game-state';
import { getMaterial, getConsumable, getEquipment } from '@/data/items';
import { bus } from '@/core/event-bus';
import type { Recipe } from '@/crafting/recipes';

/** Why a recipe can't be crafted right now (or null if it can). */
export type CraftBlock = 'gold' | 'materials' | null;

export function craftBlock(gs: GameState, r: Recipe): CraftBlock {
  for (const [id, qty] of Object.entries(r.materials)) {
    if ((gs.materials[id] ?? 0) < qty) return 'materials';
  }
  if (gs.gold < r.gold) return 'gold';
  return null;
}

export function canCraft(gs: GameState, r: Recipe): boolean {
  return craftBlock(gs, r) === null;
}

/** Consume inputs and grant the result. Returns false if not affordable. */
export function craft(gs: GameState, r: Recipe): boolean {
  if (!canCraft(gs, r)) return false;
  gs.addGold(-r.gold);
  gs.consumeMaterials(r.materials);
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
