import enemiesJson from '@/data/defs/enemies.json';

/**
 * Enemy definitions (immutable, data-driven). The scene/FSM (`Enemy`) consumes
 * these by id so map data can reference enemies without hardcoding stats.
 * Phase 1 expands the roster (M9); drops move to drop tables (M4).
 */
export interface EnemyDef {
  id: string;
  name: string;
  textureKey: string;
  maxHp: number;
  moveSpeed: number;
  contactDamage: number;
  aggroRange: number;
  attackRange: number;
  expReward: number;
  /** Phase-0-style single drop; superseded by drop tables in M4. */
  drop?: { itemId: string };
}

interface EnemiesFile {
  enemies: EnemyDef[];
}

const defs = new Map<string, EnemyDef>();
for (const e of (enemiesJson as EnemiesFile).enemies) defs.set(e.id, e);

export function getEnemyDef(id: string): EnemyDef | undefined {
  return defs.get(id);
}

export function allEnemyDefs(): EnemyDef[] {
  return [...defs.values()];
}
