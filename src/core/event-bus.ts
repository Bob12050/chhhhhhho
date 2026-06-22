/**
 * Typed event bus for loose coupling between systems and UI. Avoids stringly
 * typed event names: keys live in the `GameEvents` map and payloads are typed.
 */

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

  // Equipment
  'equipment:changed': { slot: string };

  // Save
  'save:written': { slot: number };
  'save:loaded': { slot: number };

  // PWA
  'pwa:update-available': Record<string, never>;

  // Orientation / lifecycle
  'app:orientation-blocked': { blocked: boolean };
  'app:visibility-hidden': Record<string, never>;
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
