/**
 * Debug-gated automation hooks (`window.__test`). Installed ONLY when the
 * debug flag is on (?debug=1 / localStorage.debug) so the E2E smoke suite can assert real
 * game state and set up scenarios against PRODUCTION builds, where module
 * imports aren't reachable from the page. Players never get this object.
 */
import type Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getJob } from '@/jobs/job-defs';
import { acceptQuest, isComplete, turnInQuest, recordKill } from '@/quests/quests';
import { getMap, spawnPoint } from '@/maps/map-def';
import { bus, type GameEvents } from '@/core/event-bus';
import { totalExpForLevel } from '@/stats/leveling';
import { isDebugEnabled } from '@/core/debug';
import { saveManager } from '@/save/save-manager';

export interface TestHooks {
  activeScenes(): string[];
  textureSize(key: string): { width: number; height: number } | null;
  /** Activate an interactive text control without relying on font-dependent coordinates. */
  activateText(sceneKey: string, label: string): boolean;
  snapshot(): {
    level: number;
    hp: number;
    maxHp: number;
    gold: number;
    mapId: string;
    jobId: string;
    x: number;
    y: number;
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
    questGuide: GameEvents['quest:guide'] | null;
    combatTarget: GameEvents['combat:target'] | null;
    questProgress: GameEvents['quest:progress'] | null;
  };
  /** Level up + pump VIT/STR (fight-capable test player). */
  powerUp(level: number): void;
  /** Accept a quest (availability rules apply). */
  acceptQuest(id: string): boolean;
  isQuestComplete(id: string): boolean;
  turnInQuest(id: string): boolean;
  /** Credit a kill toward active quests without fighting (E2E scenario setup). */
  recordKill(enemyId: string): void;
  /** Visual QA only: bypass unlock requirements and swap the active job look. */
  forceJob(id: string): boolean;
  /** Warp to a map's default spawn (or x/y) via the real travel path. */
  warp(mapId: string, x?: number, y?: number): boolean;
  addEgg(petItemId: string): boolean;
  addMaterial(id: string, qty: number): void;
  addGold(amount: number): void;
  /** Grant owned (unequipped) equipment pieces (inventory-UI tests). */
  addEquipment(id: string, qty?: number): void;
  /** Persist the current state to the active slot (reload-survival tests). */
  flushSave(): Promise<void>;
}

export function installTestHooks(game: Phaser.Game): void {
  if (!isDebugEnabled()) return;
  let worldPosition = { x: gameState.x, y: gameState.y };
  let questGuide: GameEvents['quest:guide'] | null = null;
  let combatTarget: GameEvents['combat:target'] | null = null;
  let questProgress: GameEvents['quest:progress'] | null = null;
  bus.on('world:player-position', ({ x, y }) => {
    worldPosition = { x, y };
  });
  bus.on('quest:guide', (guide) => {
    questGuide = guide;
  });
  bus.on('combat:target', (target) => {
    combatTarget = target;
  });
  bus.on('quest:progress', (progress) => {
    questProgress = progress;
  });
  const hooks: TestHooks = {
    activeScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
    textureSize: (key: string) => {
      if (!game.textures.exists(key)) return null;
      const source = game.textures.get(key).source[0];
      return source ? { width: source.width, height: source.height } : null;
    },
    activateText: (sceneKey: string, label: string) => {
      const scene = game.scene.getScene(sceneKey);
      if (!scene?.scene.isActive()) return false;
      const pending = [...scene.children.list];
      while (pending.length) {
        const child = pending.shift();
        if (!child) continue;
        if (
          child.type === 'Text'
          && 'text' in child
          && typeof child.text === 'string'
          && child.text.includes(label)
          && child.input?.enabled
        ) {
          child.emit('pointerup');
          return true;
        }
        if ('list' in child && Array.isArray(child.list)) pending.push(...child.list);
      }
      return false;
    },
    snapshot: () => ({
      level: gameState.level,
      hp: gameState.hp,
      maxHp: gameState.derived.maxHp,
      gold: gameState.gold,
      mapId: gameState.mapId,
      jobId: gameState.jobId,
      x: worldPosition.x,
      y: worldPosition.y,
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
      questGuide: questGuide ? { ...questGuide } : null,
      combatTarget: combatTarget ? { ...combatTarget } : null,
      questProgress: questProgress ? { ...questProgress } : null,
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
    recordKill: (enemyId: string) => {
      recordKill(gameState, enemyId);
    },
    forceJob: (id: string) => {
      if (!getJob(id)) return false;
      gameState.jobId = id;
      bus.emit('job:changed', { jobId: id });
      return true;
    },
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
    addEquipment: (id: string, qty = 1) => {
      for (let i = 0; i < qty; i++) gameState.addEquipment(id);
    },
    flushSave: () => saveManager.write(gameState.toSave(gameState.slot)),
  };
  (window as unknown as { __test: TestHooks }).__test = hooks;
}
