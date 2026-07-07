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
  /** Optional placeholder tint (e.g. "#88aaff") to distinguish reused sprites. */
  tint?: string;
  /** Display scale (boss / large enemies). */
  scale?: number;
  isBoss?: boolean;
  maxHp: number;
  moveSpeed: number;
  contactDamage: number;
  aggroRange: number;
  attackRange: number;
  expReward: number;
  goldReward?: number;
  /** Hover distance for hit-and-run enemies. */
  keepDistance?: number;
  /** 0..1 knockback ignored (heavy enemies). */
  knockbackResist?: number;
  /** Animation playback speed multiplier (1 = normal, <1 = slower). */
  animSpeed?: number;
  /** Drop table id (see drops.json); rolled on death. */
  dropTableId?: string;
  /** Elemental weakness (takes ×1.5 from it) / resist (×0.5). See elements.ts. */
  weakness?: string;
  resist?: string;
  /** Boss attack pattern pool (scheduled by BossBrain). */
  attacks?: BossAttackDef[];
  /** HP fraction (0..1) at which the boss enrages (faster attacks/moves). */
  enrageAtHpPct?: number;
  /** 亜種: id of the base species this enemy is a recolored variant of. */
  variantOf?: string;
}

/**
 * One boss attack. Damage = contactDamage × damageMult. Every attack
 * telegraphs before it lands so the player can react (the MH dodge loop).
 */
export type BossAttackDef =
  | {
      type: 'aoe';
      /** Blast radius in px. */
      radius: number;
      damageMult: number;
      /** Warning-circle duration before the blast. */
      telegraphMs: number;
      /** Number of blasts (1 = at the player, extras scatter nearby). */
      count?: number;
      /** 'player' targets the player's position, 'self' centers on the boss. */
      at?: 'player' | 'self';
    }
  | {
      type: 'charge';
      /** Dash speed in px/s. */
      speed: number;
      durationMs: number;
      telegraphMs: number;
    }
  | {
      type: 'shots';
      count: number;
      /** Projectile speed in px/s. */
      speed: number;
      damageMult: number;
      /** 'radial' = full circle, 'aim' = arc toward the player. */
      spread: 'radial' | 'aim';
      /** Arc width in degrees for 'aim' (default 50). */
      arcDeg?: number;
    }
  | {
      type: 'summon';
      enemyId: string;
      count: number;
      /** Cap on live minions from this boss (default 4). */
      maxMinions?: number;
    };

interface EnemiesFile {
  enemies: EnemyDef[];
}

const defs = new Map<string, EnemyDef>();
for (const e of (enemiesJson as unknown as EnemiesFile).enemies) defs.set(e.id, e);

export function getEnemyDef(id: string): EnemyDef | undefined {
  return defs.get(id);
}

export function allEnemyDefs(): EnemyDef[] {
  return [...defs.values()];
}
