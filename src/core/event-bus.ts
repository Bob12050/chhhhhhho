/**
 * Typed event bus for loose coupling between systems and UI. Avoids stringly
 * typed event names: keys live in the `GameEvents` map and payloads are typed.
 */
import type { SfxId } from '@/audio/sfx-defs';

export interface GameEvents {
  // Player / stats
  'player:hp-changed': { current: number; max: number };
  'player:mp-changed': { current: number; max: number };
  'player:exp-changed': { current: number; toNext: number; level: number };
  'player:level-up': { level: number; statPoints: number };
  'player:stats-recomputed': Record<string, never>;

  // Combat
  'combat:damage-dealt': { x: number; y: number; amount: number; crit: boolean };
  'enemy:died': { enemyId: string; x: number; y: number };

  // Loot / inventory
  'loot:dropped': { itemId: string; x: number; y: number };
  'inventory:changed': Record<string, never>;
  'item:picked-up': { itemId: string; quantity: number };
  'item:used': { itemId: string };

  // UI requests (from HUD overlay to the world scene)
  'ui:open-inventory': Record<string, never>;
  'ui:open-debug': Record<string, never>;
  'ui:open-map': Record<string, never>;
  'debug:warp': Record<string, never>;
  'map:travel': Record<string, never>;
  /** Fired when a map finishes building; drives the town-mode HUD and minimap. */
  'world:map-ready': {
    safe: boolean;
    mapId: string;
    mapName: string;
    mapWidth: number;
    mapHeight: number;
    playerX: number;
    playerY: number;
  };
  /** Throttled world position for the HUD minimap marker. */
  'world:player-position': { mapId: string; x: number; y: number };

  // Equipment
  'equipment:changed': { slot: string };

  // Economy / crafting
  'gold:changed': { current: number };
  'craft:made': { recipeId: string };

  // Skills
  'skill:learned': { skillId: string };
  /** A skill in `slot` (0/1) went on cooldown for `duration` ms. */
  'skill:cooldown': { slot: number; duration: number };

  // Jobs
  'job:changed': { jobId: string };

  // Quests (accepted / progressed / turned in)
  'quest:changed': Record<string, never>;

  /** Boss HP bar shown/hidden — the HUD quest tracker yields its slot. */
  'boss:bar': { active: boolean };
  /** Cinematic hunt intro shown above HUD controls when a boss appears. */
  'boss:intro': { questName: string; bossName: string; rank?: number; veteran?: boolean; weakness?: string; durationMs: number };

  // Pets
  'pet:changed': { petId: string | null };

  // Game flow (title / save-select)
  'game:new': { slot: number };
  'game:load': { slot: number };
  'game:return-to-title': Record<string, never>;

  // Save
  'save:written': { slot: number };
  'save:loaded': { slot: number };

  // PWA
  'pwa:update-available': Record<string, never>;

  // Orientation / lifecycle
  'app:orientation-blocked': { blocked: boolean };
  'app:visibility-hidden': Record<string, never>;

  // Audio: request a one-shot sound effect (handled by the SoundEngine).
  'sfx:play': { id: SfxId };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private readonly handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  off<K extends keyof GameEvents>(event: K, handler: Handler<GameEvents[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of set) (h as Handler<GameEvents[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

/** Global bus instance. Kept tiny and explicit (not an Autoload zoo). */
export const bus = new EventBus();
