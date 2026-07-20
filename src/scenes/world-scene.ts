import Phaser from 'phaser';
import { renderZoom } from '@/core/render-density';
import { Player } from '@/player/player';
import { Enemy } from '@/enemies/enemy';
import { getEnemyDef, type EnemyDef } from '@/enemies/enemy-defs';
import { BossBrain, type Arena } from '@/enemies/boss-brain';
import { DamageNumbers } from '@/combat/damage-numbers';
import { gameState } from '@/player/game-state';
import { getEquipment, getConsumable, getMaterial, getPetItem, itemDisplayName } from '@/data/items';
import { rarityColor, rarityColorHex, rarityRank } from '@/data/rarity';
import { Pet } from '@/pets/pet';
import { getPet } from '@/pets/pet-defs';
import { TEX } from '@/assets/gen/textures';
import { Rng } from '@/core/rng';
import { getDropTable, rollDrops } from '@/loot/drop-table';
import { getBossRareExchangeForDropTable } from '@/crafting/boss-rare-exchange';
import { getSkill } from '@/skills/skill-defs';
import {
  abandonQuest,
  isComplete,
  objectiveProgress,
  reconcileHuntAttempts,
  recordKill,
  turnInQuest,
} from '@/quests/quests';
import { getQuest, type QuestDef } from '@/quests/quest-defs';
import {
  currentWave,
  concurrentSpawnCount,
  huntStatModifiers,
  VETERAN_MODS,
} from '@/quests/hunt-logic';
import { PET_EXP_SHARE, petAttackDamage } from '@/pets/pet-growth';
import { mitigateDamage } from '@/combat/mitigation';
import { BossStaggerMeter } from '@/combat/boss-stagger';
import { circleIntersectsLane } from '@/combat/lane-hit';
import { input } from '@/input/input-state';
import { bus, type GameEvents } from '@/core/event-bus';
import { saveManager } from '@/save/save-manager';
import { getMap, spawnPoint, type MapDef } from '@/maps/map-def';
import { buildMap, type BuiltPortal } from '@/maps/map-builder';
import type { UIScene } from '@/scenes/ui-scene';
import type { Direction } from '@/config/layers';
import { directionFromVector, directionVector } from '@/config/directions';
import { FONT, ninePanel } from '@/ui/theme';
import { npcHintFor, npcHintFlag } from '@/tutorial/tutorial-defs';
import { bgm, bgmForMap } from '@/audio/bgm-engine';
import { craftableEquipmentIds, type QuestResultData, type QuestResultItem } from '@/scenes/quest-result-scene';
import {
  INTRO_ACCEPTED_FLAG,
  INTRO_PENDING_FLAG,
  INTRO_QUEST_ID,
} from '@/tutorial/onboarding';
import {
  elementMultiplier,
  statusFromElement,
  elementColorHex,
  ELEMENT_COLOR,
  STATUS_CATEGORY,
  STATUS_PROC_CHANCE,
  isElement,
  type Element,
} from '@/combat/elements';
import { activeBossSetCombat } from '@/equipment/boss-set-bonuses';
import {
  getInvestigationCondition,
  type InvestigationConditionDef,
} from '@/endgame/investigation-conditions';

interface BuiltNpc {
  x: number;
  y: number;
  action?: string;
  dialogueId?: string;
}

/** Delay before a defeated normal enemy respawns at its post (farmability). */
const RESPAWN_MS = 8000;
const LOOT_PICKUP_RADIUS = 42;
const LOOT_MAGNET_RADIUS = 150;
const LOOT_MAGNET_SPEED = 260;
const NORMAL_ENEMY_VISUAL_SCALE = 0.9;
const NORMAL_ENEMY_SEPARATION = 28;

