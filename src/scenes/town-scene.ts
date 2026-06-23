import Phaser from 'phaser';
import { Player } from '@/player/player';
import { Enemy } from '@/enemies/enemy';
import { DamageNumbers } from '@/combat/damage-numbers';
import { gameState } from '@/player/game-state';
import { getEquipment, itemDisplayName } from '@/data/items';
import { visualTexture } from '@/equipment/visuals';
import { TEX } from '@/assets/gen/textures';
import { input } from '@/input/input-state';
import { bus } from '@/core/event-bus';
import { saveManager } from '@/save/save-manager';
import type { UIScene } from '@/scenes/ui-scene';
import type { Direction } from '@/config/layers';
import type { EquipSlot } from '@/equipment/slots';

const MAP_W = 360;
const MAP_H = 960;
const SAVE_SLOT = 0;

/**
 * Phase 0 town/test map. Vertical (portrait) layout: spawn at the bottom, NPC
 * and goal near the top. Integrates movement, attack, one skill, a slime, loot,
 * pickups, contact damage, and auto-save.
 */
export class TownScene extends Phaser.Scene {
  private player!: Player;
  private enemies: Enemy[] = [];
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private loot!: Phaser.Physics.Arcade.Group;
  private dmg!: DamageNumbers;
  private npc!: Phaser.Physics.Arcade.Image;
  private ui!: UIScene;

  private playerInvuln = 0;
  private skillCd = 0;
  private autoSaveTimer = 0;
  private mpRegenTimer = 0;
  private nearNpc = false;

  constructor() {
    super('Town');
  }

  create(): void {
    this.ui = this.scene.get('UI') as UIScene;

    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.roundPixels = true;

    this.buildMap();

    // Player.
    this.player = new Player(this, gameState.x, gameState.y);
    this.applyEquipmentVisuals();
    this.player.setMoveSpeed(gameState.derived.moveSpeed);
    this.player.onAttackHit = (dir) => this.resolveMelee(dir, 1.0, 18);

    // Camera follow with look-ahead.
    this.cameras.main.startFollow(this.player.body, true, 0.15, 0.15);

    // Collisions.
    this.physics.add.collider(this.player.body, this.obstacles);

    // Enemies.
    this.dmg = new DamageNumbers(this);
    this.spawnSlime(180, 520);
    this.spawnSlime(120, 420);
    this.spawnSlime(250, 360);

    // Loot pickups.
    this.loot = this.physics.add.group();
    this.physics.add.overlap(this.player.body, this.loot, (_p, l) =>
      this.pickup(l as Phaser.Physics.Arcade.Image),
    );

    // Re-apply visuals when equipment changes (from the equipment screen).
    bus.on('equipment:changed', () => {
      this.applyEquipmentVisuals();
      this.player.setMoveSpeed(gameState.derived.moveSpeed);
    });

    // Auto-save triggers.
    bus.on('app:visibility-hidden', () => void this.save());
    bus.on('save:written', ({ slot }) => {
      if (slot === -1) void this.save(); // equipment screen close hint
    });

    bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
    bus.emit('player:mp-changed', { current: gameState.mp, max: gameState.derived.maxMp });
  }

