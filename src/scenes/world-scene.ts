import Phaser from 'phaser';
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
import { getSkill } from '@/skills/skill-defs';
import { recordKill, isComplete } from '@/quests/quests';
import { getQuest, type QuestDef } from '@/quests/quest-defs';
import { currentWave, concurrentSpawnCount, VETERAN_MODS } from '@/quests/hunt-logic';
import { PET_EXP_SHARE, petAttackDamage } from '@/pets/pet-growth';
import { mitigateDamage } from '@/combat/mitigation';
import { input } from '@/input/input-state';
import { bus } from '@/core/event-bus';
import { saveManager } from '@/save/save-manager';
import { getMap, spawnPoint, type MapDef } from '@/maps/map-def';
import { buildMap, type BuiltPortal } from '@/maps/map-builder';
import type { UIScene } from '@/scenes/ui-scene';
import type { Direction } from '@/config/layers';
import { FONT, ninePanel } from '@/ui/theme';
import { npcHintFor, npcHintFlag } from '@/tutorial/tutorial-defs';
import { bgm, bgmForMap } from '@/audio/bgm-engine';
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

interface BuiltNpc {
  x: number;
  y: number;
  action?: string;
  dialogueId?: string;
}

/** Delay before a defeated normal enemy respawns at its post (farmability). */
const RESPAWN_MS = 8000;

/**
 * Generic world scene: renders whichever map `gameState.mapId` points at,
 * spawns its enemies/NPCs, and handles movement, combat, one skill, loot,
 * portals (map transitions), interaction, and auto-save. Map content is fully
 * data-driven (`src/data/defs/maps/*.json`).
 */
