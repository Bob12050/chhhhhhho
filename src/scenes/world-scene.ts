import Phaser from 'phaser';
import { Player } from '@/player/player';
import { Enemy } from '@/enemies/enemy';
import { getEnemyDef, type EnemyDef } from '@/enemies/enemy-defs';
import { DamageNumbers } from '@/combat/damage-numbers';
import { gameState } from '@/player/game-state';
import { getEquipment, getConsumable, getMaterial, itemDisplayName } from '@/data/items';
import { visualTexture } from '@/equipment/visuals';
import { TEX } from '@/assets/gen/textures';
import { Rng } from '@/core/rng';
import { getDropTable, rollDrops } from '@/loot/drop-table';
import { getSkill } from '@/skills/skill-defs';
import { input } from '@/input/input-state';
import { bus } from '@/core/event-bus';
import { saveManager } from '@/save/save-manager';
import { getMap, spawnPoint, type MapDef } from '@/maps/map-def';
import { buildMap, type BuiltPortal } from '@/maps/map-builder';
import type { UIScene } from '@/scenes/ui-scene';
import type { Direction } from '@/config/layers';
import type { EquipSlot } from '@/equipment/slots';

interface BuiltNpc {
  x: number;
  y: number;
  action?: string;
}

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
  private skillCd: number[] = [0, 0];
  private autoSaveTimer = 0;
  private mpRegenTimer = 0;
  private portalLock = 0; // ms; blocks portal re-trigger right after arrival
  private transitioning = false;
  private busOff: Array<() => void> = [];
  private rng = new Rng();

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
    this.skillCd = [0, 0];
    this.autoSaveTimer = 0;
    this.mpRegenTimer = 0;
    this.portalLock = 600;
    this.transitioning = false;
    this.rng = new Rng((Date.now() ^ 0x9e3779b9) >>> 0);

    this.map = getMap(gameState.mapId) ?? getMap('town')!;

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

    // Player.
    this.player = new Player(this, gameState.x, gameState.y);
    this.applyEquipmentVisuals();
    this.player.setMoveSpeed(gameState.derived.moveSpeed);
    this.player.onAttackHit = (dir) => this.resolveMelee(dir, 1.0, 18);
    this.cameras.main.startFollow(this.player.body, true, 0.15, 0.15);
    this.physics.add.collider(this.player.body, this.obstacles);

    // Combat / loot.
    this.dmg = new DamageNumbers(this);
    this.loot = this.physics.add.group();
    this.physics.add.overlap(this.player.body, this.loot, (_p, l) =>
      this.pickup(l as Phaser.Physics.Arcade.Image),
    );

    for (const e of this.map.enemies ?? []) this.spawnEnemy(e.type, e.x, e.y);
    for (const n of this.map.npcs ?? []) this.spawnNpc(n.x, n.y, n.label, n.action);

    // Listeners (unsubscribed on shutdown to avoid accumulation on re-entry).
    this.busOff.push(
      bus.on('equipment:changed', () => {
        this.applyEquipmentVisuals();
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
        fontFamily: 'system-ui, sans-serif',
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

  private applyEquipmentVisuals(): void {
    const slots: EquipSlot[] = ['head', 'torso', 'main_hand'];
    for (const slot of slots) {
      const id = gameState.equipment[slot];
      const def = id ? getEquipment(id) : undefined;
      this.player.setEquipVisual(slot, def ? visualTexture(def.visualId) : null);
    }
  }

  private spawnEnemy(type: string, x: number, y: number): void {
    const def = getEnemyDef(type);
    if (!def) return;
    const enemy = new Enemy(this, x, y, {
      textureKey: def.textureKey,
      maxHp: def.maxHp,
      moveSpeed: def.moveSpeed,
      contactDamage: def.contactDamage,
      aggroRange: def.aggroRange,
      attackRange: def.attackRange,
    });
    this.physics.add.collider(enemy.sprite, this.obstacles);
    this.physics.add.overlap(this.player.body, enemy.sprite, () => this.onContact(enemy));
    enemy.onDeath = (dx, dy) => this.onEnemyDeath(dx, dy, def);
    this.enemies.push(enemy);
  }

  private spawnNpc(x: number, y: number, label: string, action?: string): void {
    const sprite = this.physics.add.staticImage(x, y, TEX.npc).setOrigin(0.5, 0.875);
    sprite.setDepth(Math.round(y));
    this.add
      .text(x, y - 58, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#ffe',
      })
      .setOrigin(0.5)
      .setDepth(Math.round(y) + 1);
    this.npcs.push({ x, y, action });
  }

  private onContact(enemy: Enemy): void {
    if (enemy.isDead() || this.playerInvuln > 0) return;
    this.playerInvuln = 700;
    gameState.hp = Math.max(0, gameState.hp - enemy.cfg.contactDamage);
    bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
    this.dmg.show(this.player.x, this.player.y - 40, enemy.cfg.contactDamage, false);
    this.cameras.main.shake(120, 0.006);
    const ang = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    this.player.body.setVelocity(Math.cos(ang) * 160, Math.sin(ang) * 160);
    if (gameState.hp <= 0) this.onPlayerDown();
  }

  private onPlayerDown(): void {
    gameState.fullHeal();
    const town = getMap('town');
    const sp = town ? spawnPoint(town, 'default') : { x: 180, y: 820 };
    gameState.mapId = 'town';
    gameState.x = sp.x;
    gameState.y = sp.y;
    this.transitionRestart(true);
  }

  /** Melee/skill hit resolution in front of the player. */
  private resolveMelee(
    dir: Direction,
    mult: number,
    knockback: number,
    reach = 30,
    half = 34,
  ): void {
    const { ax, ay } = aheadOffset(dir, reach);
    const hx = this.player.x + ax;
    const hy = this.player.y + ay;
    let hitStop = false;
    for (const e of this.enemies) {
      if (e.isDead()) continue;
      if (Phaser.Math.Distance.Between(hx, hy, e.x, e.y) <= half) {
        const base = gameState.derived.physAtk;
        const crit = Math.random() < gameState.derived.critRate;
        const amount = Math.max(1, Math.round(base * mult * (crit ? 1.6 : 1)));
        e.takeDamage(amount, this.player.x, this.player.y, knockback);
        this.dmg.show(e.x, e.y - 42, amount, crit);
        bus.emit('combat:damage-dealt', { x: e.x, y: e.y, amount, crit });
        hitStop = true;
      }
    }
    if (hitStop) this.hitStop(60);
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
    this.player.play('cast');
    const dir = this.player.getDirection();
    this.spawnSkillEffect(dir);
    this.time.delayedCall(120, () =>
      this.resolveMelee(dir, def.powerMult ?? 1.5, def.knockback ?? 26, def.reach ?? 30, def.radius ?? 34),
    );
  }

  private spawnSkillEffect(dir: Direction): void {
    const { ax, ay } = aheadOffset(dir, 30);
    const fx = this.add.circle(this.player.x + ax, this.player.y - 30 + ay, 6, 0x9cd2ff, 0.85);
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
    const table = def.dropTableId ? getDropTable(def.dropTableId) : undefined;
    if (table) {
      const drops = rollDrops(table, this.rng, { firstKill: false });
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
  }

  private spawnLoot(x: number, y: number, itemId: string, qty: number): void {
    const drop = this.loot.create(x, y, TEX.slime, 0) as Phaser.Physics.Arcade.Image;
    drop.setScale(0.5);
    drop.setOrigin(0.5, 0.875);
    drop.setData('itemId', itemId);
    drop.setData('qty', qty);
    drop.setDepth(Math.round(y));
  }

  private pickup(l: Phaser.Physics.Arcade.Image): void {
    const itemId = l.getData('itemId') as string | undefined;
    if (!itemId) return;
    const qty = (l.getData('qty') as number | undefined) ?? 1;
    if (getMaterial(itemId)) gameState.addMaterial(itemId, qty);
    else if (getConsumable(itemId)) gameState.addConsumable(itemId, qty);
    else if (getEquipment(itemId)) for (let i = 0; i < qty; i++) gameState.addEquipment(itemId);
    const label = qty > 1 ? `+${itemDisplayName(itemId)}×${qty}` : `+${itemDisplayName(itemId)}`;
    this.floatText(l.x, l.y - 18, label);
    l.destroy();
  }

  private floatText(x: number, y: number, msg: string): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#ffe9a8',
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

    const v = this.ui.getStickVector();
    this.player.setMovement(v.x, v.y);

    if (input.attack.justPressed || (input.attack.down && !this.player.isAttacking())) {
      this.player.attack(this.facingFromStick(v));
    }
    if (input.skill1.justPressed) this.useSkill(0);
    if (input.skill2.justPressed) this.useSkill(1);
    if (input.interact.justPressed && this.activeNpc) this.runNpc(this.activeNpc);

    this.player.update(delta);
    for (const e of this.enemies) e.update(delta, this.player.x, this.player.y);

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

    this.updateNpcProximity();
    this.checkPortals();

    this.autoSaveTimer += delta;
    if (this.autoSaveTimer >= 30000) {
      this.autoSaveTimer = 0;
      void this.save();
    }

    input.endFrame();
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
      if (Phaser.Geom.Rectangle.Contains(p.rect, this.player.x, this.player.y)) {
        this.toMap(p);
        return;
      }
    }
  }

  private runNpc(npc: BuiltNpc): void {
    if (npc.action === 'equip') this.openInventory('equipment');
    else if (npc.action === 'craft') this.openCrafting();
  }

  private openCrafting(): void {
    if (this.transitioning || this.scene.isPaused() || this.scene.isActive('Crafting')) return;
    this.scene.pause();
    this.scene.launch('Crafting');
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