  private buildMap(): void {
    // Ground.
    this.add.tileSprite(0, 0, MAP_W, MAP_H, TEX.tileGrass).setOrigin(0).setDepth(-1000);
    // Vertical path up the middle.
    this.add
      .tileSprite(MAP_W / 2 - 32, 0, 64, MAP_H, TEX.tilePath)
      .setOrigin(0)
      .setDepth(-999);

    this.obstacles = this.physics.add.staticGroup();
    // Border of trees (leave the path open at top/bottom).
    const place = (x: number, y: number): void => {
      const o = this.obstacles.create(x, y, TEX.obstacle) as Phaser.Physics.Arcade.Image;
      o.setDepth(Math.round(y));
      o.refreshBody();
    };
    for (let y = 16; y < MAP_H; y += 32) {
      place(16, y);
      place(MAP_W - 16, y);
    }
    // A few scattered trees off the path.
    for (const [x, y] of [
      [70, 250],
      [290, 280],
      [80, 600],
      [300, 640],
      [110, 760],
    ] as const) {
      place(x, y);
    }

    // NPC near the top-center (clear of finger zone, easy to reach).
    this.npc = this.physics.add.staticImage(MAP_W / 2, 150, TEX.npc).setOrigin(0.5, 0.875);
    this.npc.setDepth(150);
    this.add
      .text(MAP_W / 2, 92, '装備屋', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#ffe',
      })
      .setOrigin(0.5)
      .setDepth(151);
  }

  private applyEquipmentVisuals(): void {
    const slots: EquipSlot[] = ['head', 'torso', 'main_hand'];
    for (const slot of slots) {
      const id = gameState.equipment[slot];
      const def = id ? getEquipment(id) : undefined;
      this.player.setEquipVisual(slot, def ? visualTexture(def.visualId) : null);
    }
  }

  private spawnSlime(x: number, y: number): void {
    const enemy = new Enemy(this, x, y, {
      textureKey: TEX.slime,
      maxHp: 14,
      moveSpeed: 42,
      contactDamage: 4,
      aggroRange: 110,
      attackRange: 18,
    });
    this.physics.add.collider(enemy.sprite, this.obstacles);
    this.physics.add.overlap(this.player.body, enemy.sprite, () => this.onContact(enemy));
    enemy.onDeath = (dx, dy) => this.onEnemyDeath(dx, dy);
    this.enemies.push(enemy);
  }

  private onContact(enemy: Enemy): void {
    if (enemy.isDead() || this.playerInvuln > 0) return;
    this.playerInvuln = 700;
    gameState.hp = Math.max(0, gameState.hp - enemy.cfg.contactDamage);
    bus.emit('player:hp-changed', { current: gameState.hp, max: gameState.derived.maxHp });
    this.dmg.show(this.player.x, this.player.y - 40, enemy.cfg.contactDamage, false);
    this.cameras.main.shake(120, 0.006);
    // Knockback player away from enemy.
    const ang = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
    this.player.body.setVelocity(Math.cos(ang) * 160, Math.sin(ang) * 160);
    if (gameState.hp <= 0) this.onPlayerDown();
  }

  private onPlayerDown(): void {
    // Phase 0: respawn at town spawn, full heal.
    gameState.fullHeal();
    this.player.body.setPosition(180, 820);
    void this.save();
  }

  /** Melee/skill hit resolution in front of the player. */
  private resolveMelee(dir: Direction, mult: number, knockback: number): void {
    const reach = 34;
    const half = 26;
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
        const killed = e.takeDamage(amount, this.player.x, this.player.y, knockback);
        this.dmg.show(e.x, e.y - 42, amount, crit);
        bus.emit('combat:damage-dealt', { x: e.x, y: e.y, amount, crit });
        hitStop = true;
        void killed;
      }
    }
    if (hitStop) this.hitStop(60);
  }

  /** Brief global hit-stop for impact feel. */
  private hitStop(ms: number): void {
    this.physics.world.isPaused = true;
    this.time.delayedCall(ms, () => {
      this.physics.world.isPaused = false;
    });
  }

  private useSkill1(): void {
    if (this.skillCd > 0) return;
    const cost = 5;
    if (gameState.mp < cost) return;
    gameState.mp -= cost;
    bus.emit('player:mp-changed', { current: gameState.mp, max: gameState.derived.maxMp });
    this.skillCd = 900;
    this.player.play('cast');
    this.spawnSkillEffect(this.player.getDirection());
    // Slightly stronger, wider forward strike.
    this.time.delayedCall(120, () => this.resolveMelee(this.player.getDirection(), 1.6, 26));
  }

  /** A quick forward slash arc so the skill is visibly distinct from a swing. */
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

  private onEnemyDeath(x: number, y: number): void {
    this.enemies = this.enemies.filter((e) => !e.isDead());
    // Drop one material (Phase 0: slime jelly).
    const drop = this.loot.create(x, y, TEX.obstacle) as Phaser.Physics.Arcade.Image;
    drop.setTexture(TEX.slime, 0);
    drop.setScale(0.5);
    drop.setOrigin(0.5, 0.875);
    drop.setData('itemId', 'slime_jelly');
    drop.setDepth(Math.round(y));
    gameState.gainExp(8);
  }

  private pickup(l: Phaser.Physics.Arcade.Image): void {
    const itemId = l.getData('itemId') as string | undefined;
    if (!itemId) return;
    gameState.addMaterial(itemId, 1);
    this.floatText(l.x, l.y - 18, `+${itemDisplayName(itemId)}`);
    l.destroy();
  }

  /** Small floating label that rises and fades (pickup / status feedback). */
  private floatText(x: number, y: number, msg: string): void {
    const t = this.add
      .text(x, y, msg, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5)
      .setDepth(9000);
    this.tweens.add({
      targets: t,
      y: y - 22,
      alpha: 0,
      duration: 700,
      ease: 'Cubic.Out',
      onComplete: () => t.destroy(),
    });
  }

  private save(): Promise<void> {
    gameState.x = this.player.x;
    gameState.y = this.player.y;
    gameState.mapId = 'town';
    return saveManager.write(gameState.toSave(SAVE_SLOT));
  }

  update(_time: number, delta: number): void {
    if (this.scene.isPaused()) return;

    // Movement from stick (touch) / keyboard (dev), routed via UIScene.
    const v = this.ui.getStickVector();
    this.player.setMovement(v.x, v.y);

    if (input.attack.justPressed || (input.attack.down && !this.player.isAttacking())) {
      this.player.attack(this.facingFromStick(v));
    }
    if (input.skill1.justPressed) this.useSkill1();
    if (input.interact.justPressed && this.nearNpc) this.openEquipment();

    this.player.update(delta);
    for (const e of this.enemies) e.update(delta, this.player.x, this.player.y);

    // Camera look-ahead toward movement.
    const lead = 28;
    this.cameras.main.setFollowOffset(-v.x * lead, -v.y * lead);

    // Timers.
    if (this.playerInvuln > 0) {
      this.playerInvuln -= delta;
      this.player.doll.container.setAlpha(Math.floor(this.time.now / 80) % 2 ? 0.5 : 1);
    } else {
      this.player.doll.container.setAlpha(1);
    }
    if (this.skillCd > 0) this.skillCd -= delta;

    // Slow MP regen so the skill stays usable during a play session.
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

    // NPC proximity -> interact prompt.
    const near = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.npc.x, this.npc.y) < 40;
    if (near !== this.nearNpc) {
      this.nearNpc = near;
      this.ui.showInteract(near);
    }

    // Periodic auto-save (every 30s).
    this.autoSaveTimer += delta;
    if (this.autoSaveTimer >= 30000) {
      this.autoSaveTimer = 0;
      void this.save();
    }

    input.endFrame();
  }

  private facingFromStick(v: { x: number; y: number }): Direction | undefined {
    if (Math.abs(v.x) < 0.2 && Math.abs(v.y) < 0.2) return undefined;
    if (Math.abs(v.x) > Math.abs(v.y)) return v.x > 0 ? 'right' : 'left';
    return v.y > 0 ? 'down' : 'up';
  }

  private openEquipment(): void {
    this.scene.pause();
    this.scene.launch('Equipment');
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
