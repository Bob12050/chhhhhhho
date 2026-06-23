import recipesJson from '@/data/defs/recipes.json';

/**
 * Crafting recipe definitions (data-driven). A recipe consumes materials +
 * gold at a station and yields an item. Unlock conditions land later; for now
 * all recipes are available at the craft NPC.
 */
export interface Recipe {
  id: string;
  resultItemId: string;
  resultQty: number;
  materials: Record<string, number>;
  gold: number;
  station?: string;
}

interface RecipesFile {
  recipes: Recipe[];
}

const recipes = new Map<string, Recipe>();
for (const r of (recipesJson as unknown as RecipesFile).recipes) recipes.set(r.id, r);

export function getRecipe(id: string): Recipe | undefined {
  return recipes.get(id);
}

export function allRecipes(): Recipe[] {
  return [...recipes.values()];
}
