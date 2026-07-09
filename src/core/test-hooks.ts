/**
 * Debug-gated automation hooks (`window.__test`). Installed ONLY when the
 * debug flag is on (?debug=1 / DEV) so the E2E smoke suite can assert real
 * game state and set up scenarios against PRODUCTION builds, where module
 * imports aren't reachable from the page. Players never get this object.
 */
import { gameState } from '@/player/game-state';
import { acceptQuest, isComplete, turnInQuest } from '@/quests/quests';
import { getMap, spawnPoint } from '@/maps/map-def';
import { bus } from '@/core/event-bus';
import { totalExpForLevel } from '@/stats/leveling';
import { isDebugEnabled } from '@/core/debug';
import { saveManager } from '@/save/save-manager';

export interface TestHooks {
  snapshot(): {
    level: number;
    hp: number;
    maxHp: number;
    gold: number;
    mapId: string;
    activeQuests: string[];
    completedQuests: string[];
    materials: Record<string, number>;
    equipmentOwned: string[];
    equipment: Record<string, string | null>;
    ownedPets: string[];
    activePetId: string | null;
    petEggs: Record<string, number>;
    petExp: Record<string, number>;
    killCounts: Record<string, number>;
  };
  /** Level up + pump VIT/STR (fight-capable test player). */
  powerUp(level: number): void;
  /** Accept a quest (availability rules apply). */
  acceptQuest(id: string): boolean;
  isQuestComplete(id: string): boolean;
  turnInQuest(id: string): boolean;
  /** Warp to a map's default spawn (or x/y) via the real travel path. */
  warp(mapId: string, x?: number, y?: number): boolean;
  addEgg(petItemId: string): boolean;
  addMaterial(id: string, qty: number): void;
  addGold(amount: number): void;
  /** Persist the current state to the active slot (reload-survival tests). */
  flushSave(): Promise<void>;
}

export function installTestHooks(): void {
  if (!isDebugEnabled()) return;
  const hooks: TestHooks = {
    snapshot: () => ({
      level: gameState.level,
      hp: gameState.hp,
      maxHp: gameState.derived.maxHp,
      gold: gameState.gold,
      mapId: gameState.mapId,
      activeQuests: [...gameState.activeQuests],
      completedQuests: [...gameState.completedQuests],
      materials: { ...gameState.materials },
      equipmentOwned: [...gameState.equipmentOwned],
      equipment: { ...gameState.equipment },
      ownedPets: [...gameState.ownedPets],
      activePetId: gameState.activePetId,
      petEggs: { ...gameState.petEggs },
      petExp: { ...gameState.petExp },
      killCounts: { ...gameState.killCounts },
    }),
    powerUp: (level: number) => {
      gameState.gainExp(Math.max(0, totalExpForLevel(level)));
      gameState.allocateStat('VIT', Math.floor(gameState.statPoints / 2));
      gameState.allocateStat('STR', gameState.statPoints);
      gameState.fullHeal();
    },
    acceptQuest: (id: string) => acceptQuest(gameState, id),
    isQuestComplete: (id: string) => isComplete(gameState, id),
    turnInQuest: (id: string) => turnInQuest(gameState, id),
    warp: (mapId: string, x?: number, y?: number) => {
      const m = getMap(mapId);
      if (!m) return false;
      const sp = spawnPoint(m, 'default');
      gameState.mapId = mapId;
      gameState.x = x ?? sp.x;
      gameState.y = y ?? sp.y;
      bus.emit('map:travel', {});
      return true;
    },
    addEgg: (petItemId: string) => gameState.addEgg(petItemId),
    addMaterial: (id: string, qty: number) => gameState.addMaterial(id, qty),
    addGold: (amount: number) => gameState.addGold(amount),
    flushSave: () => saveManager.write(gameState.toSave(gameState.slot)),
  };
  (window as unknown as { __test: TestHooks }).__test = hooks;
}
