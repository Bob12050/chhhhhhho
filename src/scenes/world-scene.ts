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
import { getQuest } from '@/quests/quest-defs';
import { input } from '@/input/input-state';
import { bus } from '@/core/event-bus';
import { saveManager } from '@/save/save-manager';
import { getMap, spawnPoint, type MapDef } from '@/maps/map-def';
import { buildMap, type BuiltPortal } from '@/maps/map-builder';
import type { UIScene } from '@/scenes/ui-scene';
import type { Direction } from '@/config/layers';
import { FONT } from '@/ui/theme';
import {
  elementMultiplier,
  statusFromElement,
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
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private loot!: Phaser.Physics.Arcade.Group;
  private dmg!: DamageNumbers;
  private ui!: UIScene;

  private map!: MapDef;
  private portals: BuiltPortal[] = [];
  private npcs: BuiltNpc[] = [];
  private activeNpc: BuiltNpc | null = null;

  private playerInvuln = 0;
  private playerDead = false;
  private skillCd: number[] = [0, 0];
  private autoSaveTimer = 0;
  private mpRegenTimer = 0;
  private portalLock = 0; // ms; blocks portal re-trigger right after arrival
  private portalHintCd = 0; // ms; throttles the "defeat the boss" hint
  private transitioning = false;
  private busOff: Array<() => void> = [];
  private rng = new Rng();
  private pet: Pet | null = null;
  private boss: Enemy | null = null;
  private bossBrain: BossBrain | null = null;
  /** Pooled enemy projectiles (mobile-perf rule: projectiles use a pool). */
  private bullets: { obj: Phaser.GameObjects.Arc; vx: number; vy: number; ttl: number; damage: number }[] = [];
  private bulletPool: Phaser.GameObjects.Arc[] = [];
  private minions: Enemy[] = [];
  private bossMaxHp = 0;
  private bossBar: {
    bg: Phaser.GameObjects.Rectangle;
    fill: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
  } | null = null;

  constructor() {
    super('World');
  }

  create(): void {
    // Reset per-session state (Phaser reuses the scene instance on restart).
    this.enemies = [];
    this.portals = [];
    this.npcs = [];
    this.activeNpc = null;
    this.playerInvuln = 0;
    this.playerDead = false;
    this.skillCd = [0, 0];
    this.autoSaveTimer = 0;
    this.mpRegenTimer = 0;
    this.portalLock = 600;
    this.portalHintCd = 0;
    this.transitioning = false;
    this.rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);
    this.pet = null;
    this.boss = null;
    this.bossMaxHp = 0;
    this.bossBar = null;
    this.bossBrain = null;
    this.bullets = [];
    this.bulletPool = [];
    this.minions = [];

    this.map = getMap(gameState.mapId) ?? getMap('town')!;
    gameState.flags[`visited_${this.map.id}`] = true;

    this.ui = this.scene.get('UI') as UIScene;
    this.ui.showInteract(false);

    this.physics.world.setBounds(0, 0, this.map.size.w, this.map.size.h);
    this.cameras.main.setBounds(0, 0, this.map.size.w, this.map.size.h);
    this.cameras.main.roundPixels = true;

    const built = buildMap(this, this.map);
    this.obstacles = built.obstacles;
    this.portals = built.portals;

    // Map title flash.
    this.showMapName(this.map.name);

    // Player. Appearance is job-fixed; equipment only changes stats.
    this.player = new Player(this, gameState.x, gameState.y);
    this.player.setJobAppearance(gameState.jobId);
    this.player.setMoveSpeed(gameState.derived.moveSpeed);
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
    for (const n of this.map.npcs ?? []) this.spawnNpc(n.x, n.y, n.label, n.action, n.dialogueId);
    this.spawnPetIfAny();

    // Listeners (unsubscribed on shutdown to avoid accumulation on re-entry).
    this.busOff.push(
      bus.on('equipment:changed', () => {
        // Equipment changes stats only (look is job-fixed); just refresh speed.
        this.player.setMoveSpeed(gameState.derived.moveSpeed);
      }),
    );
    this.busOff.push(
      bus.on('job:changed', () => {
        this.player.setJobAppearance(gameState.jobId);
        this.player.setMoveSpeed(gameState.derived.moveSpeed);
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
   * Monster-Hunter style hunts: for every active quest whose `huntMap` is the
   * current map, spawn its (still-unfinished) target enemies. The boss returns
   * each time you enter while the quest is active, so repeatable hunts let you
   * farm materials. A central 'boss' spawn point is used if defined.
   */
  private spawnHuntTargets(): void {
    const seen = new Set<string>();
    for (const qid of gameState.activeQuests) {
      const q = getQuest(qid);
      if (!q || q.huntMap !== this.map.id) continue;
      for (const obj of q.objectives) {
        if (seen.has(obj.enemyId)) continue;
        seen.add(obj.enemyId);
        const sp = spawnPoint(this.map, 'boss');
        this.spawnEnemy(obj.enemyId, sp.x, sp.y);
      }
    }
  }

  private spawnEnemy(
    type: string,
    x: number,
    y: number,
    opts?: { respawn?: boolean },
  ): Enemy | undefined {
    const def = getEnemyDef(type);
    if (!def) return undefined;
    const enemy = new Enemy(this, x, y, {
      textureKey: def.textureKey,
      maxHp: def.maxHp,
      moveSpeed: def.moveSpeed,
      contactDamage: def.contactDamage,
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
      this.onEnemyDeath(dx, dy, def);
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
      this.bossMaxHp = def.maxHp;
      this.buildBossBar(def.name);
      if (def.attacks && def.attacks.length > 0) {
        this.bossBrain = new BossBrain(
          this.makeArena(enemy, def),
          def.attacks,
          def.contactDamage,
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
      hpPct: () => Math.max(0, boss.hp) / def.maxHp,
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
      if (hit) this.damagePlayer(b.damage, b.obj.x, b.obj.y);
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

  private buildBossBar(name: string): void {
    const w = this.scale.width;
    const bg = this.add.rectangle(w / 2, 30, w - 40, 14, 0x000000, 0.55).setScrollFactor(0).setDepth(8000);
    const fill = this.add
      .rectangle(20, 30, w - 44, 9, 0xcc3a4a)
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(8001);
    const label = this.add
      .text(w / 2, 30, name, { fontFamily: FONT, fontSize: '10px', color: '#fff' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8002);
    this.bossBar = { bg, fill, label };
  }

  private spawnPetIfAny(): void {
    if (this.pet || !gameState.activePetId) return;
    const def = getPet(gameState.activePetId);
    if (def) this.pet = new Pet(this, this.player.x - 18, this.player.y + 8, def);
  }

  private spawnNpc(x: number, y: number, label: string, action?: string, dialogueId?: string): void {
    const sprite = this.physics.add.staticImage(x, y, TEX.npc).setOrigin(0.5, 0.875);
    sprite.setDepth(Math.round(y));
    this.add
      .text(x, y - 58, label, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#ffe',
        // Dark backing keeps labels readable over bright building walls.
        backgroundColor: '#00000066',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(Math.round(y) + 1);
    this.npcs.push({ x, y, action, dialogueId });
  }

  private onContact(enemy: Enemy): void {
    if (enemy.isDead()) return;
    this.damagePlayer(enemy.cfg.contactDamage, enemy.x, enemy.y);
  }

  /** Apply damage to the player (shared by contact + attack strikes).
   *  Respects the post-hit invulnerability window. */
  private damagePlayer(amount: number, fromX: number, fromY: number): void {
    if (this.playerInvuln > 0 || this.playerDead) return;
    this.playerInvuln = 700;
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
        const base = atk;
        const crit = Math.random() < gameState.derived.critRate;
        const elemMult = elementMultiplier(element, e.cfg.weakness, e.cfg.resist);
        const weak = elemMult > 1;
        const amount = Math.max(1, Math.round(base * mult * (crit ? 1.6 : 1) * elemMult));
        const killed = e.takeDamage(amount, this.player.x, this.player.y, knockback);
        // Elemental hits color the number; a super-effective hit reads red.
        const color =
          element !== 'none'
            ? `#${ELEMENT_COLOR[element].toString(16).padStart(6, '0')}`
            : undefined;
        this.dmg.show(e.x, e.y - 42, amount, crit, weak ? '#ff5a5a' : color);
        this.spawnHitSpark(e.x, e.y - 22, crit);
        bus.emit('combat:damage-dealt', { x: e.x, y: e.y, amount, crit });
        // On-hit status proc (only on a live enemy; weakness improves the odds).
        if (!killed && element !== 'none') {
          const st = statusFromElement(element);
          if (st && Math.random() < STATUS_PROC_CHANCE * (weak ? 1.5 : 1)) {
            if (STATUS_CATEGORY[st] === 'stun') e.applyStatus(st, 900, 0);
            else e.applyStatus(st, 3000, Math.max(1, Math.round(atk * 0.25)));
          }
        }
        hitStop = true;
        anyCrit = anyCrit || crit;
      }
    }
    if (hitStop) {
      this.hitStop(60);
      this.cameras.main.shake(anyCrit ? 90 : 60, anyCrit ? 0.005 : 0.0028);
      bus.emit('sfx:play', { id: anyCrit ? 'crit' : 'hit' });
    }
  }

  /** Quick crescent slash in the attack direction (basic-attack juice). */
  private spawnSlash(dir: Direction): void {
    const { ax, ay } = aheadOffset(dir, 1);
    const ang = Math.atan2(ay, ax);
    const cx = this.player.x + ax * 12;
    const cy = this.player.y - 24 + ay * 12;
    const g = this.add.graphics().setDepth(Math.round(this.player.y) + 2);
    g.lineStyle(3, 0xffffff, 0.9);
    g.beginPath();
    g.arc(cx, cy, 18, ang - 1.0, ang + 1.0, false);
    g.strokePath();
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 160,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
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
  private spawnHitSpark(x: number, y: number, crit: boolean): void {
    const color = crit ? 0xffd24a : 0xffffff;
    const spark = this.add
      .circle(Math.round(x), Math.round(y), crit ? 5 : 3, color, 0.95)
      .setDepth(9000);
    this.tweens.add({
      targets: spark,
      scale: crit ? 3 : 2.2,
      alpha: 0,
      duration: crit ? 260 : 200,
      ease: 'Cubic.Out',
      onComplete: () => spark.destroy(),
    });
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
    this.spawnSkillEffect(dir, def.fx ?? 'magic');
    const atk = def.scaling === 'mag' ? gameState.derived.magAtk : gameState.derived.physAtk;
    // Skill element overrides the weapon's; otherwise the weapon's element rides along.
    const skillEl: Element = isElement(def.element) ? def.element : 'none';
    const element = skillEl !== 'none' ? skillEl : this.weaponElement();
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

  /** The active weapon's element (falls back to 'none' when unarmed/neutral). */
  private weaponElement(): Element {
    const el = gameState.weaponElement();
    return isElement(el) ? el : 'none';
  }

  /** Cast effect, styled per skill (data-driven `fx`: slash | impact | magic). */
  private spawnSkillEffect(dir: Direction, style: string): void {
    if (style === 'slash') this.fxSkillSlash(dir);
    else if (style === 'impact') this.fxSkillImpact(dir);
    else this.fxSkillMagic(dir);
  }

  /** 斬撃: a big bright crescent sweeping across the strike arc. */
  private fxSkillSlash(dir: Direction): void {
    const { ax, ay } = aheadOffset(dir, 1);
    const ang = Math.atan2(ay, ax);
    const cx = Math.round(this.player.x + ax * 14);
    const cy = Math.round(this.player.y - 24 + ay * 14);
    const g = this.add.graphics().setDepth(Math.round(this.player.y) + 2);
    g.lineStyle(5, 0xbfefff, 0.95);
    g.beginPath();
    g.arc(cx, cy, 26, ang - 1.2, ang + 1.2, false);
    g.strokePath();
    g.lineStyle(2, 0xffffff, 1);
    g.beginPath();
    g.arc(cx, cy, 26, ang - 1.2, ang + 1.2, false);
    g.strokePath();
    this.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  /** 強打: a heavy ground shockwave ring plus extra shake (weighty hit). */
  private fxSkillImpact(dir: Direction): void {
    const { ax, ay } = aheadOffset(dir, 22);
    const cx = Math.round(this.player.x + ax);
    const cy = Math.round(this.player.y - 6 + ay);
    const ring = this.add.circle(cx, cy, 8, 0xffd27a, 0).setDepth(Math.round(this.player.y) + 2);
    ring.setStrokeStyle(4, 0xffb24a, 0.95);
    this.tweens.add({
      targets: ring,
      scale: 4.5,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    });
    const flash = this.add.circle(cx, cy, 14, 0xfff2c0, 0.9).setDepth(Math.round(this.player.y) + 3);
    this.tweens.add({
      targets: flash,
      scale: 0.2,
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
    this.cameras.main.shake(120, 0.006);
  }

  /** Default magic burst (expanding blue orb). */
  private fxSkillMagic(dir: Direction): void {
    const { ax, ay } = aheadOffset(dir, 30);
    const fx = this.add.circle(
      Math.round(this.player.x + ax),
      Math.round(this.player.y - 30 + ay),
      6,
      0x9cd2ff,
      0.85,
    );
    fx.setDepth(Math.round(this.player.y) + 1);
    this.tweens.add({
      targets: fx,
      scale: 4,
      alpha: 0,
      duration: 220,
      ease: 'Cubic.Out',
      onComplete: () => fx.destroy(),
    });
  }

  private onEnemyDeath(x: number, y: number, def: EnemyDef): void {
    this.enemies = this.enemies.filter((e) => !e.isDead());
    const burstColor = def.tint
      ? Phaser.Display.Color.HexStringToColor(def.tint).color
      : 0xffffff;
    this.spawnDeathBurst(x, y, burstColor);
    bus.emit('sfx:play', { id: 'enemy_down' });
    gameState.flags['killed_any'] = true;
    recordKill(gameState, def.id); // advance active quest objectives
    this.notifyHuntComplete(def);
    const killFlag = `boss_${def.id}_killed`;
    const firstKill = !!def.isBoss && !gameState.flags[killFlag];
    const table = def.dropTableId ? getDropTable(def.dropTableId) : undefined;
    if (table) {
      const drops = rollDrops(table, this.rng, { firstKill });
      for (const d of drops) {
        const ox = this.rng.intRange(-12, 12);
        const oy = this.rng.intRange(-6, 10);
        this.spawnLoot(x + ox, y + oy, d.itemId, d.qty);
      }
    }
    if (def.goldReward) {
      gameState.addGold(def.goldReward);
      this.floatText(x + 14, y - 24, `+${def.goldReward}G`);
    }
    gameState.gainExp(def.expReward);
    if (def.isBoss) {
      gameState.flags[killFlag] = true;
      gameState.flags[`${def.id}_defeated`] = true;
      this.boss = null;
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
        this.showMapName(`クエスト達成！「${q.name}」\n町の掲示板で報酬を受取ろう`);
        break;
      }
    }
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
      gameState.obtainPetItem(itemId);
      this.spawnPetIfAny();
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

    if (input.attack.justPressed || (input.attack.down && !this.player.isAttacking())) {
      this.player.attack(this.facingFromStick(v));
    }
    if (input.skill1.justPressed) this.useSkill(0);
    if (input.skill2.justPressed) this.useSkill(1);
    if (input.interact.justPressed && this.activeNpc) this.runNpc(this.activeNpc);

    this.player.update(delta);
    this.pet?.update(delta, this.player.x, this.player.y);
    for (const e of this.enemies) e.update(delta, this.player.x, this.player.y);
    if (this.boss && !this.boss.isDead()) this.bossBrain?.update(delta);
    this.updateBullets(delta);

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
    if (this.portalLock > 0) this.portalLock -= delta;
    if (this.portalHintCd > 0) this.portalHintCd -= delta;

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
    }
  }

  private checkPortals(): void {
    if (this.portalLock > 0) return;
    for (const p of this.portals) {
      if (!Phaser.Geom.Rectangle.Contains(p.rect, this.player.x, this.player.y)) continue;
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
    if (npc.action === 'equip') this.openInventory('equipment');
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
