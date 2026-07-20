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
import { syncInvestigationQuests } from '@/endgame/investigations';
import { generateInvestigationEquipment } from '@/endgame/investigation-loot';
import { getEquipment } from '@/data/items';
import { getEnemyDef } from '@/enemies/enemy-defs';
import type { CharacterGender } from '@/player/character-gender';

export interface TestHooks {
  activeScenes(): string[];
  /** Read a scroll controller position for gesture regression tests. */
  sceneScroll(sceneKey: string): {
    x: number;
    y: number;
    max: number;
    dragged: boolean;
    viewTop: number;
    viewBottom: number;
    width: number;
    height: number;
  } | null;
  textureSize(key: string): { width: number; height: number } | null;
  /** Activate an interactive text control without relying on font-dependent coordinates. */
  activateText(sceneKey: string, label: string): boolean;
  /** Read rendered labels for focused scene-state assertions. */
  sceneTexts(sceneKey: string): string[];
  /** Open the real quest board while keeping the world paused behind it. */
  openQuestBoard(): boolean;
  snapshot(): {
    playerName: string;
    level: number;
    hp: number;
    maxHp: number;
    gold: number;
    mapId: string;
    jobId: string;
    gender: CharacterGender;
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
  /** Register one bestiary discovery without spawning combat (visual QA only). */
  discoverEnemy(enemyId: string): boolean;
  /** Visual QA only: bypass unlock requirements and swap the active job look. */
  forceJob(id: string): boolean;
  /** Visual QA only: switch the selected character variant. */
  forceGender(gender: CharacterGender): void;
  /** Warp to a map's default spawn (or x/y) via the real travel path. */
  warp(mapId: string, x?: number, y?: number): boolean;
  /** Run the real defeat flow so respawn/input recovery can be regression-tested. */
  forceDefeat(): boolean;
  /** Test setup: remove random combat egg drops before a deterministic hatch scenario. */
  clearPetEggs(): void;
  addEgg(petItemId: string): boolean;
  addMaterial(id: string, qty: number): void;
  addGold(amount: number): void;
  /** Grant owned (unequipped) equipment pieces (inventory-UI tests). */
  addEquipment(id: string, qty?: number): void;
  /** Equip a known item through the real slot/stat/event path. */
  equip(id: string): boolean;
  /** Grant one deterministic investigation item for endgame UI tests. */
  grantInvestigationGear(): string | null;
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
    sceneScroll: (sceneKey: string) => {
      const scene = game.scene.getScene(sceneKey) as Phaser.Scene & {
        scrollX?: number;
        scrollY?: number;
        maxScroll?: number;
        dragged?: boolean;
        viewTop?: number;
        viewBottom?: number;
      };
      if (!scene?.scene.isActive()) return null;
      return {
        x: typeof scene.scrollX === 'number' ? scene.scrollX : 0,
        y: typeof scene.scrollY === 'number' ? scene.scrollY : 0,
        max: typeof scene.maxScroll === 'number' ? scene.maxScroll : 0,
        dragged: scene.dragged === true,
        viewTop: typeof scene.viewTop === 'number' ? scene.viewTop : 0,
        viewBottom: typeof scene.viewBottom === 'number' ? scene.viewBottom : scene.scale.height,
        width: scene.scale.width,
        height: scene.scale.height,
      };
    },
    textureSize: (key: string) => {
      if (!game.textures.exists(key)) return null;
      const source = game.textures.get(key).source[0];
      return source ? { width: source.width, height: source.height } : null;
    },
    activateText: (sceneKey: string, label: string) => {
      const scene = game.scene.getScene(sceneKey);
      if (!scene?.scene.isActive()) return false;
      const allObjects: Phaser.GameObjects.GameObject[] = [];
      const collect = [...scene.children.list];
      while (collect.length) {
        const object = collect.shift();
        if (!object) continue;
        allObjects.push(object);
        if ('list' in object && Array.isArray(object.list)) collect.push(...object.list);
      }
      const hasExactLabel = allObjects.some((object) => (
        object.type === 'Text'
        && 'text' in object
        && typeof object.text === 'string'
        && object.text.trim() === label
      ));
      const pending = scene.children.list.map((child) => ({
        child,
        interactiveAncestor: undefined as Phaser.GameObjects.GameObject | undefined,
      }));
      while (pending.length) {
        const entry = pending.shift();
        if (!entry) continue;
        const { child, interactiveAncestor } = entry;
        let interactive = child.input?.enabled ? child : interactiveAncestor;
        // Some controls keep their interactive frame and visible label as
        // same-position siblings (for example the title menu). Resolve that
        // frame too, so automation follows the labelled control instead of a
        // density-dependent screen coordinate.
        if (!interactive && 'getWorldTransformMatrix' in child) {
          const getMatrix = child.getWorldTransformMatrix;
          if (typeof getMatrix === 'function') {
            const point = getMatrix.call(child).transformPoint(0, 0);
            interactive = allObjects
              .filter((candidate) => candidate.input?.enabled)
              .sort((a, b) => ('depth' in b ? Number(b.depth) : 0) - ('depth' in a ? Number(a.depth) : 0))
              .find((candidate) => {
                if (!('getBounds' in candidate) || typeof candidate.getBounds !== 'function') return false;
                return candidate.getBounds().contains(point.x, point.y);
              });
          }
        }
        if (
          child.type === 'Text'
          && 'text' in child
          && typeof child.text === 'string'
          && (hasExactLabel ? child.text.trim() === label : child.text.includes(label))
          && interactive
        ) {
          interactive.emit('pointerdown');
          interactive.emit('pointerup');
          return true;
        }
        if ('list' in child && Array.isArray(child.list)) {
          pending.push(...child.list.map((nested) => ({
            child: nested,
            interactiveAncestor: interactive,
          })));
        }
      }
      return false;
    },
    sceneTexts: (sceneKey: string) => {
      const scene = game.scene.getScene(sceneKey);
      if (!scene?.scene.isActive()) return [];
      const texts: string[] = [];
      const pending = [...scene.children.list];
      while (pending.length) {
        const child = pending.shift();
        if (!child) continue;
        if (child.type === 'Text' && 'text' in child && typeof child.text === 'string') {
          texts.push(child.text.trim());
        }
        if ('list' in child && Array.isArray(child.list)) pending.push(...child.list);
      }
      return texts.filter(Boolean);
    },
    openQuestBoard: () => {
      const world = game.scene.getScene('World');
      if (!world?.scene.isActive() || world.scene.isPaused()) return false;
      world.scene.pause();
      world.scene.launch('QuestBoard');
      return true;
    },
    snapshot: () => ({
      playerName: gameState.playerName,
      level: gameState.level,
      hp: gameState.hp,
      maxHp: gameState.derived.maxHp,
      gold: gameState.gold,
      mapId: gameState.mapId,
      jobId: gameState.jobId,
      gender: gameState.gender,
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
    discoverEnemy: (enemyId: string) => {
      if (!getEnemyDef(enemyId)) return false;
      gameState.addKill(enemyId);
      return true;
    },
    forceJob: (id: string) => {
      if (!getJob(id)) return false;
      gameState.jobId = id;
      bus.emit('job:changed', { jobId: id });
      return true;
    },
    forceGender: (gender: CharacterGender) => {
      gameState.gender = gender;
      bus.emit('job:changed', { jobId: gameState.jobId });
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
    forceDefeat: () => {
      const world = game.scene.getScene('World') as Phaser.Scene & {
        forceDefeatForTest?: () => boolean;
      };
      return world?.scene.isActive() && typeof world.forceDefeatForTest === 'function'
        ? world.forceDefeatForTest()
        : false;
    },
    clearPetEggs: () => {
      gameState.petEggs = {};
    },
    addEgg: (petItemId: string) => gameState.addEgg(petItemId),
    addMaterial: (id: string, qty: number) => gameState.addMaterial(id, qty),
    addGold: (amount: number) => gameState.addGold(amount),
    addEquipment: (id: string, qty = 1) => {
      for (let i = 0; i < qty; i++) gameState.addEquipment(id);
    },
    equip: (id: string) => {
      const def = getEquipment(id);
      if (!def || !gameState.canEquip(id)) return false;
      gameState.equip(def.slot, id);
      return gameState.equipment[def.slot] === id;
    },
    grantInvestigationGear: () => {
      gameState.level = Math.max(99, gameState.level);
      gameState.jobId = 'aramikagura';
      gameState.flags['main_story_complete'] = true;
      const [quest] = syncInvestigationQuests(gameState);
      if (!quest) return null;
      const def = generateInvestigationEquipment(gameState, quest);
      if (!gameState.addGeneratedEquipment(def)) return null;
      gameState.recompute();
      return def.id;
    },
    flushSave: () => saveManager.write(gameState.toSave(gameState.slot)),
  };
  (window as unknown as { __test: TestHooks }).__test = hooks;
}