/**
 * Generic world scene: renders whichever map `gameState.mapId` points at,
 * spawns its enemies/NPCs, and handles movement, combat, one skill, loot,
 * portals (map transitions), interaction, and auto-save. Map content is fully
 * data-driven (`src/data/defs/maps/*.json`).
 */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private enemyTypes = new Map<Enemy, string>();
  /** Alive hunt-wave spawns → their enemyId (drives 連続狩猟 top-ups). */
  private huntLive = new Map<Enemy, string>();
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private loot!: Phaser.Physics.Arcade.Group;
  private dmg!: DamageNumbers;
  private ui!: UIScene;

  private map!: MapDef;
  private portals: BuiltPortal[] = [];
  private npcs: BuiltNpc[] = [];
  private npcSprites: Phaser.Physics.Arcade.Image[] = [];
  private activeNpc: BuiltNpc | null = null;

  private playerInvuln = 0;
  private playerDead = false;
  private skillCd: number[] = [0, 0];
  private dodgeCd = 0;
  private autoSaveTimer = 0;
  private mpRegenTimer = 0;
  private portalLock = 0; // ms; blocks portal re-trigger right after arrival
  private portalHintCd = 0; // ms; throttles the "defeat the boss" hint
  private portalGuard = 0; // ms; blocks walk-on portals right after taking a hit
  private bossIntroLockMs = 0;
  private hudPositionTimer = 0;
  private questGuideTimer = 0;
  private lastQuestGuideKey = '';
  private transitioning = false;
  private npcBob = false;
  private busOff: Array<() => void> = [];
  private rng = new Rng();
  private pet: Pet | null = null;
  private boss: Enemy | null = null;
  private bossBrain: BossBrain | null = null;
  private investigationCondition: InvestigationConditionDef | null = null;
  private investigationConditionTimerMs = 0;
  private investigationFrenzy = false;
  /** Pooled enemy projectiles (mobile-perf rule: projectiles use a pool). */
  private bullets: { obj: Phaser.GameObjects.Arc; vx: number; vy: number; ttl: number; damage: number }[] = [];
  private bulletPool: Phaser.GameObjects.Arc[] = [];
  /** Live boss warning art. Cleared immediately when combat ends or the player falls. */
  private bossWarnings = new Set<Phaser.GameObjects.GameObject>();
  /** Player skill projectiles (pooled). */
  private pBolts: { obj: Phaser.GameObjects.Arc; vx: number; vy: number; ttl: number; atk: number; mult: number; element: Element; skill: boolean }[] = [];
  private pBoltPool: Phaser.GameObjects.Arc[] = [];
  private minions: Enemy[] = [];
  private bossMaxHp = 0;
  private bossStagger: BossStaggerMeter | null = null;
  private baseCameraZoom = 1;
  private petAtkCd = 0;
  private bossBar: {
    root: Phaser.GameObjects.Container;
    hpFill: Phaser.GameObjects.Rectangle;
    hpText: Phaser.GameObjects.Text;
    phaseLabel: Phaser.GameObjects.Text;
    staggerFill: Phaser.GameObjects.Rectangle | null;
    staggerLabel: Phaser.GameObjects.Text | null;
  } | null = null;
  private combatTarget: Enemy | null = null;
  private combatTargetScanMs = 0;
  private combatTargetLockMs = 0;
  private lastCombatTargetKey = '';
  private combatTargetUi: {
    ring: Phaser.GameObjects.Ellipse;
    hpBg: Phaser.GameObjects.Rectangle;
    hpFill: Phaser.GameObjects.Rectangle;
    name: Phaser.GameObjects.Text;
  } | null = null;

  constructor() {
    super('World');
  }

  create(): void {
    // Reset per-session state (Phaser reuses the scene instance on restart).
    this.enemies = [];
    this.enemyTypes.clear();
    this.huntLive.clear();
    this.portals = [];
    this.npcs = [];
    this.npcSprites = [];
    this.activeNpc = null;
    this.playerInvuln = 0;
    this.playerDead = false;
    this.skillCd = [0, 0];
    this.autoSaveTimer = 0;
    this.mpRegenTimer = 0;
    this.portalLock = 600;
    this.portalHintCd = 0;
    this.portalGuard = 0;
    this.bossIntroLockMs = 0;
    this.hudPositionTimer = 0;
    this.questGuideTimer = 0;
    this.lastQuestGuideKey = '';
    this.petAtkCd = 0;
    this.transitioning = false;
    this.rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);
    this.pet = null;
    this.boss = null;
    this.bossMaxHp = 0;
    this.bossStagger = null;
    this.bossBar = null;
    this.combatTarget = null;
    this.combatTargetScanMs = 0;
    this.combatTargetLockMs = 0;
    this.lastCombatTargetKey = '';
    this.combatTargetUi = null;
    bus.emit('combat:target', { active: false });
    // Leaving an arena mid-fight must hand the HUD slot back to the tracker.
    bus.emit('boss:bar', { active: false });
    this.bossBrain = null;
    this.investigationCondition = null;
    this.investigationConditionTimerMs = 0;
    this.investigationFrenzy = false;
    this.bullets = [];
    this.bulletPool = [];
    this.bossWarnings.clear();
    this.pBolts = [];
    this.pBoltPool = [];
    this.minions = [];

    this.map = getMap(gameState.mapId) ?? getMap('town')!;
    const reconciledHunts = reconcileHuntAttempts(gameState, this.map.id);
    if (reconciledHunts.completed.length || reconciledHunts.abandoned.length) {
      void this.persist();
    }
    gameState.flags[`visited_${this.map.id}`] = true;
    bgm.play(bgmForMap(this.map.id));
    this.ui = this.scene.get('UI') as UIScene;
    this.ui.resetControls();
    this.ui.clearDefeated();
    this.ui.showInteract(false);

    this.physics.world.setBounds(0, 0, this.map.size.w, this.map.size.h);
    this.cameras.main.setBounds(0, 0, this.map.size.w, this.map.size.h);
    // Fractional base zoom makes every source pixel alternate between widths.
    // Keep ordinary exploration at 1:1; short boss zooms remain deliberate FX.
    this.baseCameraZoom = 1;
    this.cameras.main.setZoom(renderZoom(this.baseCameraZoom));
    this.cameras.main.roundPixels = true;

    const built = buildMap(this, this.map);
    this.obstacles = built.obstacles;
    this.portals = built.portals;
    if (this.map.ground === 'grass') this.addForestAtmosphere();

    // Ambient colour grade + corner vignette: cheap screen-space mood so zones
    // stop looking like the same flat-lit lawn (the title screen trick).
    if (this.map.ambient) {
      const c = Phaser.Display.Color.HexStringToColor(this.map.ambient.color).color;
      this.add
        .rectangle(0, 0, this.scale.width, this.scale.height, c, this.map.ambient.alpha)
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(7000);
    }
    const vg = this.add.graphics().setScrollFactor(0).setDepth(7001);
    const vw = this.scale.width;
    const vh = this.scale.height;
    for (let i = 0; i < 10; i++) {
      vg.lineStyle(3, 0x17385f, 0.032 * (1 - i / 10));
      vg.strokeRect(i * 3, i * 3, vw - i * 6, vh - i * 6);
    }

    // Map title flash.
    this.showMapName(this.map.name);

    // Player. Supported iron pieces use the aligned equipment-layer pilot;
    // every original fixed job sprite remains available through settings.
    // Map dimensions can change between releases; keep old saves inside the
    // current walkable world instead of spawning beyond a shortened edge.
    if (this.map.id === 'town' && !gameState.flags['town_wide_v1']) {
      const atCurrentSpawn = Object.values(this.map.spawns).some(
        ([x, y]) => Math.abs(gameState.x - x) < 2 && Math.abs(gameState.y - y) < 2,
      );
      if (!atCurrentSpawn) {
        gameState.x = 250 + (gameState.x - 180) * (this.map.size.w / 360);
        gameState.y *= this.map.size.h / 800;
      }
      gameState.flags['town_wide_v1'] = true;
    }
    // An earlier defeat return point sat beside the lower village bend. Rescue
    // saves left there once; the curved scenery makes it unreliable on mobile.
    if (this.map.id === 'town' && !gameState.flags['town_safe_respawn_v1']) {
      const nearLegacyRespawn =
        Phaser.Math.Distance.Between(gameState.x, gameState.y, 250, 850) <= 56;
      if (nearLegacyRespawn) {
        const safeSpawn = spawnPoint(this.map, 'respawn');
        gameState.x = safeSpawn.x;
        gameState.y = safeSpawn.y;
      }
      gameState.flags['town_safe_respawn_v1'] = true;
    }
    // The plaza redesign moves every facility to the perimeter. Start old town
    // saves once from the new open center so nobody inherits a position beside
    // a shop facade, canal edge, or planter collider.
    if (this.map.id === 'town' && !gameState.flags['town_pixel_plaza_v1']) {
      const plazaSpawn = spawnPoint(this.map, 'default');
      gameState.x = plazaSpawn.x;
      gameState.y = plazaSpawn.y;
      gameState.flags['town_pixel_plaza_v1'] = true;
    }
    // The original field was 360x1280. Saves parked near its lower gate would
    // otherwise clamp into the wide map's lower-left scenery after the resize.
    if (this.map.id === 'field' && gameState.y >= this.map.size.h - 32) {
      const entry = spawnPoint(this.map, 'from_town');
      gameState.x = Phaser.Math.Clamp(gameState.x * (this.map.size.w / 360), 56, this.map.size.w - 56);
      gameState.y = entry.y;
    }
    // The original forest was a narrow 360x1024 corridor. Its coordinates do
    // not map cleanly onto the new looped grove, so place old saves at the new
    // entrance once instead of letting them spawn inside a painted tree.
    if (this.map.id === 'forest' && !gameState.flags['forest_wide_v1']) {
      const entry = spawnPoint(this.map, 'from_field');
      gameState.x = entry.x;
      gameState.y = entry.y;
      gameState.flags['forest_wide_v1'] = true;
    }
    // The old cave used a 360x1280 corridor. Preserve a freshly selected
    // portal spawn, but move an old in-cave save to the new grassland entrance.
    if (this.map.id === 'dungeon' && !gameState.flags['dungeon_wide_v1']) {
      const atCurrentSpawn = Object.values(this.map.spawns).some(
        ([x, y]) => Math.abs(gameState.x - x) < 2 && Math.abs(gameState.y - y) < 2,
      );
      if (!atCurrentSpawn) {
        const entry = spawnPoint(this.map, 'from_field');
        gameState.x = entry.x;
        gameState.y = entry.y;
      }
      gameState.flags['dungeon_wide_v1'] = true;
    }
    // The old canyon was a narrow 360x1152 trail. Keep portal arrivals at
    // their new entrances, while moving an old mid-canyon save to the cave.
    if (this.map.id === 'canyon' && !gameState.flags['canyon_wide_v1']) {
      const atCurrentSpawn = Object.values(this.map.spawns).some(
        ([x, y]) => Math.abs(gameState.x - x) < 2 && Math.abs(gameState.y - y) < 2,
      );
      if (!atCurrentSpawn) {
        const entry = spawnPoint(this.map, 'from_dungeon');
        gameState.x = entry.x;
        gameState.y = entry.y;
      }
      gameState.flags['canyon_wide_v1'] = true;
    }
    // The old volcano was a narrow 360x1280 route. Preserve fresh portal
    // arrivals, while returning old mid-map saves to the canyon entrance.
    if (this.map.id === 'volcano' && !gameState.flags['volcano_wide_v1']) {
      const atCurrentSpawn = Object.values(this.map.spawns).some(
        ([x, y]) => Math.abs(gameState.x - x) < 2 && Math.abs(gameState.y - y) < 2,
      );
      if (!atCurrentSpawn) {
        const entry = spawnPoint(this.map, 'from_canyon');
        gameState.x = entry.x;
        gameState.y = entry.y;
      }
      gameState.flags['volcano_wide_v1'] = true;
    }
    // The old snowfield was a narrow 360x1152 path. Keep new portal arrivals,
    // while returning old mid-map saves to the warm volcanic entrance.
    if (this.map.id === 'snowfield' && !gameState.flags['snowfield_wide_v1']) {
      const atCurrentSpawn = Object.values(this.map.spawns).some(
        ([x, y]) => Math.abs(gameState.x - x) < 2 && Math.abs(gameState.y - y) < 2,
      );
      if (!atCurrentSpawn) {
        const entry = spawnPoint(this.map, 'from_volcano');
        gameState.x = entry.x;
        gameState.y = entry.y;
      }
      gameState.flags['snowfield_wide_v1'] = true;
    }
    // The old desert was a narrow 360x1280 trail. Preserve new portal arrivals,
    // while moving old in-desert saves to the snowy southern gate.
    if (this.map.id === 'desert' && !gameState.flags['desert_wide_v1']) {
      const atCurrentSpawn = Object.values(this.map.spawns).some(
        ([x, y]) => Math.abs(gameState.x - x) < 2 && Math.abs(gameState.y - y) < 2,
      );
      if (!atCurrentSpawn) {
        const entry = spawnPoint(this.map, 'from_snowfield');
        gameState.x = entry.x;
        gameState.y = entry.y;
      }
      gameState.flags['desert_wide_v1'] = true;
    }
    gameState.x = Phaser.Math.Clamp(gameState.x, 24, this.map.size.w - 24);
    gameState.y = Phaser.Math.Clamp(gameState.y, 32, this.map.size.h - 32);
    const savedInsideScenery = [
      ...(this.map.buildings ?? []).map((b) => [b.x, b.y, b.w, b.h] as const),
      ...(this.map.collisionRects ?? []),
    ].some(([x, y, w, h]) =>
      Phaser.Geom.Rectangle.Contains(new Phaser.Geom.Rectangle(x - 12, y - 12, w + 24, h + 24), gameState.x, gameState.y),
    );
    if (savedInsideScenery) {
      const safeSpawn = spawnPoint(this.map, 'default');
      gameState.x = safeSpawn.x;
      gameState.y = safeSpawn.y;
    }
    this.player = new Player(this, gameState.x, gameState.y);
    this.player.setJobAppearance(gameState.jobId);
    this.player.setMoveSpeed(gameState.derived.moveSpeed);
    this.player.setAtkSpeed(gameState.derived.atkSpeed);
    this.player.onAttackHit = (dir) => {
      this.spawnSlash(dir);
      bus.emit('sfx:play', { id: 'attack' });
      this.resolveMelee(dir, 1.0, 18, 30, 34, gameState.derived.physAtk, this.weaponElement());
    };
    this.cameras.main.startFollow(this.player.body, true, 0.15, 0.15);
    this.physics.add.collider(this.player.body, this.obstacles);
    // Tell the persistent HUD about the new zone only once the player exists,
    // so map-aware HUD systems receive the spawn position immediately.
    bus.emit('world:map-ready', {
      safe: !!this.map.safe,
      mapId: this.map.id,
      mapName: this.map.name,
      mapWidth: this.map.size.w,
      mapHeight: this.map.size.h,
      playerX: this.player.x,
      playerY: this.player.y,
    });

    // Combat / loot.
    this.dmg = new DamageNumbers(this);
    this.loot = this.physics.add.group();
    this.physics.add.overlap(this.player.body, this.loot, (_p, l) =>
      this.pickup(l as Phaser.Physics.Arcade.Image),
    );

    for (const e of this.map.enemies ?? []) this.spawnEnemy(e.type, e.x, e.y);
    this.spawnHuntTargets();
    for (const n of this.map.npcs ?? [])
      this.spawnNpc(n.x, n.y, n.label, n.action, n.dialogueId, n.nameplateOffsetY);
    this.spawnPetIfAny();

    // Idle bob: NPCs shift 1px every ~700ms (integer steps only — rule 3).
    // A static crowd reads as mannequins; this tiny motion reads as "people".
    this.time.addEvent({
      delay: 700,
      loop: true,
      callback: () => {
        this.npcBob = !this.npcBob;
        for (const [i, s] of this.npcSprites.entries()) {
          if (!s.active) continue;
          s.setY(s.y + ((i + (this.npcBob ? 1 : 0)) % 2 === 0 ? -1 : 1));
        }
      },
    });

    // Wind streaks drifting across grass maps (subtle life for the meadow).
    if (this.map.ground === 'grass') {
      for (let i = 0; i < 4; i++) {
        const sy = Math.round((this.map.size.h / 5) * (i + 1));
        const streak = this.add
          .rectangle(-30, sy, 14, 2, 0xd8f0c0, 0.16)
          .setDepth(3);
        this.tweens.add({
          targets: streak,
          x: this.map.size.w + 30,
          y: sy + 20,
          duration: 5200 + i * 900,
          delay: i * 1300,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
    }

    // Listeners (unsubscribed on shutdown to avoid accumulation on re-entry).
    this.busOff.push(
      bus.on('equipment:changed', () => {
        this.player.setMoveSpeed(gameState.derived.moveSpeed);
        this.player.setAtkSpeed(gameState.derived.atkSpeed);
      }),
    );
    this.busOff.push(
      bus.on('job:changed', () => {
        this.player.setJobAppearance(gameState.jobId);
        this.player.setMoveSpeed(gameState.derived.moveSpeed);
        this.player.setAtkSpeed(gameState.derived.atkSpeed);
      }),
    );
    this.busOff.push(
      bus.on('player:stats-recomputed', () => {
        // Stat allocation (DEX) can change move/attack speed mid-session.
        this.player.setMoveSpeed(gameState.derived.moveSpeed);
        this.player.setAtkSpeed(gameState.derived.atkSpeed);
      }),
    );
    this.busOff.push(bus.on('app:visibility-hidden', () => void this.save()));
    this.busOff.push(
      bus.on('save:written', ({ slot }) => {
        if (slot === -1) void this.save();
      }),
    );
    this.busOff.push(bus.on('ui:open-inventory', () => this.openInventory()));
    this.busOff.push(bus.on('ui:open-debug', () => this.openMenu('Debug')));
    this.busOff.push(bus.on('ui:open-map', () => this.openMenu('MapSelect')));
    this.busOff.push(bus.on('debug:warp', () => this.transitionRestart(true)));
    this.busOff.push(
      bus.on('debug:boss-phase', () => {
        if (!this.boss || this.boss.isDead() || !this.bossBrain) return;
        this.boss.hp = Math.max(1, Math.floor(this.boss.cfg.maxHp * 0.34));
        this.playerInvuln = Math.max(this.playerInvuln, 5000);
      }),
    );
    this.busOff.push(bus.on('player:level-up', ({ level }) => this.onLevelUp(level)));
    this.busOff.push(bus.on('map:travel', () => this.transitionRestart(true)));
    // Live pet swap (pet screen): replace the follower sprite in place.
    this.busOff.push(
      bus.on('pet:changed', () => {
        this.pet?.destroy();
        this.pet = null;
        this.spawnPetIfAny();
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.clearBossWarnings();
      for (const off of this.busOff) off();
      this.busOff = [];
    });

    this.cameras.main.fadeIn(150);
    bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
    bus.emit('player:mp-changed', { current: gameState.mp, max: gameState.derived.maxMp });
    bus.emit('gold:changed', { current: gameState.gold });
    this.updateQuestGuide();

    // A brand-new slot begins with the village elder's request, not an
    // unexplained pre-accepted objective. The world is already visible behind
    // the dialogue, so this reads as an in-world handoff into play.
    if (
      this.map.id === 'town' &&
      gameState.flags[INTRO_PENDING_FLAG] &&
      !gameState.flags[INTRO_ACCEPTED_FLAG] &&
      !gameState.activeQuests.includes(INTRO_QUEST_ID) &&
      !gameState.completedQuests.includes(INTRO_QUEST_ID)
    ) {
      this.time.delayedCall(420, () => {
        if (this.scene.isActive() && !this.scene.isPaused()) {
          this.openMenu('Dialogue', { id: 'elder_intro' });
        }
      });
    }
  }

  private showMapName(name: string): void {
    const t = this.add
      .text(this.scale.width / 2, 118, name, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#fff0b8',
        backgroundColor: '#071523e6',
        padding: { x: 12, y: 5 },
        stroke: '#02060d',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8000);
    this.tweens.add({ targets: t, alpha: 0, delay: 1100, duration: 500, onComplete: () => t.destroy() });
  }

  /**
   * Monster-Hunter style hunts: ONE quest drives an arena per visit — with
   * several active hunts on the same map (e.g. 通常＋歴戦 of the same boss,
   * or two different bosses sharing an arena), spawning them all at once
   * stacked two bosses on one point, corrupted this.boss/bossBar tracking,
   * and let the 歴戦 quest complete off a normal-stat kill. Veteran quests
   * win the pick so the harder version is the one that spawns.
   */
  private currentHuntQuest(): QuestDef | null {
    let pick: QuestDef | null = null;
    for (const qid of gameState.activeQuests) {
      const q = getQuest(qid);
      if (!q || q.huntMap !== this.map.id || isComplete(gameState, qid)) continue;
      const priority = q.investigation ? 2 : q.veteran ? 1 : 0;
      const pickPriority = pick?.investigation ? 2 : pick?.veteran ? 1 : 0;
      if (!pick || priority > pickPriority) pick = q;
    }
    return pick;
  }

  private spawnHuntTargets(): void {
    const q = this.currentHuntQuest();
    if (q) this.spawnHuntWave(q, false);
  }

  /**
   * Spawn (or top up) the current wave of one hunt quest at the 'boss' point.
   * Bosses come solo; trash waves spawn up to 4 at once, spread out. Idempotent:
   * only fills the gap between alive hunt spawns and the wave's target count.
   */
  private spawnHuntWave(q: QuestDef, announce: boolean): void {
    const wave = currentWave(q, gameState.questProgress[q.id]);
    if (!wave) return;
    const def = getEnemyDef(wave.enemyId);
    if (!def) return;
    const want = concurrentSpawnCount(wave.remaining, !!def.isBoss);
    let alive = 0;
    for (const [e, id] of this.huntLive) {
      if (!e.isDead() && id === wave.enemyId) alive++;
    }
    if (alive >= want) return;
    const sp = spawnPoint(this.map, 'boss');
    const mods = huntStatModifiers(q);
    // Trash packs fan out around the spawn point so they don't stack.
    const spread: [number, number][] = [[0, 0], [-52, 26], [52, 26], [0, 58]];
    let spawnedBoss = false;
    for (let i = alive; i < want; i++) {
      const [ox, oy] = def.isBoss ? [0, 0] : spread[i % spread.length];
      const e = this.spawnEnemy(wave.enemyId, sp.x + ox, sp.y + oy, { respawn: false, ...mods });
      if (e) {
        this.huntLive.set(e, wave.enemyId);
        if (def.isBoss) spawnedBoss = true;
      }
    }
    if (spawnedBoss && def.isBoss) {
      this.activateInvestigationCondition(q);
      this.showBossIntro(q, def);
    } else if (announce) {
      const msg = def.isBoss
        ? `${q.veteran ? '歴戦の' : ''}${def.name} が現れた！`
        : '敵の群れが現れた！';
      this.floatText(sp.x, sp.y - 46, msg, '#ffb26b');
      bus.emit('sfx:play', { id: 'roar' });
    }
  }

  /** Sparse drifting leaves keep outdoor maps alive without covering combat. */
  private addForestAtmosphere(): void {
    this.time.addEvent({
      delay: 520,
      loop: true,
      callback: () => {
        if (!this.scene.isActive() || this.scene.isPaused()) return;
        const view = this.cameras.main.worldView;
        const x = view.x + this.rng.next() * view.width;
        const y = view.y - 6;
        const leaf = this.add
          .rectangle(x, y, 3, 1, this.rng.next() > 0.5 ? 0xe4d64f : 0x8fbf3f, 0.72)
          .setAngle(this.rng.next() * 90)
          .setDepth(7600);
        this.tweens.add({
          targets: leaf,
          x: x + 18 + this.rng.next() * 22,
          y: view.bottom + 10,
          angle: leaf.angle + 240,
          alpha: 0.08,
          duration: 4200 + this.rng.next() * 1800,
          ease: 'Sine.InOut',
          onComplete: () => leaf.destroy(),
        });
      },
    });
  }

  private showBossIntro(q: QuestDef, def: EnemyDef): void {
    const durationMs = 1650;
    const condition = q.investigation
      ? getInvestigationCondition(q.investigation.conditionId)
      : undefined;
    this.bossIntroLockMs = Math.max(this.bossIntroLockMs, durationMs);
    this.cameras.main.shake(260, 0.004);
    bus.emit('sfx:play', { id: 'roar' });
    bus.emit('boss:intro', {
      questName: q.name,
      bossName: `${q.veteran ? '歴戦の' : ''}${def.name}`,
      rank: q.rank,
      veteran: q.veteran,
      investigationThreat: q.investigation?.threat,
      investigationCondition: condition?.label,
      investigationRule: condition?.combatHint,
      weakness: def.weakness,
      durationMs,
    });
  }

  private activateInvestigationCondition(q: QuestDef): void {
    const condition = q.investigation
      ? getInvestigationCondition(q.investigation.conditionId)
      : null;
    this.investigationCondition = condition;
    this.investigationFrenzy = false;
    this.investigationConditionTimerMs = condition?.mechanic === 'resonance'
      ? condition.initialDelayMs
      : condition?.mechanic === 'regeneration'
        ? condition.intervalMs
        : 0;
  }

  /** Apply the contract rule independently of each boss's authored attack set. */
  private updateInvestigationCondition(delta: number): void {
    const boss = this.boss;
    const condition = this.investigationCondition;
    if (!boss || boss.isDead() || !condition || this.playerDead) return;

    if (condition.mechanic === 'frenzy') {
      const hpRate = Math.max(0, boss.hp) / boss.cfg.maxHp;
      if (!this.investigationFrenzy && hpRate <= condition.triggerHpRate) {
        this.investigationFrenzy = true;
        boss.enrageVisual(0xff6f55);
        this.floatText(boss.x, boss.y - 72, '攻撃性増大・猛攻', '#ff9a78');
        this.cameras.main.shake(180, 0.006);
        bus.emit('sfx:play', { id: 'roar' });
      }
      if (this.investigationFrenzy) {
        boss.speedMult = Math.max(boss.speedMult, condition.moveSpeedMult);
      }
      return;
    }

    this.investigationConditionTimerMs -= delta;
    if (this.investigationConditionTimerMs > 0) return;

    if (condition.mechanic === 'regeneration') {
      this.investigationConditionTimerMs += condition.intervalMs;
      const heal = Math.min(
        boss.cfg.maxHp - boss.hp,
        Math.max(1, Math.round(boss.cfg.maxHp * condition.healRate)),
      );
      if (heal <= 0) return;
      boss.hp += heal;
      this.dmg.show(boss.x, boss.y - 52, heal, false, '#70e59a');
      this.floatText(boss.x, boss.y - 76, '生命再生', '#9cf0ae');
      const aura = this.add
        .circle(boss.x, boss.y - 8, 24, 0x64e58a, 0.2)
        .setStrokeStyle(2, 0xa9ffc0, 0.9)
        .setDepth(9000);
      this.tweens.add({
        targets: aura,
        alpha: 0,
        scale: 1.8,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => aura.destroy(),
      });
      return;
    }

    if (this.bossBrain?.isBusy()) {
      this.investigationConditionTimerMs = 250;
      return;
    }
    this.investigationConditionTimerMs += condition.intervalMs;
    const x = boss.x;
    const y = boss.y;
    boss.castHold(condition.telegraphMs);
    this.bossBrain?.defer(condition.telegraphMs + 250);
    this.floatText(x, y - 72, '深層共鳴', '#9fe9ff');
    this.telegraphFx(x, y, condition.radius, condition.telegraphMs, 0x5fd6ee, () => {
      if (boss !== this.boss || boss.isDead() || this.playerDead) return;
      this.explodeAt(
        x,
        y,
        condition.radius,
        Math.max(1, Math.round(boss.cfg.contactDamage * condition.damageMult)),
        0x67dff2,
      );
    });
  }

  /**
   * After a hunt kill: if the quest's current objective finished but the quest
   * itself isn't done, spawn the next wave (short delay so the death reads).
   */
  private scheduleHuntWaves(): void {
    if (!this.currentHuntQuest()) return;
    this.time.delayedCall(900, () => {
      if (this.transitioning || !this.scene.isActive() || this.playerDead) return;
      // Re-pick at fire time: the driving quest may have completed and the
      // next active hunt (if any) takes over on re-entry, not mid-visit.
      const q = this.currentHuntQuest();
      if (q) this.spawnHuntWave(q, true);
    });
  }

  private spawnEnemy(
    type: string,
    x: number,
    y: number,
    opts?: { respawn?: boolean; hpMult?: number; dmgMult?: number; veteran?: boolean },
  ): Enemy | undefined {
    const def = getEnemyDef(type);
    if (!def) return undefined;
    const maxHp = Math.round(def.maxHp * (opts?.hpMult ?? 1));
    const contactDamage = Math.round(def.contactDamage * (opts?.dmgMult ?? 1));
    const enemy = new Enemy(this, x, y, {
      textureKey: def.textureKey,
      maxHp,
      moveSpeed: def.moveSpeed,
      contactDamage,
      aggroRange: def.aggroRange,
      // Ordinary melee sprites are roughly 48px wide. Stopping their feet a
      // little earlier keeps the actor, job plate and enemy HP plate readable
      // instead of letting every attacker stand inside the player artwork.
      attackRange: def.isBoss ? def.attackRange : Math.max(def.attackRange, 28),
      tint: def.tint ? Phaser.Display.Color.HexStringToColor(def.tint).color : undefined,
      scale: (def.scale ?? 1) * (def.isBoss ? 1 : NORMAL_ENEMY_VISUAL_SCALE),
      keepDistance: def.keepDistance,
      knockbackResist: def.knockbackResist,
      animSpeed: def.animSpeed,
      weakness: isElement(def.weakness) ? def.weakness : undefined,
      resist: isElement(def.resist) ? def.resist : undefined,
    });
    // DoT ticks show a green/red number and a small spark (juice + feedback).
    enemy.onStatusTick = (amount, sx, sy) => {
      this.dmg.show(sx, sy - 42, amount, false, '#9fe36a');
      bus.emit('combat:damage-dealt', { x: sx, y: sy, amount, crit: false });
    };
    // Attack-state strike: hits if the player is still within attackRange when
    // the windup lands. This is what lets keep-distance enemies deal damage at
    // all (contact is their only other damage path and they avoid contact).
    enemy.onAttackStrike = () => {
      if (enemy.isDead() || this.playerDead) return;
      const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      if (dist > enemy.cfg.attackRange + 14) return;
      // Ranged strikes get a zap beam so the hit reads at a distance.
      if (dist > 44) this.spawnZap(enemy.x, enemy.y - 20, this.player.x, this.player.y - 24);
      this.damagePlayer(enemy.cfg.contactDamage, enemy.x, enemy.y);
    };
    this.physics.add.collider(enemy.sprite, this.obstacles);
    this.physics.add.overlap(this.player.body, enemy.sprite, () => this.onContact(enemy));
    enemy.onDeath = (dx, dy) => {
      this.huntLive.delete(enemy);
      this.enemyTypes.delete(enemy);
      this.onEnemyDeath(dx, dy, def, opts?.veteran === true);
      // Normal enemies respawn at their post so zones stay farmable (needed for
      // the time-based progression budget). Bosses only return on re-entry.
      if (!def.isBoss && opts?.respawn !== false) {
        this.time.delayedCall(RESPAWN_MS, () => {
          if (!this.transitioning && this.scene.isActive() && !this.playerDead) {
            this.spawnEnemy(type, x, y);
          }
        });
      }
    };
    this.enemies.push(enemy);
    this.enemyTypes.set(enemy, type);
    if (def.isBoss) {
      this.boss = enemy;
      this.bossMaxHp = maxHp;
      this.bossStagger = def.stagger ? new BossStaggerMeter(def.stagger) : null;
      this.buildBossBar(`${opts?.veteran ? '歴戦の' : ''}${def.name}`, def);
      // Keep the portrait arena at 1:1. World-space HUD shares this camera, so
      // a persistent boss zoom also enlarged and shifted the boss card.
      this.cameras.main.setZoom(renderZoom(this.baseCameraZoom));
      if (def.attacks && def.attacks.length > 0) {
        this.bossBrain = new BossBrain(
          this.makeArena(enemy, def),
          def.attacks,
          contactDamage,
          def.enrageAtHpPct,
          def.phase,
        );
      }
    }
    return enemy;
  }

  /** Scene services handed to the (engine-independent) BossBrain. */
  private makeArena(boss: Enemy, def: EnemyDef): Arena {
    const color = (value: string | undefined, fallback: number): number =>
      value ? Phaser.Display.Color.HexStringToColor(value).color : fallback;
    const warningColor = color(def.bossStyle?.warningColor, 0xff5050);
    const impactColor = color(def.bossStyle?.impactColor, 0xffa050);
    const projectileColor = color(def.bossStyle?.projectileColor, 0xff8a5a);
    return {
      bossPos: () => ({ x: boss.x, y: boss.y }),
      playerPos: () => ({ x: this.player.x, y: this.player.y }),
      // cfg.maxHp, NOT def.maxHp: veteran spawns scale HP ×1.6 and the
      // enrage threshold must track the scaled pool or it fires too late.
      hpPct: () => Math.max(0, boss.hp) / boss.cfg.maxHp,
      telegraph: (x, y, r, ms, onDone) =>
        this.telegraphFx(x, y, r, ms, warningColor, onDone),
      telegraphCharge: (x, y, tx, ty, speed, durationMs, telegraphMs, onDone) =>
        this.chargeTelegraphFx(
          x,
          y,
          tx,
          ty,
          speed,
          durationMs,
          telegraphMs,
          warningColor,
          onDone,
        ),
      telegraphShots: (x, y, angles, ms, onDone) =>
        this.shotTelegraphFx(x, y, angles, ms, warningColor, onDone),
      telegraphRootLanes: (x, y, angles, length, width, ms, onDone) =>
        this.rootLaneTelegraphFx(x, y, angles, length, width, ms, onDone),
      strikeRootLanes: (x, y, angles, length, width, damage) => {
        if (!boss.isDead()) this.rootLaneStrikeFx(x, y, angles, length, width, damage);
      },
      explode: (x, y, r, dmg) => this.explodeAt(x, y, r, dmg, impactColor),
      hold: (ms) => boss.castHold(ms),
      dash: (x, y, speed, ms) => boss.beginDash(x, y, speed, ms),
      fireProjectile: (ang, speed, dmg) =>
        this.fireBullet(boss.x, boss.y - 24, ang, speed, dmg, projectileColor),
      summon: (id) => this.summonMinion(boss, id),
      minionCount: () => this.minions.filter((m) => !m.isDead()).length,
      setSpeedMult: (m) => {
        boss.speedMult = m;
      },
      onEnrage: () => this.onBossEnrage(boss, def),
      random: () => Math.random(),
    };
  }

  /** Warning circle that fills up over `ms`, then detonates via `onDone`. */
  private telegraphFx(
    x: number,
    y: number,
    radius: number,
    ms: number,
    color: number,
    onDone: () => void,
  ): void {
    const ring = this.trackBossWarning(this.add
      .circle(Math.round(x), Math.round(y), radius, color, 0.12)
      .setStrokeStyle(2, color, 0.95)
      .setDepth(6));
    const fill = this.trackBossWarning(this.add
      .circle(Math.round(x), Math.round(y), radius, color, 0.28)
      .setScale(0.06)
      .setDepth(6));
    this.tweens.add({ targets: fill, scale: 1, duration: ms, ease: 'Linear' });
    this.time.delayedCall(ms, () => {
      this.releaseBossWarnings(ring, fill);
      if (this.playerDead || this.transitioning || !this.scene.isActive()) return;
      onDone();
    });
  }

  /** Full charge lane, including the distance the boss will actually travel. */
  private chargeTelegraphFx(
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    speed: number,
    durationMs: number,
    telegraphMs: number,
    color: number,
    onDone: () => void,
  ): void {
    const angle = Math.atan2(targetY - y, targetX - x);
    const length = Math.max(64, (speed * durationMs) / 1000);
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;
    const lane = this.trackBossWarning(this.add
      .rectangle(x, y, length, 30, color, 0.12)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setStrokeStyle(2, color, 0.9)
      .setDepth(6));
    const fill = this.trackBossWarning(this.add
      .rectangle(x, y, length, 24, color, 0.3)
      .setOrigin(0, 0.5)
      .setRotation(angle)
      .setScale(0.04, 1)
      .setDepth(6));
    const end = this.trackBossWarning(this.add
      .circle(endX, endY, 16, color, 0.12)
      .setStrokeStyle(2, color, 0.9)
      .setDepth(6));
    this.tweens.add({ targets: fill, scaleX: 1, duration: telegraphMs, ease: 'Linear' });
    this.time.delayedCall(telegraphMs, () => {
      this.releaseBossWarnings(lane, fill, end);
      if (this.playerDead || this.transitioning || !this.scene.isActive()) return;
      onDone();
    });
  }

  /** Direction rays make aimed fans and radial barrages readable before release. */
  private shotTelegraphFx(
    x: number,
    y: number,
    angles: readonly number[],
    ms: number,
    color: number,
    onDone: () => void,
  ): void {
    const rays = this.trackBossWarning(this.add.graphics().setDepth(6).setAlpha(0.35));
    rays.lineStyle(2, color, 0.82);
    for (const angle of angles) {
      rays.beginPath();
      rays.moveTo(x, y);
      rays.lineTo(x + Math.cos(angle) * 180, y + Math.sin(angle) * 180);
      rays.strokePath();
    }
    const core = this.trackBossWarning(this.add
      .circle(x, y, 20, color, 0.14)
      .setStrokeStyle(2, color, 0.95)
      .setDepth(6));
    this.tweens.add({ targets: [rays, core], alpha: 0.95, duration: ms, ease: 'Linear' });
    this.time.delayedCall(ms, () => {
      this.releaseBossWarnings(rays, core);
      if (this.playerDead || this.transitioning || !this.scene.isActive()) return;
      onDone();
    });
  }

  /** Grow faint roots along every danger lane, then hand off to the strike. */
  private rootLaneTelegraphFx(
    x: number,
    y: number,
    angles: readonly number[],
    length: number,
    width: number,
    ms: number,
    onDone: () => void,
  ): void {
    const roots = angles.map((angle) => {
      const root = this.trackBossWarning(this.add
        .image(Math.round(x), Math.round(y), TEX.treantRootLane)
        .setOrigin(0.5, 0)
        .setRotation(angle - Math.PI / 2)
        .setDisplaySize(Math.round(width * 2.7), Math.round(length))
        .setAlpha(0.28)
        .setDepth(5));
      const targetScaleY = root.scaleY;
      root.setScale(root.scaleX, targetScaleY * 0.06);
      this.tweens.add({
        targets: root,
        scaleY: targetScaleY,
        alpha: 0.8,
        duration: ms,
        ease: 'Sine.easeIn',
      });
      return root;
    });
    this.time.delayedCall(ms, () => {
      this.releaseBossWarnings(...roots);
      if (this.playerDead || this.transitioning || !this.scene.isActive()) return;
      onDone();
    });
  }

  private trackBossWarning<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.bossWarnings.add(object);
    return object;
  }

  private releaseBossWarnings(...objects: Phaser.GameObjects.GameObject[]): void {
    for (const object of objects) {
      this.bossWarnings.delete(object);
      this.tweens.killTweensOf(object);
      if (object.active) object.destroy();
    }
  }

  private clearBossWarnings(): void {
    this.releaseBossWarnings(...this.bossWarnings);
    this.bossWarnings.clear();
  }

  /** Erupt the generated root art and resolve one dodgeable lane hit. */
  private rootLaneStrikeFx(
    x: number,
    y: number,
    angles: readonly number[],
    length: number,
    width: number,
    damage: number,
  ): void {
    let hit = false;
    const roots = angles.map((angle) => {
      const root = this.add
        .image(Math.round(x), Math.round(y), TEX.treantRootLane)
        .setOrigin(0.5, 0)
        .setRotation(angle - Math.PI / 2)
        .setDisplaySize(Math.round(width * 2.7), Math.round(length))
        .setAlpha(0.95)
        .setDepth(5);
      const targetScaleY = root.scaleY;
      root.setScale(root.scaleX * 0.72, targetScaleY * 0.08);
      this.tweens.add({
        targets: root,
        scaleX: root.scaleX / 0.72,
        scaleY: targetScaleY,
        duration: 130,
        ease: 'Back.easeOut',
      });
      const endX = x + Math.cos(angle) * length;
      const endY = y + Math.sin(angle) * length;
      if (
        !hit
        && !this.playerDead
        && circleIntersectsLane(this.player.x, this.player.y - 6, 10, x, y, endX, endY, width)
      ) {
        hit = true;
      }
      return root;
    });
    if (hit) this.damagePlayer(damage, x, y);
    this.cameras.main.shake(120, 0.006);
    bus.emit('sfx:play', { id: 'boom' });
    this.time.delayedCall(220, () => {
      this.tweens.add({
        targets: roots,
        alpha: 0,
        duration: 220,
        onComplete: () => roots.forEach((root) => root.destroy()),
      });
    });
  }

  /** AoE detonation: blast visual + player range check. */
  private explodeAt(x: number, y: number, radius: number, damage: number, color = 0xffa050): void {
    const boom = this.add
      .circle(Math.round(x), Math.round(y), radius, color, 0.5)
      .setStrokeStyle(2, color, 0.9)
      .setDepth(9000);
    this.tweens.add({
      targets: boom,
      alpha: 0,
      scale: 1.18,
      duration: 230,
      ease: 'Quad.easeOut',
      onComplete: () => boom.destroy(),
    });
    this.cameras.main.shake(90, 0.004);
    bus.emit('sfx:play', { id: 'boom' });
    if (!this.playerDead && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= radius + 10) {
      this.damagePlayer(damage, x, y);
    }
  }

  /** Spawn a pooled enemy projectile. */
  private fireBullet(
    x: number,
    y: number,
    angle: number,
    speed: number,
    damage: number,
    color = 0xff8a5a,
  ): void {
    const obj =
      this.bulletPool.pop() ??
      this.add.circle(0, 0, 5, color, 1).setDepth(9000);
    obj
      .setFillStyle(color, 1)
      .setStrokeStyle(1, 0xffffff, 0.88)
      .setPosition(Math.round(x), Math.round(y))
      .setVisible(true);
    this.bullets.push({
      obj,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ttl: 2600,
      damage,
    });
  }

  private updateBullets(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.ttl -= dtMs;
      b.obj.x += b.vx * dt;
      b.obj.y += b.vy * dt;
      const hit =
        !this.playerDead &&
        this.playerInvuln <= 0 &&
        Phaser.Math.Distance.Between(b.obj.x, b.obj.y, this.player.x, this.player.y - 20) < 16;
      if (hit) this.damagePlayer(b.damage, b.obj.x, b.obj.y, 'mag');
      const out =
        b.obj.x < -20 || b.obj.y < -20 || b.obj.x > this.map.size.w + 20 || b.obj.y > this.map.size.h + 20;
      if (hit || out || b.ttl <= 0) {
        b.obj.setVisible(false);
        this.bulletPool.push(b.obj);
        this.bullets.splice(i, 1);
      }
    }
  }

  /** Summon one minion near the boss (screen-cap + no respawn). */
  private summonMinion(boss: Enemy, enemyId: string): boolean {
    if (this.enemies.filter((e) => !e.isDead()).length >= 12) return false; // mobile cap
    const ang = Math.random() * Math.PI * 2;
    const x = Phaser.Math.Clamp(boss.x + Math.cos(ang) * 56, 48, this.map.size.w - 48);
    const y = Phaser.Math.Clamp(boss.y + Math.sin(ang) * 56, 48, this.map.size.h - 48);
    const e = this.spawnEnemy(enemyId, x, y, { respawn: false });
    if (!e) return false;
    this.minions.push(e);
    this.spawnHitSpark(x, y - 20, false);
    return true;
  }

  /** One-shot phase cue with a named state, themed colour, pulse, and lasting tint. */
  private onBossEnrage(boss: Enemy, def: EnemyDef): void {
    const phase = def.phase;
    const phaseColor = phase?.color
      ? Phaser.Display.Color.HexStringToColor(phase.color).color
      : 0xff3020;
    let phaseTint: number;
    if (phase?.tint) {
      phaseTint = Phaser.Display.Color.HexStringToColor(phase.tint).color;
    } else {
      const base = def.tint ? Phaser.Display.Color.HexStringToColor(def.tint).color : 0xffffff;
      const r = Math.min(255, ((base >> 16) & 0xff) / 2 + 200);
      const g = ((base >> 8) & 0xff) * 0.55;
      const b = (base & 0xff) * 0.55;
      phaseTint = (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
    }
    boss.enrageVisual(phaseTint);
    if (phase) this.showBossPhaseBanner(phase.name, phase.color ?? '#ff6a5a');
    else this.floatText(boss.x, boss.y - 76, '怒り状態！', '#ff6a5a');
    const pulse = this.add
      .circle(boss.x, boss.y - 18, 26, phaseColor, 0.12)
      .setStrokeStyle(3, phaseColor, 0.95)
      .setDepth(9000);
    this.tweens.add({
      targets: pulse,
      scale: 3,
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => pulse.destroy(),
    });
    if (this.bossBar && phase) {
      this.bossBar.phaseLabel.setText(phase.name).setColor(phase.color ?? '#f1c64f');
    }
    this.cameras.main.shake(240, 0.008);
    this.flashScreen(phaseColor, 0.18, 260);
    bus.emit('sfx:play', { id: 'roar' });
  }

  private clearEnemyProjectiles(): void {
    for (const bullet of this.bullets) {
      bullet.obj.setVisible(false);
      this.bulletPool.push(bullet.obj);
    }
    this.bullets = [];
  }

  private onBossStaggered(boss: Enemy): void {
    if (!this.bossStagger) return;
    const downMs = this.bossStagger.downMs;
    boss.stagger(downMs);
    this.bossBrain?.defer(downMs);
    this.floatText(boss.x, boss.y - 76, 'DOWN!', '#ffe08a');
    const pulse = this.add
      .image(boss.x, boss.y - 14, TEX.hudActionButton)
      .setDisplaySize(42, 42)
      .setTint(0xffd76a)
      .setAlpha(0.72)
      .setDepth(9000);
    this.tweens.add({
      targets: pulse,
      scale: 2,
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => pulse.destroy(),
    });
    this.cameras.main.shake(180, 0.008);
    this.flashScreen(0xffd76a, 0.16, 180);
    bus.emit('sfx:play', { id: 'crit' });
  }

  private showBossPhaseBanner(name: string, color: string): void {
    const banner = this.add
      .text(this.scale.width / 2, 190, `PHASE 2\n${name}`, {
        fontFamily: FONT,
        fontSize: '16px',
        fontStyle: 'bold',
        color,
        align: 'center',
        stroke: '#090711',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(9002);
    this.tweens.add({
      targets: banner,
      y: 178,
      alpha: 0,
      delay: 720,
      duration: 520,
      ease: 'Quad.easeIn',
      onComplete: () => banner.destroy(),
    });
  }

  /**
   * Boss HP card. Uses the open band under the compact player panel; the quest
   * tracker yields this slot while a boss is alive.
   */
  private buildBossBar(name: string, def: EnemyDef): void {
    // Rebuilding (sequential hunts in one visit) must not orphan the old bar.
    if (this.bossBar) {
      this.bossBar.root.destroy(true);
      this.bossBar = null;
    }
    const w = this.scale.width;
    const x = 14;
    const y = 96;
    const cardW = w - 28;
    const hasStagger = this.bossStagger !== null;
    const cardH = hasStagger ? 70 : 58;
    const root = this.add.container(0, 0).setScrollFactor(0).setDepth(8000);
    root.add(
      this.add
        .image(x + cardW / 2, y + cardH / 2 + 3, TEX.hudQuestFrame)
        .setDisplaySize(cardW, cardH)
        .setTint(0x000000)
        .setAlpha(0.52),
    );
    root.add(this.add.rectangle(x + cardW / 2, y + cardH / 2, cardW - 10, cardH - 10, 0x071522, 0.94));
    root.add(this.add.image(x + cardW / 2, y + cardH / 2, TEX.hudQuestFrame).setDisplaySize(cardW, cardH));

    root.add(
      this.add.image(x + 32, y + cardH / 2, TEX.hudActionButton).setDisplaySize(50, 50),
    );
    const portrait = this.add
      .image(x + 32, y + cardH / 2 + 2, def.textureKey, 0)
      .setDisplaySize(38, 38);
    if (def.tint) portrait.setTint(Phaser.Display.Color.HexStringToColor(def.tint).color);
    root.add(portrait);

    root.add(this.add.text(x + 70, y + 7, name, {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#fff2c6',
      fontStyle: 'bold',
    }));
    const phaseLabel = this.add
      .text(x + cardW - 14, y + 8, def.phase ? '静穏' : 'BOSS', {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#b7c9d2',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    root.add(phaseLabel);

    root.add(this.add.text(x + 70, y + 27, 'HP', {
      fontFamily: FONT,
      fontSize: '8px',
      color: '#f3b8b8',
      fontStyle: 'bold',
    }));
    const hpX = x + 92;
    const hpW = cardW - 106;
    root.add(this.add.rectangle(hpX + hpW / 2, y + 34, hpW, 9, 0x02060a, 0.9));
    const hpFill = this.add
      .rectangle(hpX, y + 34, hpW, 7, 0xd94f58)
      .setOrigin(0, 0.5)
      .setScale(1, 1);
    root.add(hpFill);
    const hpText = this.add
      .text(x + cardW - 14, y + 25, '100%', {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#f7f9fc',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0);
    root.add(hpText);

    let staggerFill: Phaser.GameObjects.Rectangle | null = null;
    let staggerLabel: Phaser.GameObjects.Text | null = null;
    if (hasStagger) {
      staggerLabel = this.add.text(x + 70, y + 48, 'ひるみ', {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#ffe39a',
        fontStyle: 'bold',
      });
      const staggerX = x + 104;
      const staggerW = cardW - 118;
      root.add(staggerLabel);
      root.add(this.add.rectangle(staggerX + staggerW / 2, y + 55, staggerW, 7, 0x02060a, 0.9));
      staggerFill = this.add
        .rectangle(staggerX, y + 55, staggerW, 5, 0xe5b83f)
        .setOrigin(0, 0.5)
        .setScale(0, 1);
      root.add(staggerFill);
    }
    this.bossBar = { root, hpFill, hpText, phaseLabel, staggerFill, staggerLabel };
    bus.emit('boss:bar', { active: true });
  }

  private spawnPetIfAny(): void {
    if (this.pet || !gameState.activePetId) return;
    const def = getPet(gameState.activePetId);
    if (def) this.pet = new Pet(this, this.player.x - 18, this.player.y + 8, def);
  }

  /**
   * Pet assist: every couple of seconds the active pet zaps the nearest
   * living enemy near it. Damage comes from the pet's atkBase × its level
   * (pet-growth), flows through Enemy.takeDamage so kills/drops/quests all
   * behave exactly like player kills.
   */
  private updatePetAssist(delta: number): void {
    this.petAtkCd -= delta;
    if (!this.pet || this.petAtkCd > 0 || this.playerDead) return;
    const def = gameState.activePetId ? getPet(gameState.activePetId) : undefined;
    if (!def?.atkBase) return;
    let target: Enemy | null = null;
    let best = 130;
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      const d = Phaser.Math.Distance.Between(this.pet.x, this.pet.y, e.x, e.y);
      if (d < best) {
        best = d;
        target = e;
      }
    }
    if (!target) return;
    this.petAtkCd = 2200;
    const dmg = petAttackDamage(def.atkBase, gameState.petLevel(def.id));
    this.spawnZap(this.pet.x, this.pet.y - 14, target.x, target.y - 20);
    target.takeDamage(dmg, this.pet.x, this.pet.y, 40);
    this.dmg.show(target.x, target.y - 42, dmg, false, '#a8f0c0');
    this.spawnHitSpark(target.x, target.y - 22, false, 0xa8f0c0);
  }

  private spawnNpc(
    x: number,
    y: number,
    label: string,
    action?: string,
    dialogueId?: string,
    nameplateOffsetY?: number,
  ): void {
    // Distinct look per role so the shopkeeper / smith / guild clerk / elder
    // read as different characters instead of tinted clones.
    const byAction: Record<string, string> = {
      item: TEX.npcMerchant,
      craft: TEX.npcSmith,
      job: TEX.npcGuild,
      quest: TEX.npcQuest,
    };
    const tex = byAction[action ?? '']
      ?? (dialogueId?.startsWith('elder_') ? TEX.npcElder : TEX.npcVillager);
    const sprite = this.physics.add
      .staticImage(x, y, tex)
      .setOrigin(0.5, 0.875)
      .setDisplaySize(this.map.id === 'town' ? 64 : 96, this.map.id === 'town' ? 64 : 96);
    sprite.refreshBody();
    sprite.setDepth(Math.round(y));
    this.add.image(x, y + 2, TEX.groundShadow).setDisplaySize(24, 9).setDepth(Math.round(y) - 1);
    this.npcSprites.push(sprite);
    // The illustrated town already carries facility pictograms in the scenery;
    // keeping old wooden labels over that art would cover roofs and entrances.
    if (this.map.id === 'town') {
      if (action) {
        const marker = this.add
          .image(x, y - 47, TEX.npcInteractMarker)
          .setDisplaySize(28, 28)
          .setDepth(Math.round(y) + 3);
        this.tweens.add({
          targets: marker,
          y: y - 50,
          duration: 620,
          yoyo: true,
          repeat: -1,
          ease: 'Stepped',
          easeParams: [3],
        });
      }
      this.npcs.push({ x, y, action, dialogueId });
      return;
    }
    // Hanging wooden signboard above the head. Derived from the feet (spawn y),
    // not a hard y-80: the 96×96 NPC art's head top sits ~52px above the feet,
    // so the default -66 places the sign just above it. Data can override via
    // nameplateOffsetY (e.g. taller/shorter future art).
    const signY = y + (nameplateOffsetY ?? -66);
    const txt = this.add
      .text(x, signY, label, { fontFamily: FONT, fontSize: '11px', color: '#fbe7c2' })
      .setOrigin(0.5)
      .setDepth(Math.round(y) + 2);
    const signW = Math.ceil(txt.width) + 18;
    this.add
      .image(x, signY, TEX.sign)
      .setDisplaySize(signW, 20)
      .setDepth(Math.round(y) + 1);
    this.npcs.push({ x, y, action, dialogueId });
  }

  private onContact(enemy: Enemy): void {
    if (enemy.isDead()) return;
    this.damagePlayer(enemy.cfg.contactDamage, enemy.x, enemy.y);
  }

  /** Apply damage to the player (shared by contact + attack strikes).
   *  Respects the post-hit invulnerability window. Defense (防御/魔防)
   *  mitigates via the shared curve — armor was previously cosmetic. */
  private damagePlayer(raw: number, fromX: number, fromY: number, kind: 'phys' | 'mag' = 'phys'): void {
    if (this.playerInvuln > 0 || this.playerDead) return;
    this.playerInvuln = 700;
    // Knockback can shove the player onto a walk-on portal mid-fight (boss
    // charges ejected hunters from the arena). Briefly disarm portals.
    this.portalGuard = 1500;
    const mitigated = mitigateDamage(
      raw,
      kind === 'mag' ? gameState.derived.magDef : gameState.derived.def,
    );
    const setCombat = activeBossSetCombat(gameState.equipment);
    const amount = Math.max(1, Math.round(mitigated * (1 - setCombat.damageReduction)));
    gameState.hp = Math.max(0, gameState.hp - amount);
    bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
    this.dmg.show(this.player.x, this.player.y - 40, amount, false);
    this.player.hurt();
    bus.emit('sfx:play', { id: 'hurt' });
    this.cameras.main.shake(120, 0.006);
    this.flashScreen(0xff2a2a, 0.18, 120);
    const ang = Math.atan2(this.player.y - fromY, this.player.x - fromX);
    this.player.body.setVelocity(Math.cos(ang) * 160, Math.sin(ang) * 160);
    if (gameState.hp <= 0) this.onPlayerDown();
  }

  private onPlayerDown(): void {
    if (this.playerDead) return;
    const failedHunt = this.currentHuntQuest();
    if (failedHunt && abandonQuest(gameState, failedHunt.id)) {
      this.floatText(this.player.x, this.player.y - 64, `${failedHunt.name} 失敗`, '#ff8f8f');
    }
    this.playerDead = true;
    this.playerInvuln = 999999;
    this.bossBrain = null;
    this.clearBossWarnings();
    this.clearEnemyProjectiles();
    bus.emit('boss:bar', { active: false });
    this.ui.resetControls();
    this.ui.showDefeated();
    this.player.die();
    this.cameras.main.shake(200, 0.008);
    // Let the death flash/fade read before respawning in town.
    this.time.delayedCall(700, () => {
      gameState.fullHeal();
      const town = getMap('town');
      const sp = town ? spawnPoint(town, 'respawn') : { x: 320, y: 735 };
      gameState.mapId = 'town';
      gameState.x = sp.x;
      gameState.y = sp.y;
      this.transitionRestart(true);
    });
  }

  /** Debug-gated E2E entry point for the complete defeat and respawn flow. */
  forceDefeatForTest(): boolean {
    if (!this.scene.isActive() || this.scene.isPaused() || this.playerDead || this.transitioning) return false;
    gameState.hp = 0;
    bus.emit('player:hp-changed', { current: 0, max: gameState.derived.maxHp });
    this.onPlayerDown();
    return true;
  }

  /**
   * Apply one player hit to an enemy: crit roll, element multiplier, damage
   * number, spark, status proc. Shared by melee strikes and projectiles.
   */
  private hitEnemy(
    e: Enemy,
    atk: number,
    mult: number,
    knockback: number,
    element: Element,
    isSkill = false,
  ): { killed: boolean; crit: boolean } {
    this.combatTarget = e;
    this.combatTargetLockMs = 1200;
    const setCombat = activeBossSetCombat(gameState.equipment);
    const crit = Math.random() < gameState.derived.critRate;
    const elemMult = elementMultiplier(element, e.cfg.weakness, e.cfg.resist);
    const weak = elemMult > 1;
    const isBoss = e === this.boss || !!getEnemyDef(this.enemyTypes.get(e) ?? '')?.isBoss;
    const lowHp = gameState.hp <= gameState.derived.maxHp * 0.3;
    const damageRate =
      1
      + setCombat.damageRate
      + (isBoss ? setCombat.bossDamage : 0)
      + (isSkill ? setCombat.skillPower : 0)
      + (lowHp ? setCombat.lowHpDamage : 0);
    const critMult = crit ? 1.6 + setCombat.critDamage : 1;
    const amount = Math.max(1, Math.round(atk * mult * critMult * elemMult * damageRate));
    let totalDamage = amount;
    let killed = e.takeDamage(amount, this.player.x, this.player.y, knockback);
    // Elemental hits color the number; a super-effective hit reads red.
    const color = element !== 'none' ? elementColorHex(element) : undefined;
    const sparkColor = weak ? 0xff5a5a : element !== 'none' ? ELEMENT_COLOR[element] : 0xffffff;
    this.dmg.show(e.x, e.y - 42, amount, crit, weak ? '#ff5a5a' : color);
    this.spawnHitSpark(e.x, e.y - 22, crit, sparkColor);
    bus.emit('combat:damage-dealt', { x: e.x, y: e.y, amount, crit });
    if (!killed) {
      for (const proc of setCombat.onHit) {
        if (Math.random() >= proc.chance) continue;
        const procMult = elementMultiplier(proc.element, e.cfg.weakness, e.cfg.resist);
        const procDamage = Math.max(1, Math.round(atk * proc.power * procMult));
        totalDamage += procDamage;
        killed = e.takeDamage(procDamage, this.player.x, this.player.y, 8);
        const procColor = elementColorHex(proc.element);
        this.dmg.show(e.x + 8, e.y - 58, procDamage, false, procColor);
        this.spawnHitSpark(e.x, e.y - 28, false, ELEMENT_COLOR[proc.element]);
        this.floatText(e.x, e.y - 72, proc.label, procColor);
        bus.emit('combat:damage-dealt', { x: e.x, y: e.y, amount: procDamage, crit: false });
        if (killed) break;
      }
    }
    if (
      !killed
      && e === this.boss
      && this.bossStagger?.hit({ damage: totalDamage, skill: isSkill, crit, weak })
    ) {
      this.onBossStaggered(e);
    }
    this.updateCombatTargetUi();
    // 吸血 (lifesteal): boss-gear special — heal a fraction of dealt damage.
    const ls = gameState.derived.lifesteal;
    if (ls > 0 && gameState.hp < gameState.derived.maxHp && !this.playerDead) {
      const heal = Math.max(1, Math.round(totalDamage * ls));
      gameState.hp = Math.min(gameState.derived.maxHp, gameState.hp + heal);
      bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
      this.dmg.show(this.player.x, this.player.y - 48, heal, false, '#e36a9f');
    }
    if (killed && setCombat.healOnKillRate > 0 && gameState.hp < gameState.derived.maxHp) {
      const heal = Math.max(1, Math.round(gameState.derived.maxHp * setCombat.healOnKillRate));
      gameState.hp = Math.min(gameState.derived.maxHp, gameState.hp + heal);
      bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
      this.dmg.show(this.player.x, this.player.y - 62, heal, false, '#9fe3a0');
    }
    // On-hit status proc (only on a live enemy; weakness improves the odds).
    if (!killed && element !== 'none') {
      const st = statusFromElement(element);
      if (st && Math.random() < STATUS_PROC_CHANCE * (weak ? 1.5 : 1)) {
        if (STATUS_CATEGORY[st] === 'stun') e.applyStatus(st, 900, 0);
        else e.applyStatus(st, 3000, Math.max(1, Math.round(atk * 0.25)));
      }
    }
    return { killed, crit };
  }

  /** Melee/skill hit resolution in front of the player. */
  private resolveMelee(
    dir: Direction,
    mult: number,
    knockback: number,
    reach = 30,
    half = 34,
    atk = gameState.derived.physAtk,
    element: Element = 'none',
    isSkill = false,
  ): void {
    const { ax, ay } = aheadOffset(dir, reach);
    const hx = this.player.x + ax;
    const hy = this.player.y + ay;
    let hitStop = false;
    let anyCrit = false;
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      if (Phaser.Math.Distance.Between(hx, hy, e.x, e.y) <= half) {
        const { crit } = this.hitEnemy(e, atk, mult, knockback, element, isSkill);
        hitStop = true;
        anyCrit = anyCrit || crit;
      }
    }
    if (hitStop) {
      this.hitStop(anyCrit ? 76 : 62);
      this.cameras.main.shake(anyCrit ? 120 : 80, anyCrit ? 0.0065 : 0.0038);
      bus.emit('sfx:play', { id: anyCrit ? 'crit' : 'hit' });
    }
  }

  /** Quick crescent slash in the attack direction (basic-attack juice). */
  private spawnSlash(dir: Direction): void {
    const { ax, ay } = aheadOffset(dir, 1);
    const ang = Math.atan2(ay, ax);
    const cx = Math.round(this.player.x + ax * 14);
    const cy = Math.round(this.player.y - 24 + ay * 14);
    const depth = 9000;
    const g = this.add.graphics().setPosition(cx, cy).setDepth(depth);
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(9, 0x7ae3ff, 0.72);
    g.beginPath();
    g.arc(0, 0, 24, ang - 1.08, ang + 1.08, false);
    g.strokePath();
    g.lineStyle(5, 0xffffff, 1);
    g.beginPath();
    g.arc(0, 0, 19, ang - 1.0, ang + 1.0, false);
    g.strokePath();
    g.lineStyle(3, 0xffd86b, 0.9);
    g.beginPath();
    g.arc(0, 0, 13, ang - 0.86, ang + 0.86, false);
    g.strokePath();
    const flash = this.add.circle(cx, cy, 7, 0xffffff, 0.55).setDepth(depth + 1);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.18,
      scaleY: 1.18,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.4,
      duration: 220,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    for (let i = 0; i < 4; i++) {
      const t = ang - 0.75 + i * 0.5;
      const px = cx + Math.round(Math.cos(t) * 18);
      const py = cy + Math.round(Math.sin(t) * 18);
      const chip = this.add.rectangle(px, py, 2, 2, i % 2 ? 0xffffff : 0xffd86b, 0.95).setDepth(depth + 1);
      this.tweens.add({
        targets: chip,
        x: px + Math.round(Math.cos(t) * 10),
        y: py + Math.round(Math.sin(t) * 10),
        alpha: 0,
        duration: 180,
        ease: 'Quad.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
  }

  /** Dust puffs trailing the roll (no rotation allowed, so dust sells motion). */
  private spawnRollDust(): void {
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 70, () => {
        if (this.playerDead) return;
        const puff = this.add
          .circle(Math.round(this.player.x), Math.round(this.player.y - 4), 5, 0xd8d0c0, 0.55)
          .setDepth(Math.round(this.player.y) - 1);
        this.tweens.add({
          targets: puff,
          alpha: 0,
          scale: 1.9,
          duration: 240,
          ease: 'Quad.easeOut',
          onComplete: () => puff.destroy(),
        });
      });
    }
  }

  /** Quick beam from a ranged enemy to the player (attack-strike feedback). */
  private spawnZap(x1: number, y1: number, x2: number, y2: number): void {
    const g = this.add.graphics().setDepth(9000);
    g.lineStyle(2, 0x9fd0ff, 0.9);
    g.lineBetween(Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2));
    const spark = this.add.circle(Math.round(x2), Math.round(y2), 4, 0x9fd0ff, 0.9).setDepth(9000);
    this.tweens.add({
      targets: [g, spark],
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => {
        g.destroy();
        spark.destroy();
      },
    });
  }

  /** Small impact burst where a hit lands. */
  private spawnHitSpark(x: number, y: number, crit: boolean, color = 0xffffff): void {
    const cx = Math.round(x);
    const cy = Math.round(y);
    const main = crit ? 0xffd24a : color;
    const core = this.add.circle(cx, cy, crit ? 7 : 5, main, 0.95).setDepth(9002);
    core.setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.add
      .circle(cx, cy, crit ? 8 : 6, main, 0)
      .setStrokeStyle(crit ? 3 : 2, main, 0.9)
      .setDepth(9001);
    const burst = this.add.graphics().setDepth(9003);
    const rays = crit ? 10 : 7;
    burst.lineStyle(crit ? 3 : 2, main, 0.95);
    for (let i = 0; i < rays; i++) {
      const a = (Math.PI * 2 * i) / rays + (crit ? 0.08 : 0);
      const inner = crit ? 5 : 4;
      const outer = crit ? 24 : 17;
      burst.lineBetween(
        cx + Math.round(Math.cos(a) * inner),
        cy + Math.round(Math.sin(a) * inner),
        cx + Math.round(Math.cos(a) * outer),
        cy + Math.round(Math.sin(a) * outer),
      );
    }
    this.tweens.add({
      targets: core,
      scale: crit ? 2.5 : 2,
      alpha: 0,
      duration: crit ? 260 : 210,
      ease: 'Cubic.Out',
      onComplete: () => core.destroy(),
    });
    this.tweens.add({
      targets: ring,
      scale: crit ? 3.2 : 2.5,
      alpha: 0,
      duration: crit ? 300 : 240,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: burst,
      alpha: 0,
      duration: crit ? 210 : 170,
      ease: 'Quad.easeOut',
      onComplete: () => burst.destroy(),
    });
    for (let i = 0; i < (crit ? 8 : 5); i++) {
      const a = (Math.PI * 2 * i) / (crit ? 8 : 5) + Math.random() * 0.4;
      const dist = (crit ? 22 : 14) + Math.random() * 10;
      const chip = this.add.rectangle(cx, cy, crit ? 3 : 2, crit ? 3 : 2, i % 2 ? 0xffffff : main, 1).setDepth(9004);
      this.tweens.add({
        targets: chip,
        x: cx + Math.round(Math.cos(a) * dist),
        y: cy + Math.round(Math.sin(a) * dist),
        alpha: 0,
        duration: crit ? 260 : 210,
        ease: 'Quad.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
  }

  /** Full-screen colour flash (camera-locked). Used for player hurt feedback. */
  private flashScreen(color: number, alpha: number, duration: number): void {
    const cam = this.cameras.main;
    const f = this.add
      .rectangle(0, 0, cam.width, cam.height, color, alpha)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(9500);
    this.tweens.add({
      targets: f,
      alpha: 0,
      duration,
      ease: 'Quad.easeOut',
      onComplete: () => f.destroy(),
    });
  }

  /** Burst of small shards when an enemy dies (撃破の手応え). */
  private spawnDeathBurst(x: number, y: number, color: number): void {
    const cx = Math.round(x);
    const cy = Math.round(y) - 18;
    // Expanding ring.
    const ring = this.add.circle(cx, cy, 6, color, 0.7).setDepth(9000);
    this.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    // A few shards flung outward (pooled-free, count kept tiny per perf budget).
    for (let i = 0; i < 6; i++) {
      const ang = (Math.PI * 2 * i) / 6 + (Math.random() - 0.5) * 0.5;
      const dist = 16 + Math.random() * 12;
      const shard = this.add.rectangle(cx, cy, 3, 3, color, 1).setDepth(9001);
      this.tweens.add({
        targets: shard,
        x: cx + Math.round(Math.cos(ang) * dist),
        y: cy + Math.round(Math.sin(ang) * dist),
        alpha: 0,
        duration: 280,
        ease: 'Quad.easeOut',
        onComplete: () => shard.destroy(),
      });
    }
  }

  private hitStop(ms: number): void {
    this.physics.world.isPaused = true;
    this.time.delayedCall(ms, () => {
      this.physics.world.isPaused = false;
    });
  }

  /** Use the active skill assigned to a slot (data-driven). */
  private useSkill(slot: number): void {
    if (this.skillCd[slot] > 0) {
      bus.emit('skill:failed', {
        slot,
        reason: 'cooldown',
        skillId: gameState.skillSlots[slot] ?? undefined,
        remaining: this.skillCd[slot],
      });
      return;
    }
    const id = gameState.skillSlots[slot];
    if (!id) {
      bus.emit('skill:failed', { slot, reason: 'empty' });
      return;
    }
    const def = getSkill(id);
    if (!def || def.type !== 'active') {
      bus.emit('skill:failed', { slot, reason: 'empty', skillId: id });
      return;
    }
    if (!gameState.canUseSkill(id)) {
      bus.emit('skill:failed', { slot, reason: 'job', skillId: id });
      return;
    }
    const cost = def.mpCost ?? 0;
    if (gameState.mp < cost) {
      bus.emit('skill:failed', { slot, reason: 'mp', skillId: id });
      return;
    }
    gameState.mp -= cost;
    bus.emit('player:mp-changed', { current: gameState.mp, max: gameState.derived.maxMp });
    this.skillCd[slot] = def.cooldown ?? 800;
    bus.emit('skill:cooldown', { slot, duration: this.skillCd[slot] });
    bus.emit('skill:used', { slot, skillId: id });
    this.player.play('cast');
    const dir = this.player.getDirection();
    const atk = def.scaling === 'mag' ? gameState.derived.magAtk : gameState.derived.physAtk;
    // Skill element overrides the weapon's; otherwise the weapon's element rides along.
    const skillEl: Element = isElement(def.element) ? def.element : 'none';
    const element = skillEl !== 'none' ? skillEl : this.weaponElement();
    this.spawnSkillEffect(dir, def.fx ?? 'magic', element);
    bus.emit('sfx:play', { id: 'skill' });

    // Effect kinds: heal / buff / projectile give each family its own verb;
    // 'damage' (default) is the classic forward strike.
    const effect = def.effect ?? 'damage';
    if (effect === 'heal') {
      const amount = Math.max(1, Math.round(atk * (def.powerMult ?? 1.5)));
      gameState.hp = Math.min(gameState.derived.maxHp, gameState.hp + amount);
      bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
      this.dmg.show(this.player.x, this.player.y - 48, amount, false, '#9fe3a0');
      this.spawnHealGlow();
      bus.emit('sfx:play', { id: 'heal' });
      return;
    }
    if (effect === 'buff') {
      gameState.addBuff(def.buffStats ?? {}, def.buffMs ?? 8000, this.time.now);
      this.floatText(this.player.x, this.player.y - 56, `${def.name}！`, '#ffd86b');
      this.spawnBuffRing();
      return;
    }
    if (effect === 'projectile') {
      const count = def.projCount ?? 1;
      const speed = def.projSpeed ?? 220;
      const { ax, ay } = aheadOffset(dir, 1);
      const baseAng = Math.atan2(ay, ax);
      this.time.delayedCall(120, () => {
        for (let i = 0; i < count; i++) {
          const off = (i - (count - 1) / 2) * 0.16;
          this.firePlayerBolt(baseAng + off, speed, atk, def.powerMult ?? 1.5, element);
        }
      });
      return;
    }
    this.time.delayedCall(120, () =>
      this.resolveMelee(
        dir,
        def.powerMult ?? 1.5,
        def.knockback ?? 26,
        def.reach ?? 30,
        def.radius ?? 34,
        atk,
        element,
        true,
      ),
    );
  }

  /** Soft green glow when a heal lands. */
  private spawnHealGlow(): void {
    const cx = Math.round(this.player.x);
    const cy = Math.round(this.player.y) - 24;
    const glow = this.add.circle(cx, cy, 22, 0x9fe36a, 0.32).setDepth(9000);
    const ring = this.add.circle(cx, cy, 8, 0xd8ffb0, 0.7).setDepth(9001);
    this.tweens.add({ targets: glow, alpha: 0, duration: 420, ease: 'Quad.easeOut', onComplete: () => glow.destroy() });
    this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  }

  /** Gold ring burst when a buff activates. */
  private spawnBuffRing(): void {
    const cx = Math.round(this.player.x);
    const cy = Math.round(this.player.y) - 20;
    const ring = this.add.circle(cx, cy, 10, 0xffd86b, 0).setStrokeStyle(3, 0xffd86b, 0.9).setDepth(9001);
    this.tweens.add({ targets: ring, scale: 3.2, alpha: 0, duration: 420, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  }

  /** Fire one player projectile (pooled; hits the first enemy in its path). */
  private firePlayerBolt(angle: number, speed: number, atk: number, mult: number, element: Element): void {
    const color = element !== 'none' ? ELEMENT_COLOR[element] : 0xbfe0ff;
    const obj =
      this.pBoltPool.pop() ??
      this.add.circle(0, 0, 4, color, 1).setDepth(9000);
    obj.setFillStyle(color, 1).setStrokeStyle(1, 0xffffff, 0.8);
    obj.setPosition(Math.round(this.player.x), Math.round(this.player.y) - 24).setVisible(true);
    this.pBolts.push({
      obj,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ttl: 1100,
      atk,
      mult,
      element,
      skill: true,
    });
  }

  private updatePlayerBolts(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = this.pBolts.length - 1; i >= 0; i--) {
      const b = this.pBolts[i];
      b.ttl -= dtMs;
      b.obj.x += b.vx * dt;
      b.obj.y += b.vy * dt;
      let hit = false;
      for (const e of this.enemies) {
        if (e.isDead()) continue;
        if (Phaser.Math.Distance.Between(b.obj.x, b.obj.y, e.x, e.y - 16) < 18) {
          this.hitEnemy(e, b.atk, b.mult, 14, b.element, b.skill);
          hit = true;
          break;
        }
      }
      const out =
        b.obj.x < -20 || b.obj.y < -20 || b.obj.x > this.map.size.w + 20 || b.obj.y > this.map.size.h + 20;
      if (hit || out || b.ttl <= 0) {
        b.obj.setVisible(false);
        this.pBoltPool.push(b.obj);
        this.pBolts.splice(i, 1);
      }
    }
  }

  /** The active weapon's element (falls back to 'none' when unarmed/neutral). */
  private weaponElement(): Element {
    const el = gameState.weaponElement();
    return isElement(el) ? el : 'none';
  }

  /** Cast effect, styled per skill (data-driven `fx`: slash | impact | magic). */
  private spawnSkillEffect(dir: Direction, style: string, element: Element): void {
    if (style === 'slash') this.fxSkillSlash(dir, element);
    else if (style === 'impact') this.fxSkillImpact(dir, element);
    else this.fxSkillMagic(dir, element);
  }

  /** 斬撃: a big bright crescent sweeping across the strike arc. */
  private fxSkillSlash(dir: Direction, element: Element): void {
    const { ax, ay } = aheadOffset(dir, 1);
    const ang = Math.atan2(ay, ax);
    const cx = Math.round(this.player.x + ax * 14);
    const cy = Math.round(this.player.y - 24 + ay * 14);
    const color = element !== 'none' ? ELEMENT_COLOR[element] : 0xbfefff;
    const g = this.add.graphics().setPosition(cx, cy).setDepth(9000);
    g.setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(12, color, 0.55);
    g.beginPath();
    g.arc(0, 0, 34, ang - 1.22, ang + 1.22, false);
    g.strokePath();
    g.lineStyle(8, 0xbfefff, 0.95);
    g.beginPath();
    g.arc(0, 0, 28, ang - 1.18, ang + 1.18, false);
    g.strokePath();
    g.lineStyle(4, 0xffffff, 1);
    g.beginPath();
    g.arc(0, 0, 22, ang - 1.0, ang + 1.0, false);
    g.strokePath();
    const flash = this.add.circle(cx, cy, 11, 0xffffff, 0.72).setDepth(9001);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.38,
      scaleY: 1.38,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.8,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    for (let i = 0; i < 6; i++) {
      const t = ang - 0.9 + i * 0.36;
      const chip = this.add
        .rectangle(cx + Math.round(Math.cos(t) * 26), cy + Math.round(Math.sin(t) * 26), 3, 3, i % 2 ? 0xffffff : color, 1)
        .setDepth(Math.round(this.player.y) + 3);
      this.tweens.add({
        targets: chip,
        x: chip.x + Math.round(Math.cos(t) * 16),
        y: chip.y + Math.round(Math.sin(t) * 16),
        alpha: 0,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
  }

  /** 強打: a heavy ground shockwave ring plus extra shake (weighty hit). */
  private fxSkillImpact(dir: Direction, element: Element): void {
    const { ax, ay } = aheadOffset(dir, 22);
    const cx = Math.round(this.player.x + ax);
    const cy = Math.round(this.player.y - 6 + ay);
    const color = element !== 'none' ? ELEMENT_COLOR[element] : 0xffb24a;
    const depth = Math.round(this.player.y) + 2;
    const ring = this.add.circle(cx, cy, 8, color, 0).setDepth(depth);
    ring.setStrokeStyle(4, color, 0.95);
    this.tweens.add({
      targets: ring,
      scale: 5.2,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    const crack = this.add.graphics().setDepth(depth + 1);
    crack.lineStyle(2, 0x2a1c18, 0.8);
    crack.lineBetween(cx - 22, cy, cx + 22, cy);
    crack.lineBetween(cx, cy - 16, cx, cy + 16);
    crack.lineBetween(cx - 14, cy - 9, cx + 15, cy + 10);
    this.tweens.add({
      targets: crack,
      alpha: 0,
      duration: 420,
      ease: 'Quad.easeOut',
      onComplete: () => crack.destroy(),
    });
    const flash = this.add.circle(cx, cy, 16, 0xfff2c0, 0.9).setDepth(depth + 2);
    this.tweens.add({
      targets: flash,
      scale: 0.2,
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI + i * (Math.PI / 4) + Math.random() * 0.3;
      const dust = this.add.circle(cx, cy + 4, 4, 0xd8c090, 0.45).setDepth(depth);
      this.tweens.add({
        targets: dust,
        x: cx + Math.round(Math.cos(a) * (18 + i * 3)),
        y: cy + Math.round(Math.sin(a) * 8) + 8,
        alpha: 0,
        scale: 1.8,
        duration: 320,
        ease: 'Quad.easeOut',
        onComplete: () => dust.destroy(),
      });
    }
    this.cameras.main.shake(150, 0.007);
  }

  /** Default magic burst (expanding blue orb). */
  private fxSkillMagic(dir: Direction, element: Element): void {
    const { ax, ay } = aheadOffset(dir, 30);
    const color = element !== 'none' ? ELEMENT_COLOR[element] : 0x9cd2ff;
    const cx = Math.round(this.player.x + ax);
    const cy = Math.round(this.player.y - 30 + ay);
    const fx = this.add.circle(
      cx,
      cy,
      6,
      color,
      0.85,
    );
    fx.setDepth(Math.round(this.player.y) + 2).setBlendMode(Phaser.BlendModes.ADD);
    const ring = this.add.circle(cx, cy, 10, color, 0).setStrokeStyle(3, 0xffffff, 0.8).setDepth(Math.round(this.player.y) + 1);
    this.tweens.add({
      targets: fx,
      scale: 4.8,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.Out',
      onComplete: () => fx.destroy(),
    });
    this.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 360,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6;
      const mote = this.add.circle(cx, cy, 2, i % 2 ? 0xffffff : color, 0.9).setDepth(Math.round(this.player.y) + 3);
      this.tweens.add({
        targets: mote,
        x: cx + Math.round(Math.cos(a) * 30),
        y: cy + Math.round(Math.sin(a) * 22),
        alpha: 0,
        duration: 300,
        ease: 'Quad.easeOut',
        onComplete: () => mote.destroy(),
      });
    }
  }

  private onEnemyDeath(x: number, y: number, def: EnemyDef, veteran = false): void {
    this.enemies = this.enemies.filter((e) => !e.isDead());
    const burstColor = def.tint
      ? Phaser.Display.Color.HexStringToColor(def.tint).color
      : 0xffffff;
    this.spawnDeathBurst(x, y, burstColor);
    bus.emit('sfx:play', { id: 'enemy_down' });
    gameState.flags['killed_any'] = true;
    gameState.addKill(def.id); // bestiary discovery + lifetime counter
    bus.emit('enemy:died', { enemyId: def.id, x, y });
    recordKill(gameState, def.id); // advance active quest objectives
    const completedHunt = this.completedHuntQuestFor(def);
    if (completedHunt) this.showQuestClearBanner(completedHunt.name);
    this.scheduleHuntWaves(); // 連続狩猟: next wave after this kill
    const killFlag = `boss_${def.id}_killed`;
    const firstKill = !!def.isBoss && !gameState.flags[killFlag];
    const table = def.dropTableId ? getDropTable(def.dropTableId) : undefined;
    const earnedDrops: QuestResultItem[] = [];
    const proofExchange = def.isBoss && def.dropTableId
      ? getBossRareExchangeForDropTable(def.dropTableId)
      : undefined;
    if (proofExchange) {
      const proof = { itemId: proofExchange.proofItemId, qty: 1 };
      earnedDrops.push(proof);
      this.grantLoot(proof.itemId, proof.qty);
      this.rewardFloatText(
        x,
        y - 68,
        `+${itemDisplayName(proof.itemId)}`,
        rarityColorHex(this.itemRarity(proof.itemId)),
      );
    }
    if (table) {
      // 歴戦 individuals double every drop chance on top of the player's bonus.
      const dropBonus = gameState.derived.dropRate + (veteran ? VETERAN_MODS.dropBonusAdd : 0);
      const drops = rollDrops(table, this.rng, { firstKill, dropBonus });
      for (const [dropIndex, d] of drops.entries()) {
        earnedDrops.push(d);
        if (completedHunt) {
          this.grantLoot(d.itemId, d.qty);
          this.rewardFloatText(
            x,
            y - 18 - dropIndex * 18,
            `+${itemDisplayName(d.itemId)}×${d.qty}`,
            rarityColorHex(this.itemRarity(d.itemId)),
          );
        } else {
          const angle = -Math.PI / 2 + (Math.PI * 2 * dropIndex) / Math.max(1, drops.length);
          const radius = drops.length > 1 ? 22 : 8;
          const ox = Math.round(Math.cos(angle) * radius) + this.rng.intRange(-3, 3);
          const oy = Math.round(Math.sin(angle) * radius * 0.65) + this.rng.intRange(-2, 3);
          this.spawnLoot(x + ox, y + oy, d.itemId, d.qty);
        }
      }
    }
    const rewardMult = veteran ? VETERAN_MODS.rewardMult : 1;
    let combatGold = 0;
    if (def.goldReward) {
      // 金運 (goldRate) scales combat gold; shop sells stay untouched.
      combatGold = Math.round(def.goldReward * rewardMult * (1 + gameState.derived.goldRate));
      gameState.addGold(combatGold);
      this.rewardFloatText(x + 18, y - 22, `+${combatGold}G`, '#ffe06b');
    }
    const expGain = Math.round(def.expReward * rewardMult);
    gameState.gainExp(expGain);
    if (expGain > 0) {
      this.rewardFloatText(
        x - 14,
        y - (def.isBoss ? 76 : 42),
        `EXP +${expGain}`,
        '#7fe7ff',
      );
    }
    // The active pet learns from watching (share of kill exp → its level).
    if (gameState.activePetId) {
      gameState.gainPetExp(gameState.activePetId, Math.round(expGain * PET_EXP_SHARE));
    }
    if (def.isBoss) {
      gameState.flags[killFlag] = true;
      gameState.flags[`${def.id}_defeated`] = true;
      // Only drop tracking if the TRACKED boss died (a stray second boss's
      // death must not tear down the live one's bar/brain).
      if (!this.boss || this.boss.isDead()) {
        this.boss = null;
        this.cameras.main.zoomTo(renderZoom(this.baseCameraZoom), 240, 'Sine.easeOut');
      }
      this.floatText(x, y - 46, `${def.name} を倒した！`);
    }
    const huntSettled = completedHunt ? turnInQuest(gameState, completedHunt.id) : false;
    if (huntSettled && completedHunt) {
      this.playerInvuln = Math.max(this.playerInvuln, 2000);
      this.scheduleQuestResult(completedHunt, combatGold, expGain, earnedDrops);
    }
    if (def.isBoss || huntSettled) void this.save();
  }

  private completedHuntQuestFor(def: EnemyDef): QuestDef | null {
    for (const qid of gameState.activeQuests) {
      const q = getQuest(qid);
      if (!q?.huntMap || !q.objectives.some((o) => o.enemyId === def.id)) continue;
      if (isComplete(gameState, qid)) return q;
    }
    return null;
  }

  private scheduleQuestResult(quest: QuestDef, combatGold: number, combatExp: number, drops: QuestResultItem[]): void {
    const reportItems = Object.entries(quest.rewards.items ?? {}).map(([itemId, qty]) => ({ itemId, qty }));
    const data: QuestResultData = {
      questName: quest.name,
      rank: quest.rank,
      veteran: quest.veteran,
      investigationThreat: quest.investigation?.threat,
      investigationRewardRank: quest.investigation?.rewardRank,
      combatGold,
      combatExp,
      drops,
      reportGold: Math.round((quest.rewards.gold ?? 0) * (1 + gameState.derived.goldRate)),
      reportExp: quest.rewards.exp ?? 0,
      reportItems,
      craftableEquipment: craftableEquipmentIds(),
      jobUnlock: quest.rewards.setFlags?.includes('quest_tier4_trial'),
      ending: quest.rewards.setFlags?.includes('main_story_complete'),
    };
    this.time.delayedCall(1050, () => {
      if (this.transitioning || this.playerDead || !this.scene.isActive() || this.scene.isPaused()) return;
      this.scene.pause();
      this.scene.launch('QuestResult', data);
    });
  }

  /** MH-style quest-clear ceremony: banner band + fanfare, then fades out. */
  private showQuestClearBanner(questName: string): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = Math.round(cam.height * 0.34);
    const band = this.add
      .rectangle(cx, cy, cam.width, 92, 0x0e0f1a, 0.85)
      .setScrollFactor(0)
      .setDepth(8600)
      .setScale(1, 0.06);
    const edge = (dy: number): Phaser.GameObjects.Rectangle =>
      this.add
        .rectangle(cx, cy + dy, cam.width, 2, 0xffd86b, 0.9)
        .setScrollFactor(0)
        .setDepth(8601)
        .setAlpha(0);
    const top = edge(-46);
    const bottom = edge(46);
    const mk = (dy: number, msg: string, size: string, color: string, bold = false): Phaser.GameObjects.Text =>
      this.add
        .text(cx, cy + dy, msg, {
          fontFamily: FONT,
          fontSize: size,
          color,
          fontStyle: bold ? 'bold' : 'normal',
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(8601)
        .setAlpha(0);
    const l1 = mk(-20, 'クエスト達成！', '24px', '#ffd86b', true);
    const l2 = mk(10, `「${questName}」`, '14px', '#ffffff');
    const l3 = mk(30, '町の掲示板で報酬を受取ろう', '10px', '#9aa0b5');
    bus.emit('sfx:play', { id: 'fanfare' });
    this.tweens.add({ targets: band, scaleY: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [top, bottom, l1, l2, l3], alpha: 1, duration: 220, delay: 140 });
    this.time.delayedCall(2700, () => {
      this.tweens.add({
        targets: [band, top, bottom, l1, l2, l3],
        alpha: 0,
        duration: 420,
        onComplete: () => [band, top, bottom, l1, l2, l3].forEach((o) => o.destroy()),
      });
    });
  }

  private spawnLoot(x: number, y: number, itemId: string, qty: number): void {
    // Generic loot pickup icon (a small gem) — NOT the slime sprite, which made
    // drops look like half-size slimes. Generated once, tinted per rarity.
    if (!this.textures.exists('loot_gem')) {
      const pts = [
        new Phaser.Math.Vector2(7, 0),
        new Phaser.Math.Vector2(14, 7),
        new Phaser.Math.Vector2(7, 14),
        new Phaser.Math.Vector2(0, 7),
      ];
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1);
      g.fillPoints(pts, true);
      g.lineStyle(2, 0x000000, 0.5);
      g.strokePoints(pts, true, true);
      g.generateTexture('loot_gem', 14, 14);
      g.destroy();
    }
    const drop = this.loot.create(x, y, 'loot_gem') as Phaser.Physics.Arcade.Image;
    drop.setOrigin(0.5, 0.5);
    drop.setData('itemId', itemId);
    drop.setData('qty', qty);
    drop.setDisplaySize(20, 20);
    drop.setDepth(Math.round(y) + 2);

    const rank = this.itemRank(itemId);
    const color = rarityColor(this.itemRarity(itemId));
    const colorHex = rarityColorHex(this.itemRarity(itemId));
    drop.setTint(color);

    // Every drop gets a dark well, a rarity ring, and a persistent name. The
    // map is intentionally colourful, so relying on tint alone made common
    // materials almost disappear into grass and flowers.
    const halo = this.add
      .circle(x, y, 14, 0x07111e, 0.86)
      .setStrokeStyle(rank >= 5 ? 3 : 2, color, 0.96)
      .setDepth(Math.round(y) + 1);
    const labelText = `${itemDisplayName(itemId)}${qty > 1 ? `  ×${qty}` : ''}`;
    const dropLabel = this.add
      .text(x, y - 17, labelText, {
        fontFamily: FONT,
        fontSize: '10px',
        color: colorHex,
        fontStyle: 'bold',
        backgroundColor: '#071321',
        padding: { x: 4, y: 2 },
        stroke: '#02060d',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 1)
      .setDepth(8998);
    drop.setData('halo', halo);
    drop.setData('dropLabel', dropLabel);

    const targetScaleX = drop.scaleX;
    const targetScaleY = drop.scaleY;
    drop.setScale(targetScaleX * 0.55, targetScaleY * 0.55);
    this.tweens.add({
      targets: drop,
      scaleX: targetScaleX,
      scaleY: targetScaleY,
      duration: 220,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: halo,
      alpha: rank >= 5 ? 0.42 : 0.62,
      scale: rank >= 5 ? 1.15 : 1.08,
      duration: rank >= 5 ? 520 : 760,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    // Rare drops also receive a vertical light beam, but the name and ring
    // above ensure even common drops remain unmistakable.
    if (rank >= 3) {
      const h = 24 + Math.max(0, rank - 3) * 8;
      const beam = this.add
        .rectangle(x, y - h / 2, rank >= 8 ? 7 : rank >= 5 ? 5 : 3, h, color, 0.42)
        .setDepth(Math.round(y) - 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      drop.setData('beam', beam);
      drop.setData('beamHeight', h);
      this.tweens.add({
        targets: beam,
        alpha: 0.12,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    bus.emit('loot:dropped', { itemId, quantity: qty, x, y });
  }

  private itemRarity(id: string): number | undefined {
    return getMaterial(id)?.rarity ?? getEquipment(id)?.rarity;
  }

  private itemRank(id: string): number {
    return rarityRank(this.itemRarity(id));
  }

  private pickup(l: Phaser.Physics.Arcade.Image): void {
    const itemId = l.getData('itemId') as string | undefined;
    if (!itemId) return;
    const qty = (l.getData('qty') as number | undefined) ?? 1;
    this.grantLoot(itemId, qty);
    const label = qty > 1 ? `+${itemDisplayName(itemId)}×${qty}` : `+${itemDisplayName(itemId)}`;
    this.rewardFloatText(l.x, l.y - 24, label, rarityColorHex(this.itemRarity(itemId)));
    this.destroyLootDecoration(l);
    l.destroy();
  }

  private grantLoot(itemId: string, qty: number): void {
    if (getMaterial(itemId)) gameState.addMaterial(itemId, qty);
    else if (getConsumable(itemId)) {
      gameState.addConsumable(itemId, qty);
      bus.emit('item:picked-up', { itemId, quantity: qty });
    }
    else if (getPetItem(itemId)) {
      // Eggs go to the bag; hatching happens on the pet screen (🐾).
      for (let i = 0; i < qty; i++) gameState.addEgg(itemId);
      bus.emit('item:picked-up', { itemId, quantity: qty });
      this.floatText(this.player.x, this.player.y - 52, 'たまごを拾った！ペット画面で孵化できる', '#ffd0e8');
    } else if (getEquipment(itemId)) {
      for (let i = 0; i < qty; i++) gameState.addEquipment(itemId);
      bus.emit('item:picked-up', { itemId, quantity: qty });
    }
  }

  private destroyLootDecoration(drop: Phaser.Physics.Arcade.Image): void {
    for (const key of ['halo', 'dropLabel', 'beam']) {
      const obj = drop.getData(key) as Phaser.GameObjects.GameObject | undefined;
      if (!obj) continue;
      this.tweens.killTweensOf(obj);
      obj.destroy();
    }
  }

  private updateLootMagnet(_delta: number): void {
    for (const obj of this.loot.getChildren()) {
      const l = obj as Phaser.Physics.Arcade.Image;
      if (!l.active) continue;
      const halo = l.getData('halo') as Phaser.GameObjects.Arc | undefined;
      const dropLabel = l.getData('dropLabel') as Phaser.GameObjects.Text | undefined;
      const beam = l.getData('beam') as Phaser.GameObjects.Rectangle | undefined;
      const beamHeight = (l.getData('beamHeight') as number | undefined) ?? 0;
      halo?.setPosition(l.x, l.y);
      dropLabel?.setPosition(l.x, l.y - 17);
      beam?.setPosition(l.x, l.y - beamHeight / 2);
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, l.x, l.y);
      if (dist <= LOOT_PICKUP_RADIUS) {
        this.pickup(l);
        continue;
      }
      if (dist <= LOOT_MAGNET_RADIUS) {
        const pull = 1 + (LOOT_MAGNET_RADIUS - dist) / LOOT_MAGNET_RADIUS;
        this.physics.moveToObject(l, this.player.body, LOOT_MAGNET_SPEED * pull);
      } else {
        l.setVelocity(0, 0);
      }
    }
  }

  /** Celebratory feedback when the active job levels up (from kills). */
  private onLevelUp(level: number): void {
    const x = this.player.x;
    const y = this.player.y - 52;
    const t = this.add
      .text(x, y, `Lv UP! ${level}`, {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffe06b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(9001);
    this.tweens.add({ targets: t, y: y - 26, duration: 700, ease: 'Cubic.Out' });
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 700,
      duration: 500,
      onComplete: () => t.destroy(),
    });
    const ring = this.add
      .circle(this.player.x, this.player.y - 18, 8, 0xffe06b, 0)
      .setStrokeStyle(2, 0xffe06b, 0.9)
      .setDepth(9000);
    this.tweens.add({
      targets: ring,
      scale: 3,
      alpha: 0,
      duration: 500,
      onComplete: () => ring.destroy(),
    });
  }

  private floatText(x: number, y: number, msg: string, color = '#ffe9a8'): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: FONT,
        fontSize: '11px',
        color,
      })
      .setOrigin(0.5)
      .setDepth(9000);
    this.tweens.add({ targets: t, y: y - 16, duration: 260, ease: 'Cubic.Out' });
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 750,
      duration: 450,
      onComplete: () => t.destroy(),
    });
  }

  /** Write current player position into the state, then persist the slot. */
  private save(): Promise<void> {
    gameState.x = this.player.x;
    gameState.y = this.player.y;
    gameState.mapId = this.map.id;
    return this.persist();
  }

  private persist(): Promise<void> {
    gameState.flags['saved_any'] = true;
    return saveManager.write(gameState.toSave(gameState.slot));
  }

  /** Travel through a portal: persist target, then fade + rebuild the scene. */
  private toMap(p: BuiltPortal): void {
    const target = getMap(p.to);
    const sp = target ? spawnPoint(target, p.toSpawn) : { x: 180, y: 180 };
    gameState.mapId = p.to;
    gameState.x = sp.x;
    gameState.y = sp.y;
    this.transitionRestart(true);
  }

  private transitionRestart(saveFirst: boolean): void {
    if (this.transitioning) return;
    this.transitioning = true;
    if (saveFirst) void this.persist();
    let restarted = false;
    const restart = (): void => {
      if (restarted || !this.scene.isActive()) return;
      restarted = true;
      this.scene.restart();
    };
    this.cameras.main.fadeOut(150);
    this.cameras.main.once('camerafadeoutcomplete', restart);
    // Mobile browsers can occasionally lose the camera completion event while
    // several hit/flash effects end together. Never leave input locked behind
    // `transitioning` if that happens.
    this.time.delayedCall(420, restart);
  }

  update(_time: number, delta: number): void {
    if (this.scene.isPaused() || this.transitioning) return;

    // While defeated, just let the death animation/fade play out.
    if (this.playerDead) {
      this.player.update(delta);
      return;
    }

    if (this.bossIntroLockMs > 0) {
      this.bossIntroLockMs -= delta;
      this.player.setMovement(0, 0);
      this.player.update(delta);
      this.updateBossBar();
      input.endFrame();
      return;
    }

    const v = this.ui.getStickVector();
    this.player.setMovement(v.x, v.y);

    if (input.dodge.justPressed && this.dodgeCd <= 0 && this.player.roll(v.x, v.y)) {
      // Short i-frames so a well-timed roll beats blasts/bullets/contact.
      this.dodgeCd = 900;
      this.playerInvuln = Math.max(this.playerInvuln, 340);
      bus.emit('skill:cooldown', { slot: 2, duration: this.dodgeCd });
      bus.emit('sfx:play', { id: 'dodge' });
      this.spawnRollDust();
    }
    if (input.attack.justPressed || (input.attack.down && !this.player.isAttacking())) {
      this.player.attack(this.facingFromStick(v));
    }
    if (input.skill1.justPressed) this.useSkill(0);
    if (input.skill2.justPressed) this.useSkill(1);
    if (input.interact.justPressed && this.activeNpc) this.runNpc(this.activeNpc);

    this.player.update(delta);
    this.hudPositionTimer -= delta;
    if (this.hudPositionTimer <= 0) {
      this.hudPositionTimer = 100;
      bus.emit('world:player-position', { mapId: this.map.id, x: this.player.x, y: this.player.y });
    }
    this.pet?.update(delta, this.player.x, this.player.y);
    this.updatePetAssist(delta);
    for (const e of this.enemies) e.update(delta, this.player.x, this.player.y);
    this.separateNormalEnemies();
    this.updateCombatTarget(delta);
    this.questGuideTimer -= delta;
    if (this.questGuideTimer <= 0) {
      this.questGuideTimer = 180;
      this.updateQuestGuide();
    }
    if (this.boss && !this.boss.isDead()) {
      this.bossStagger?.update(delta);
      const cadence = this.investigationCondition?.mechanic === 'frenzy' && this.investigationFrenzy
        ? this.investigationCondition.cadenceMult
        : 1;
      this.bossBrain?.update(delta, cadence);
      this.updateInvestigationCondition(delta);
    }
    this.updateBullets(delta);
    this.updatePlayerBolts(delta);
    this.updateLootMagnet(delta);
    if (gameState.tempBuffs.length > 0) gameState.expireBuffs(this.time.now);

    const lead = 28;
    this.cameras.main.setFollowOffset(-v.x * lead, -v.y * lead);

    // Timers.
    if (this.playerInvuln > 0) {
      this.playerInvuln -= delta;
      this.player.doll.container.setAlpha(Math.floor(this.time.now / 80) % 2 ? 0.5 : 1);
    } else {
      this.player.doll.container.setAlpha(1);
    }
    for (let i = 0; i < this.skillCd.length; i++) {
      if (this.skillCd[i] > 0) this.skillCd[i] -= delta;
    }
    if (this.dodgeCd > 0) this.dodgeCd -= delta;
    if (this.portalLock > 0) this.portalLock -= delta;
    if (this.portalHintCd > 0) this.portalHintCd -= delta;
    if (this.portalGuard > 0) this.portalGuard -= delta;

    if (gameState.mp < gameState.derived.maxMp) {
      this.mpRegenTimer += delta;
      while (this.mpRegenTimer >= 700) {
        this.mpRegenTimer -= 700;
        gameState.mp = Math.min(gameState.derived.maxMp, gameState.mp + 1);
        bus.emit('player:mp-changed', { current: gameState.mp, max: gameState.derived.maxMp });
      }
    } else {
      this.mpRegenTimer = 0;
    }

    this.updateBossBar();
    this.updateNpcProximity();
    this.checkPortals();

    this.autoSaveTimer += delta;
    if (this.autoSaveTimer >= 30000) {
      this.autoSaveTimer = 0;
      void this.save();
    }

    input.endFrame();
  }

  /**
   * Keep ordinary monsters readable as a pack without turning narrow paths
   * into hard body-blocks. A small velocity nudge preserves some overlap but
   * stops several sprites, HP plates and shadows from occupying one point.
   */
  private separateNormalEnemies(): void {
    const alive = this.enemies.filter((enemy) => {
      if (enemy.isDead()) return false;
      const def = getEnemyDef(this.enemyTypes.get(enemy) ?? '');
      return def !== undefined && !def.isBoss;
    });
    const minDistSq = NORMAL_ENEMY_SEPARATION * NORMAL_ENEMY_SEPARATION;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        if (distSq >= minDistSq) continue;
        if (distSq < 0.01) {
          dx = (i + j) % 2 === 0 ? 1 : -1;
          dy = 0;
          distSq = 1;
        }
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const nudge = Math.min(24, (NORMAL_ENEMY_SEPARATION - dist) * 2);
        const av = (a.sprite.body as Phaser.Physics.Arcade.Body).velocity;
        const bv = (b.sprite.body as Phaser.Physics.Arcade.Body).velocity;
        a.sprite.setVelocity(av.x - nx * nudge, av.y - ny * nudge);
        b.sprite.setVelocity(bv.x + nx * nudge, bv.y + ny * nudge);
      }
    }
  }

  private updateBossBar(): void {
    if (!this.bossBar) return;
    if (this.boss && !this.boss.isDead() && this.bossMaxHp > 0) {
      const hpRatio = Phaser.Math.Clamp(this.boss.hp / this.bossMaxHp, 0, 1);
      this.bossBar.hpFill.scaleX = hpRatio;
      this.bossBar.hpText.setText(`${Math.ceil(hpRatio * 100)}%`);
      if (this.bossBar.staggerFill && this.bossBar.staggerLabel && this.bossStagger) {
        const down = this.bossStagger.isDown;
        this.bossBar.staggerFill.scaleX = down ? 1 : this.bossStagger.ratio;
        this.bossBar.staggerFill.setFillStyle(down ? 0x77d7aa : 0xe5b83f);
        this.bossBar.staggerLabel
          .setText(down ? 'DOWN' : 'ひるみ')
          .setColor(down ? '#a8f0c8' : '#ffe39a');
      }
    } else {
      this.bossBar.root.destroy(true);
      this.bossBar = null;
      this.bossStagger = null;
      bus.emit('boss:bar', { active: false });
    }
  }

  private updateNpcProximity(): void {
    let nearest: BuiltNpc | null = null;
    let best = 40;
    for (const n of this.npcs) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, n.x, n.y);
      if (d < best) {
        best = d;
        nearest = n;
      }
    }
    if (nearest !== this.activeNpc) {
      this.activeNpc = nearest;
      this.ui.showInteract(nearest !== null);
      if (nearest) this.maybeShowNpcHint(nearest);
    }
  }

  /** Keep one nearby normal enemy visually selected, with a compact live HP bar. */
  private updateCombatTarget(delta: number): void {
    this.combatTargetScanMs -= delta;
    this.combatTargetLockMs = Math.max(0, this.combatTargetLockMs - delta);
    const currentInvalid = !this.combatTarget
      || this.combatTarget.isDead()
      || Phaser.Math.Distance.Between(this.player.x, this.player.y, this.combatTarget.x, this.combatTarget.y) > 190;
    if (currentInvalid) {
      this.combatTarget = null;
      this.combatTargetLockMs = 0;
    }

    if (this.combatTargetScanMs <= 0 && this.combatTargetLockMs <= 0) {
      this.combatTargetScanMs = 120;
      let nearest: Enemy | null = null;
      let best = 150;
      for (const enemy of this.enemies) {
        if (enemy.isDead()) continue;
        const def = getEnemyDef(this.enemyTypes.get(enemy) ?? '');
        if (!def || def.isBoss) continue;
        const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
        if (distance < best) {
          best = distance;
          nearest = enemy;
        }
      }
      this.combatTarget = nearest;
    }

    this.updateCombatTargetUi();
  }

  private updateCombatTargetUi(): void {
    const target = this.combatTarget;
    const def = target ? getEnemyDef(this.enemyTypes.get(target) ?? '') : undefined;
    if (!target || target.isDead() || !def || def.isBoss) {
      if (this.combatTargetUi) {
        this.combatTargetUi.ring.setVisible(false);
        this.combatTargetUi.hpBg.setVisible(false);
        this.combatTargetUi.hpFill.setVisible(false);
        this.combatTargetUi.name.setVisible(false);
      }
      if (this.lastCombatTargetKey !== 'off') {
        this.lastCombatTargetKey = 'off';
        bus.emit('combat:target', { active: false });
      }
      return;
    }

    if (!this.combatTargetUi) {
      const ring = this.add
        .ellipse(0, 0, 58, 22, 0xffd86b, 0.12)
        .setStrokeStyle(2, 0xffd86b, 0.95);
      const hpBg = this.add
        .rectangle(0, 0, 68, 7, 0x090b14, 0.9)
        .setStrokeStyle(1, 0xffffff, 0.28);
      const hpFill = this.add.rectangle(0, 0, 64, 3, 0xf05f67, 1).setOrigin(0, 0.5);
      const name = this.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '9px', color: '#fff2bf', fontStyle: 'bold' })
        .setOrigin(0.5, 1)
        .setShadow(0, 1, '#000000', 2);
      this.combatTargetUi = { ring, hpBg, hpFill, name };
      this.tweens.add({
        targets: ring,
        alpha: 0.42,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }

    const ui = this.combatTargetUi;
    const ratio = Phaser.Math.Clamp(target.hp / target.cfg.maxHp, 0, 1);
    const top = Math.round(target.y - target.visual.displayHeight * 0.88 - 4);
    const depth = Math.round(target.y) + 8;
    ui.ring.setPosition(Math.round(target.x), Math.round(target.y) + 1).setDepth(Math.round(target.y) - 2).setVisible(true);
    ui.hpBg.setPosition(Math.round(target.x), top).setDepth(depth).setVisible(true);
    ui.hpFill.setPosition(Math.round(target.x) - 32, top).setDepth(depth + 1).setScale(ratio, 1).setVisible(true);
    ui.name.setPosition(Math.round(target.x), top - 6).setDepth(depth + 1).setText(def.name).setVisible(true);

    const key = `${def.id}|${Math.max(0, Math.ceil(target.hp))}|${target.cfg.maxHp}`;
    if (key !== this.lastCombatTargetKey) {
      this.lastCombatTargetKey = key;
      bus.emit('combat:target', {
        active: true,
        enemyId: def.id,
        name: def.name,
        current: Math.max(0, Math.ceil(target.hp)),
        max: target.cfg.maxHp,
      });
    }
  }

  /**
   * Navigation for the first hunt: town gate -> nearest live target -> town
   * return -> quest board. Targets are recomputed because enemies wander.
   */
  private updateQuestGuide(): void {
    if (!gameState.activeQuests.includes(INTRO_QUEST_ID)) {
      this.publishQuestGuide({ active: false });
      return;
    }
    const quest = getQuest(INTRO_QUEST_ID);
    if (!quest) {
      this.publishQuestGuide({ active: false });
      return;
    }

    let target: { x: number; y: number; hint: string } | null = null;
    if (isComplete(gameState, INTRO_QUEST_ID)) {
      if (this.map.id === 'town') {
        const board = this.npcs.find((npc) => npc.action === 'quest');
        if (board) target = { x: board.x, y: board.y, hint: '掲示板で報告' };
      } else {
        const portal =
          this.portals.find((p) => p.to === 'town') ??
          this.portals.find((p) => p.to === 'field');
        if (portal) {
          target = { x: portal.rect.centerX, y: portal.rect.centerY, hint: '町へ戻ろう' };
        }
      }
    } else {
      const objective = quest.objectives.find(
        (o) => objectiveProgress(gameState, INTRO_QUEST_ID, o.enemyId) < o.count,
      );
      if (objective) {
        let nearest: Enemy | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const enemy of this.enemies) {
          if (enemy.isDead() || this.enemyTypes.get(enemy) !== objective.enemyId) continue;
          const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
          if (distance < nearestDistance) {
            nearest = enemy;
            nearestDistance = distance;
          }
        }
        const progress = objectiveProgress(gameState, INTRO_QUEST_ID, objective.enemyId);
        const enemyName = getEnemyDef(objective.enemyId)?.name ?? objective.enemyId;
        if (nearest) {
          target = { x: nearest.x, y: nearest.y, hint: `${enemyName} ${progress}/${objective.count}` };
        } else {
          const spawn = (this.map.enemies ?? []).find((enemy) => enemy.type === objective.enemyId);
          if (spawn) {
            target = { x: spawn.x, y: spawn.y, hint: `${enemyName} ${progress}/${objective.count}` };
          }
        }
      }

      if (!target) {
        const portal =
          this.portals.find((p) => p.to === 'field') ??
          this.portals.find((p) => p.to === 'town');
        if (portal) {
          target = {
            x: portal.rect.centerX,
            y: portal.rect.centerY,
            hint: this.map.id === 'town' ? '北門へ' : '草原へ戻ろう',
          };
        }
      }
    }

    if (!target) {
      this.publishQuestGuide({ active: false });
      return;
    }
    const dx = target.x - this.player.x;
    const dy = target.y - this.player.y;
    this.publishQuestGuide({
      active: true,
      mapId: this.map.id,
      targetX: target.x,
      targetY: target.y,
      distance: Math.max(1, Math.round(Math.hypot(dx, dy) / 16)),
      angle: Math.atan2(dy, dx),
      hint: target.hint,
    });
  }

  /** High-contrast, longer-lived feedback reserved for earned rewards. */
  private rewardFloatText(x: number, y: number, msg: string, color: string): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: FONT,
        fontSize: '13px',
        color,
        fontStyle: 'bold',
        stroke: '#02060d',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(9004)
      .setScale(0.88);
    t.setShadow(0, 2, '#000000', 3);
    this.tweens.add({
      targets: t,
      y: y - 24,
      scale: 1,
      duration: 460,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: t,
      alpha: 0,
      delay: 1150,
      duration: 380,
      onComplete: () => t.destroy(),
    });
  }

  private publishQuestGuide(guide: GameEvents['quest:guide']): void {
    const key = guide.active
      ? [
          guide.mapId,
          guide.hint,
          guide.distance,
          Math.round(guide.angle * 20),
          Math.round(guide.targetX / 4),
          Math.round(guide.targetY / 4),
        ].join('|')
      : 'off';
    if (key === this.lastQuestGuideKey) return;
    this.lastQuestGuideKey = key;
    bus.emit('quest:guide', guide);
  }

  /**
   * First-contact hint: the first time the player nears an NPC of a given kind,
   * float a small speech bubble ("ここでクエストを受注！" etc). Recorded per
   * action in the save so it never repeats. Complements the intro tutorial.
   */
  private maybeShowNpcHint(npc: BuiltNpc): void {
    if (!npc.action) return;
    const text = npcHintFor(npc.action);
    if (!text) return;
    const flag = npcHintFlag(npc.action);
    if (gameState.flags[flag]) return;
    gameState.flags[flag] = true;
    bus.emit('save:written', { slot: -1 });

    const y = npc.y - 40;
    const label = this.add
      .text(0, 0, text, { fontFamily: FONT, fontSize: '10px', color: '#fff5d8' })
      .setOrigin(0.5)
      .setDepth(9002);
    const bubble = ninePanel(this, npc.x, y, label.width + 20, 26).setDepth(9001);
    label.setPosition(npc.x, y);
    const kill = (): void => {
      label.destroy();
      bubble.destroy();
    };
    this.tweens.add({ targets: [label, bubble], y: y - 6, duration: 260, ease: 'Cubic.Out' });
    this.tweens.add({ targets: [label, bubble], alpha: 0, delay: 2600, duration: 500, onComplete: kill });
  }

  private checkPortals(): void {
    if (this.portalLock > 0) return;
    for (const p of this.portals) {
      if (!Phaser.Geom.Rectangle.Contains(p.rect, this.player.x, this.player.y)) continue;
      if (this.portalGuard > 0) {
        // Recently hit: don't warp off a knockback. Hint so it doesn't read
        // as a broken portal when standing on it deliberately.
        if (this.portalHintCd <= 0) {
          this.floatText(this.player.x, this.player.y - 44, '被弾直後は移動できない');
          this.portalHintCd = 1200;
        }
        return;
      }
      if (p.requiresFlag && !gameState.flags[p.requiresFlag]) {
        if (this.portalHintCd <= 0) {
          this.floatText(this.player.x, this.player.y - 44, 'ボスを倒すと進める');
          this.portalHintCd = 1600;
        }
        return;
      }
      this.toMap(p);
      return;
    }
  }

  private runNpc(npc: BuiltNpc): void {
    if (npc.action === 'item') this.openMenu('Shop');
    else if (npc.action === 'craft') this.openMenu('Crafting');
    else if (npc.action === 'job') this.openMenu('JobChange');
    else if (npc.action === 'quest') this.openMenu('QuestBoard');
    else if (npc.dialogueId) this.openMenu('Dialogue', { id: this.dialogueFor(npc.dialogueId) });
  }

  private dialogueFor(id: string): string {
    if (id !== 'elder_intro') return id;
    if (gameState.completedQuests.includes(INTRO_QUEST_ID)) return 'elder_after_intro';
    if (gameState.activeQuests.includes(INTRO_QUEST_ID)) {
      return isComplete(gameState, INTRO_QUEST_ID) ? 'elder_report_intro' : 'elder_active_intro';
    }
    return id;
  }

  /** Pause the world and launch a modal overlay scene by key. */
  private openMenu(key: string, data?: object): void {
    if (this.transitioning || this.scene.isPaused() || this.scene.isActive(key)) return;
    this.scene.pause();
    this.scene.launch(key, data);
  }

  private facingFromStick(v: { x: number; y: number }): Direction | undefined {
    if (Math.hypot(v.x, v.y) < 0.2) return undefined;
    return directionFromVector(v.x, v.y, this.player.getDirection());
  }

  private openInventory(tab?: 'items' | 'consumables' | 'equipment'): void {
    if (this.transitioning || this.scene.isPaused() || this.scene.isActive('Inventory')) return;
    this.scene.pause();
    this.scene.launch('Inventory', { tab });
  }
}

/** Offset ahead of the player in the given facing. */
function aheadOffset(dir: Direction, reach: number): { ax: number; ay: number } {
  const vector = directionVector(dir);
  return { ax: vector.x * reach, ay: vector.y * reach };
}