export class WorldScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
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
  private transitioning = false;
  private npcBob = false;
  private busOff: Array<() => void> = [];
  private rng = new Rng();
  private pet: Pet | null = null;
  private boss: Enemy | null = null;
  private bossBrain: BossBrain | null = null;
  /** Pooled enemy projectiles (mobile-perf rule: projectiles use a pool). */
  private bullets: { obj: Phaser.GameObjects.Arc; vx: number; vy: number; ttl: number; damage: number }[] = [];
  private bulletPool: Phaser.GameObjects.Arc[] = [];
  /** Player skill projectiles (pooled). */
  private pBolts: { obj: Phaser.GameObjects.Arc; vx: number; vy: number; ttl: number; atk: number; mult: number; element: Element }[] = [];
  private pBoltPool: Phaser.GameObjects.Arc[] = [];
  private minions: Enemy[] = [];
  private bossMaxHp = 0;
  private petAtkCd = 0;
  private bossBar: {
    bg: Phaser.GameObjects.Graphics;
    fill: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
  } | null = null;

  constructor() {
    super('World');
  }

  create(): void {
    // Reset per-session state (Phaser reuses the scene instance on restart).
    this.enemies = [];
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
    this.petAtkCd = 0;
    this.transitioning = false;
    this.rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);
    this.pet = null;
    this.boss = null;
    this.bossMaxHp = 0;
    this.bossBar = null;
    // Leaving an arena mid-fight must hand the HUD slot back to the tracker.
    bus.emit('boss:bar', { active: false });
    this.bossBrain = null;
    this.bullets = [];
    this.bulletPool = [];
    this.pBolts = [];
    this.pBoltPool = [];
    this.minions = [];

    this.map = getMap(gameState.mapId) ?? getMap('town')!;
    gameState.flags[`visited_${this.map.id}`] = true;
    bgm.play(bgmForMap(this.map.id));
    // Tell the (persistent) HUD whether this is a safe zone (town → dim combat UI).
    bus.emit('world:map-ready', { safe: !!this.map.safe });

    this.ui = this.scene.get('UI') as UIScene;
    this.ui.showInteract(false);

    this.physics.world.setBounds(0, 0, this.map.size.w, this.map.size.h);
    this.cameras.main.setBounds(0, 0, this.map.size.w, this.map.size.h);
    this.cameras.main.roundPixels = true;

    const built = buildMap(this, this.map);
    this.obstacles = built.obstacles;
    this.portals = built.portals;

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
      vg.lineStyle(3, 0x0e0f1a, 0.055 * (1 - i / 10));
      vg.strokeRect(i * 3, i * 3, vw - i * 6, vh - i * 6);
    }

    // Map title flash.
    this.showMapName(this.map.name);

    // Player. Appearance is job-fixed; equipment only changes stats.
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
        // Equipment changes stats only (look is job-fixed); refresh speeds.
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
      for (const off of this.busOff) off();
      this.busOff = [];
    });

    this.cameras.main.fadeIn(150);
    bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
    bus.emit('player:mp-changed', { current: gameState.mp, max: gameState.derived.maxMp });
    bus.emit('gold:changed', { current: gameState.gold });
  }

  private showMapName(name: string): void {
    const t = this.add
      .text(this.scale.width / 2, 70, name, {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#00000066',
        padding: { x: 10, y: 4 },
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
      if (!pick || (q.veteran && !pick.veteran)) pick = q;
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
    const mods = q.veteran
      ? { hpMult: VETERAN_MODS.hpMult, dmgMult: VETERAN_MODS.dmgMult, veteran: true }
      : {};
    // Trash packs fan out around the spawn point so they don't stack.
    const spread: [number, number][] = [[0, 0], [-52, 26], [52, 26], [0, 58]];
    for (let i = alive; i < want; i++) {
      const [ox, oy] = def.isBoss ? [0, 0] : spread[i % spread.length];
      const e = this.spawnEnemy(wave.enemyId, sp.x + ox, sp.y + oy, { respawn: false, ...mods });
      if (e) this.huntLive.set(e, wave.enemyId);
    }
    if (announce) {
      const msg = def.isBoss
        ? `${q.veteran ? '歴戦の' : ''}${def.name} が現れた！`
        : '敵の群れが現れた！';
      this.floatText(sp.x, sp.y - 46, msg, '#ffb26b');
      bus.emit('sfx:play', { id: 'roar' });
    }
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
      attackRange: def.attackRange,
      tint: def.tint ? Phaser.Display.Color.HexStringToColor(def.tint).color : undefined,
      scale: def.scale,
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
    if (def.isBoss) {
      this.boss = enemy;
      this.bossMaxHp = maxHp;
      this.buildBossBar(`${opts?.veteran ? '歴戦の' : ''}${def.name}`);
      if (def.attacks && def.attacks.length > 0) {
        this.bossBrain = new BossBrain(
          this.makeArena(enemy, def),
          def.attacks,
          contactDamage,
          def.enrageAtHpPct,
        );
      }
    }
    return enemy;
  }

  /** Scene services handed to the (engine-independent) BossBrain. */
  private makeArena(boss: Enemy, def: EnemyDef): Arena {
    return {
      bossPos: () => ({ x: boss.x, y: boss.y }),
      playerPos: () => ({ x: this.player.x, y: this.player.y }),
      // cfg.maxHp, NOT def.maxHp: veteran spawns scale HP ×1.6 and the
      // enrage threshold must track the scaled pool or it fires too late.
      hpPct: () => Math.max(0, boss.hp) / boss.cfg.maxHp,
      telegraph: (x, y, r, ms, onDone) => this.telegraphFx(x, y, r, ms, onDone),
      explode: (x, y, r, dmg) => this.explodeAt(x, y, r, dmg),
      hold: (ms) => boss.castHold(ms),
      dash: (x, y, speed, ms) => boss.beginDash(x, y, speed, ms),
      fireProjectile: (ang, speed, dmg) => this.fireBullet(boss.x, boss.y - 24, ang, speed, dmg),
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
  private telegraphFx(x: number, y: number, radius: number, ms: number, onDone: () => void): void {
    const ring = this.add
      .circle(Math.round(x), Math.round(y), radius, 0xff3030, 0.12)
      .setStrokeStyle(2, 0xff5050, 0.9)
      .setDepth(6);
    const fill = this.add
      .circle(Math.round(x), Math.round(y), radius, 0xff4040, 0.26)
      .setScale(0.06)
      .setDepth(6);
    this.tweens.add({ targets: fill, scale: 1, duration: ms, ease: 'Linear' });
    this.time.delayedCall(ms, () => {
      ring.destroy();
      fill.destroy();
      onDone();
    });
  }

  /** AoE detonation: blast visual + player range check. */
  private explodeAt(x: number, y: number, radius: number, damage: number): void {
    const boom = this.add.circle(Math.round(x), Math.round(y), radius, 0xffa050, 0.5).setDepth(9000);
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
  private fireBullet(x: number, y: number, angle: number, speed: number, damage: number): void {
    const obj =
      this.bulletPool.pop() ??
      this.add.circle(0, 0, 5, 0xff8a5a, 1).setStrokeStyle(1, 0xffd0a0, 0.9).setDepth(9000);
    obj.setPosition(Math.round(x), Math.round(y)).setVisible(true);
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

  /** One-shot enrage cue: roar, shake, red flash, and a lasting reddened tint. */
  private onBossEnrage(boss: Enemy, def: EnemyDef): void {
    const base = def.tint ? Phaser.Display.Color.HexStringToColor(def.tint).color : 0xffffff;
    const r = Math.min(255, ((base >> 16) & 0xff) / 2 + 200);
    const g = ((base >> 8) & 0xff) * 0.55;
    const b = (base & 0xff) * 0.55;
    boss.enrageVisual((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b));
    this.floatText(boss.x, boss.y - 76, '怒り状態！', '#ff6a5a');
    this.cameras.main.shake(240, 0.008);
    this.flashScreen(0xff3020, 0.18, 260);
    bus.emit('sfx:play', { id: 'roar' });
  }

  /**
   * Boss HP card. Lives in the quest tracker's slot just BELOW the player
   * status panel — the old top-of-screen bar sat behind the panel and was
   * invisible during every boss fight. The HUD tracker hides while this is
   * up (boss:bar event); it returns when the boss dies.
   */
  private buildBossBar(name: string): void {
    // Rebuilding (sequential hunts in one visit) must not orphan the old bar.
    if (this.bossBar) {
      this.bossBar.bg.destroy();
      this.bossBar.fill.destroy();
      this.bossBar.label.destroy();
      this.bossBar = null;
    }
    const w = this.scale.width;
    const x = 8;
    const y = 116; // statusPanel bottom + margin (same slot as the tracker)
    const cardW = w - 16;
    const cardH = 42;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(8000);
    bg.fillStyle(0x1a0e14, 0.88);
    bg.fillRoundedRect(x, y, cardW, cardH, 7);
    bg.fillStyle(0xcc3a4a, 0.95);
    bg.fillRoundedRect(x, y, 3, cardH, { tl: 7, bl: 7, tr: 0, br: 0 });
    bg.lineStyle(1, 0xff8090, 0.18);
    bg.strokeRoundedRect(x, y, cardW, cardH, 7);
    // Empty groove under the fill so lost HP reads clearly.
    bg.fillStyle(0x000000, 0.5);
    bg.fillRoundedRect(x + 10, y + 24, cardW - 20, 10, 4);
    const label = this.add
      .text(x + 10, y + 4, name, { fontFamily: FONT, fontSize: '12px', color: '#ffd0d8' })
      .setScrollFactor(0)
      .setDepth(8002);
    const fill = this.add
      .rectangle(x + 11, y + 29, cardW - 22, 8, 0xcc3a4a)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(8001);
    this.bossBar = { bg, fill, label };
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
      quest: TEX.npcElder,
    };
    const tex = byAction[action ?? ''] ?? TEX.npcVillager;
    const sprite = this.physics.add.staticImage(x, y, tex).setOrigin(0.5, 0.875);
    sprite.setDepth(Math.round(y));
    this.add.image(x, y + 2, TEX.groundShadow).setDisplaySize(24, 9).setDepth(Math.round(y) - 1);
    this.npcSprites.push(sprite);
    // Subtle per-villager tint variety (generic townsfolk only).
    if (tex === TEX.npcVillager) {
      let h = 0;
      for (const ch of label + (dialogueId ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      sprite.setTint([0xffffff, 0xffe0c8, 0xd8e4ff, 0xd8ffe0, 0xffe0f0][h % 5]);
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
    const amount = mitigateDamage(
      raw,
      kind === 'mag' ? gameState.derived.magDef : gameState.derived.def,
    );
    gameState.hp = Math.max(0, gameState.hp - amount);
    bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
    this.dmg.show(this.player.x, this.player.y - 40, amount, false);
    this.player.hurt();
    bus.emit('sfx:play', { id: 'hurt' });
    this.cameras.main.shake(120, 0.006);
    this.flashScreen(0xff2a2a, 0.32, 180);
    const ang = Math.atan2(this.player.y - fromY, this.player.x - fromX);
    this.player.body.setVelocity(Math.cos(ang) * 160, Math.sin(ang) * 160);
    if (gameState.hp <= 0) this.onPlayerDown();
  }

  private onPlayerDown(): void {
    if (this.playerDead) return;
    this.playerDead = true;
    this.playerInvuln = 999999;
    this.player.die();
    this.cameras.main.shake(200, 0.008);
    // Let the death flash/fade read before respawning in town.
    this.time.delayedCall(700, () => {
      gameState.fullHeal();
      const town = getMap('town');
      const sp = town ? spawnPoint(town, 'default') : { x: 180, y: 820 };
      gameState.mapId = 'town';
      gameState.x = sp.x;
      gameState.y = sp.y;
      this.transitionRestart(true);
    });
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
  ): { killed: boolean; crit: boolean } {
    const crit = Math.random() < gameState.derived.critRate;
    const elemMult = elementMultiplier(element, e.cfg.weakness, e.cfg.resist);
    const weak = elemMult > 1;
    const amount = Math.max(1, Math.round(atk * mult * (crit ? 1.6 : 1) * elemMult));
    const killed = e.takeDamage(amount, this.player.x, this.player.y, knockback);
    // Elemental hits color the number; a super-effective hit reads red.
    const color = element !== 'none' ? elementColorHex(element) : undefined;
    const sparkColor = weak ? 0xff5a5a : element !== 'none' ? ELEMENT_COLOR[element] : 0xffffff;
    this.dmg.show(e.x, e.y - 42, amount, crit, weak ? '#ff5a5a' : color);
    this.spawnHitSpark(e.x, e.y - 22, crit, sparkColor);
    bus.emit('combat:damage-dealt', { x: e.x, y: e.y, amount, crit });
    // 吸血 (lifesteal): boss-gear special — heal a fraction of dealt damage.
    const ls = gameState.derived.lifesteal;
    if (ls > 0 && gameState.hp < gameState.derived.maxHp && !this.playerDead) {
      const heal = Math.max(1, Math.round(amount * ls));
      gameState.hp = Math.min(gameState.derived.maxHp, gameState.hp + heal);
      bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
      this.dmg.show(this.player.x, this.player.y - 48, heal, false, '#e36a9f');
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
  ): void {
    const { ax, ay } = aheadOffset(dir, reach);
    const hx = this.player.x + ax;
    const hy = this.player.y + ay;
    let hitStop = false;
    let anyCrit = false;
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      if (Phaser.Math.Distance.Between(hx, hy, e.x, e.y) <= half) {
        const { crit } = this.hitEnemy(e, atk, mult, knockback, element);
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
    if (this.skillCd[slot] > 0) return;
    const id = gameState.skillSlots[slot];
    if (!id) return;
    const def = getSkill(id);
    if (!def || def.type !== 'active') return;
    const cost = def.mpCost ?? 0;
    if (gameState.mp < cost) return;
    gameState.mp -= cost;
    bus.emit('player:mp-changed', { current: gameState.mp, max: gameState.derived.maxMp });
    this.skillCd[slot] = def.cooldown ?? 800;
    bus.emit('skill:cooldown', { slot, duration: this.skillCd[slot] });
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
          this.hitEnemy(e, b.atk, b.mult, 14, b.element);
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
    recordKill(gameState, def.id); // advance active quest objectives
    this.notifyHuntComplete(def);
    this.scheduleHuntWaves(); // 連続狩猟: next wave after this kill
    const killFlag = `boss_${def.id}_killed`;
    const firstKill = !!def.isBoss && !gameState.flags[killFlag];
    const table = def.dropTableId ? getDropTable(def.dropTableId) : undefined;
    if (table) {
      // 歴戦 individuals double every drop chance on top of the player's bonus.
      const dropBonus = gameState.derived.dropRate + (veteran ? VETERAN_MODS.dropBonusAdd : 0);
      const drops = rollDrops(table, this.rng, { firstKill, dropBonus });
      for (const d of drops) {
        const ox = this.rng.intRange(-12, 12);
        const oy = this.rng.intRange(-6, 10);
        this.spawnLoot(x + ox, y + oy, d.itemId, d.qty);
      }
    }
    const rewardMult = veteran ? VETERAN_MODS.rewardMult : 1;
    if (def.goldReward) {
      // 金運 (goldRate) scales combat gold; shop sells stay untouched.
      const gold = Math.round(def.goldReward * rewardMult * (1 + gameState.derived.goldRate));
      gameState.addGold(gold);
      this.floatText(x + 14, y - 24, `+${gold}G`);
    }
    const expGain = Math.round(def.expReward * rewardMult);
    gameState.gainExp(expGain);
    // The active pet learns from watching (share of kill exp → its level).
    if (gameState.activePetId) {
      gameState.gainPetExp(gameState.activePetId, Math.round(expGain * PET_EXP_SHARE));
    }
    if (def.isBoss) {
      gameState.flags[killFlag] = true;
      gameState.flags[`${def.id}_defeated`] = true;
      // Only drop tracking if the TRACKED boss died (a stray second boss's
      // death must not tear down the live one's bar/brain).
      if (!this.boss || this.boss.isDead()) this.boss = null;
      this.floatText(x, y - 46, `${def.name} を倒した！`);
      void this.save();
    }
  }

  /** Show a hunt-complete banner when killing this enemy finishes a hunt quest. */
  private notifyHuntComplete(def: EnemyDef): void {
    for (const qid of gameState.activeQuests) {
      const q = getQuest(qid);
      if (!q?.huntMap || !q.objectives.some((o) => o.enemyId === def.id)) continue;
      if (isComplete(gameState, qid)) {
        this.showQuestClearBanner(q.name);
        break;
      }
    }
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
    drop.setDepth(Math.round(y));

    // Rarity feedback: tint the pickup and, for rare+ drops, raise a pulsing
    // light beam (classic loot signal). Alpha-only animation keeps it
    // pixel-art friendly (no blur/free-scale).
    // Thresholds on the R1〜R10 scale: pulse for アンコモン+ (R3), beam for
    // レア+ (R5), thicker beam for レジェンド+ (R8).
    const rank = this.itemRank(itemId);
    drop.setTint(rarityColor(this.itemRarity(itemId)));
    if (rank >= 3) {
      this.tweens.add({
        targets: drop,
        alpha: 0.55,
        duration: 480,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
    if (rank >= 5) {
      const color = rarityColor(this.itemRarity(itemId));
      const h = 28 + Math.max(0, rank - 5) * 10;
      const beam = this.add
        .rectangle(x, y - h / 2, rank >= 8 ? 6 : 4, h, color, 0.5)
        .setDepth(Math.round(y) - 1)
        .setBlendMode(Phaser.BlendModes.ADD);
      drop.setData('beam', beam);
      this.tweens.add({
        targets: beam,
        alpha: 0.15,
        duration: 520,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
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
    if (getMaterial(itemId)) gameState.addMaterial(itemId, qty);
    else if (getConsumable(itemId)) gameState.addConsumable(itemId, qty);
    else if (getPetItem(itemId)) {
      // Eggs go to the bag; hatching happens on the pet screen (🐾).
      for (let i = 0; i < qty; i++) gameState.addEgg(itemId);
      this.floatText(this.player.x, this.player.y - 52, 'たまごを拾った！ペット画面で孵化できる', '#ffd0e8');
    } else if (getEquipment(itemId)) for (let i = 0; i < qty; i++) gameState.addEquipment(itemId);
    const label = qty > 1 ? `+${itemDisplayName(itemId)}×${qty}` : `+${itemDisplayName(itemId)}`;
    this.floatText(l.x, l.y - 18, label, rarityColorHex(this.itemRarity(itemId)));
    (l.getData('beam') as Phaser.GameObjects.Rectangle | undefined)?.destroy();
    l.destroy();
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
    this.cameras.main.fadeOut(150);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart());
  }

  update(_time: number, delta: number): void {
    if (this.scene.isPaused() || this.transitioning) return;

    // While defeated, just let the death animation/fade play out.
    if (this.playerDead) {
      this.player.update(delta);
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
    this.pet?.update(delta, this.player.x, this.player.y);
    this.updatePetAssist(delta);
    for (const e of this.enemies) e.update(delta, this.player.x, this.player.y);
    if (this.boss && !this.boss.isDead()) this.bossBrain?.update(delta);
    this.updateBullets(delta);
    this.updatePlayerBolts(delta);
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

  private updateBossBar(): void {
    if (!this.bossBar) return;
    if (this.boss && !this.boss.isDead() && this.bossMaxHp > 0) {
      this.bossBar.fill.scaleX = Phaser.Math.Clamp(this.boss.hp / this.bossMaxHp, 0, 1);
    } else {
      this.bossBar.bg.destroy();
      this.bossBar.fill.destroy();
      this.bossBar.label.destroy();
      this.bossBar = null;
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
    else if (npc.dialogueId) this.openMenu('Dialogue', { id: npc.dialogueId });
  }

  /** Pause the world and launch a modal overlay scene by key. */
  private openMenu(key: string, data?: object): void {
    if (this.transitioning || this.scene.isPaused() || this.scene.isActive(key)) return;
    this.scene.pause();
    this.scene.launch(key, data);
  }

  private facingFromStick(v: { x: number; y: number }): Direction | undefined {
    if (Math.abs(v.x) < 0.2 && Math.abs(v.y) < 0.2) return undefined;
    if (Math.abs(v.x) > Math.abs(v.y)) return v.x > 0 ? 'right' : 'left';
    return v.y > 0 ? 'down' : 'up';
  }

  private openInventory(tab?: 'items' | 'consumables' | 'equipment'): void {
    if (this.transitioning || this.scene.isPaused() || this.scene.isActive('Inventory')) return;
    this.scene.pause();
    this.scene.launch('Inventory', { tab });
  }
}

/** Offset ahead of the player in the given facing. */
function aheadOffset(dir: Direction, reach: number): { ax: number; ay: number } {
  switch (dir) {
    case 'up':
      return { ax: 0, ay: -reach };
    case 'down':
      return { ax: 0, ay: reach };
    case 'left':
      return { ax: -reach, ay: 0 };
    case 'right':
      return { ax: reach, ay: 0 };
  }
}
