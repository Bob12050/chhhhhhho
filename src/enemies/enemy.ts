import Phaser from 'phaser';
import { frameIndex, ANIMATIONS, type AnimName } from '@/paperdoll/pose-atlas';
import type { Direction } from '@/config/layers';

/**
 * Phase 0 enemy with a small finite-state machine. Enemies use a single
 * finished sprite (NOT the player's paper-doll layer system) for performance.
 * The same pose-atlas frame layout is reused for placeholder animation.
 */
export type EnemyState = 'idle' | 'wander' | 'chase' | 'attack' | 'hurt' | 'return' | 'dead';

export interface EnemyConfig {
  readonly textureKey: string;
  readonly maxHp: number;
  readonly moveSpeed: number;
  readonly contactDamage: number;
  readonly aggroRange: number;
  readonly attackRange: number;
  /** Base tint applied to the sprite (restored after hit-flash). */
  readonly tint?: number;
  readonly scale?: number;
  /** Hover around this distance (hit-and-run); omit for a straight chaser. */
  readonly keepDistance?: number;
  /** 0..1 fraction of knockback ignored (heavy enemies). */
  readonly knockbackResist?: number;
}

export class Enemy {
  readonly sprite: Phaser.Physics.Arcade.Image;
  state: EnemyState = 'idle';
  hp: number;
  readonly cfg: EnemyConfig;

  private readonly scene: Phaser.Scene;
  private readonly homeX: number;
  private readonly homeY: number;
  private dir: Direction = 'down';
  private anim: AnimName = 'idle';
  private frame = 0;
  private frameElapsed = 0;
  private stateTimer = 0;
  private wanderTarget = new Phaser.Math.Vector2();
  private knockback = 0;
  private flashTimer = 0;
  private dead = false;

  onDeath: ((x: number, y: number) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: EnemyConfig) {
    this.scene = scene;
    this.cfg = cfg;
    this.hp = cfg.maxHp;
    this.homeX = x;
    this.homeY = y;
    this.sprite = scene.physics.add.image(x, y, cfg.textureKey, frameIndex('down', 'idle', 0));
    this.sprite.setOrigin(0.5, 0.875);
    this.sprite.setSize(20, 12);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setData('enemy', this);
    if (cfg.scale) this.sprite.setScale(cfg.scale);
    if (cfg.tint !== undefined) this.sprite.setTint(cfg.tint);
  }

  get x(): number {
    return this.sprite.x;
  }
  get y(): number {
    return this.sprite.y;
  }
  isDead(): boolean {
    return this.dead;
  }

  /** Apply damage with knockback + hit flash. Returns true if this kills it. */
  takeDamage(amount: number, fromX: number, fromY: number, knockback: number): boolean {
    if (this.dead) return false;
    this.hp -= amount;
    this.flashTimer = 120;
    // Phaser 4: white flash via FILL tint mode (plain setTint multiplies).
    this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    // Knockback away from the source (heavy enemies resist it).
    const ang = Math.atan2(this.y - fromY, this.x - fromX);
    const kb = knockback * (1 - (this.cfg.knockbackResist ?? 0));
    this.sprite.setVelocity(Math.cos(ang) * kb, Math.sin(ang) * kb);
    this.knockback = kb > 20 ? 180 : 0;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    this.setState('hurt');
    return false;
  }

  private die(): void {
    this.dead = true;
    this.setState('dead');
    this.sprite.setVelocity(0, 0);
    this.sprite.clearTint();
    const dx = this.x;
    const dy = this.y;
    // Brief death fade then notify.
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      duration: 250,
      onComplete: () => {
        this.onDeath?.(dx, dy);
        this.sprite.destroy();
      },
    });
  }

  /** Reset to the base tint (clears the white hit-flash / FILL mode). */
  private restoreTint(): void {
    this.sprite.clearTint();
    if (this.cfg.tint !== undefined) this.sprite.setTint(this.cfg.tint);
  }

  private setState(s: EnemyState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTimer = 0;
  }

  update(dtMs: number, playerX: number, playerY: number): void {
    if (this.dead) return;
    const dt = dtMs / 1000;
    this.stateTimer += dtMs;

    if (this.flashTimer > 0) {
      this.flashTimer -= dtMs;
      if (this.flashTimer <= 0) this.restoreTint();
    }

    if (this.knockback > 0) {
      this.knockback -= dtMs;
      this.stepAnim(dtMs, 'hurt');
      return; // knockback overrides movement
    }

    const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    const distHome = Phaser.Math.Distance.Between(this.x, this.y, this.homeX, this.homeY);

    switch (this.state) {
      case 'idle':
        this.sprite.setVelocity(0, 0);
        if (distToPlayer < this.cfg.aggroRange) this.setState('chase');
        else if (this.stateTimer > 1200) this.startWander();
        this.stepAnim(dtMs, 'idle');
        break;
      case 'wander':
        if (distToPlayer < this.cfg.aggroRange) this.setState('chase');
        else this.moveToward(this.wanderTarget.x, this.wanderTarget.y, this.cfg.moveSpeed * 0.5);
        if (
          this.stateTimer > 1500 ||
          Phaser.Math.Distance.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y) < 4
        ) {
          this.setState('idle');
        }
        this.stepAnim(dtMs, 'walk');
        break;
      case 'hurt':
        if (this.stateTimer > 200) this.setState('chase');
        this.stepAnim(dtMs, 'hurt');
        break;
      case 'chase':
        if (distHome > this.cfg.aggroRange * 2.2) {
          this.setState('return');
        } else if (this.cfg.keepDistance) {
          // Hit-and-run: hover near keepDistance, darting in to strike.
          if (distToPlayer <= this.cfg.attackRange) {
            this.setState('attack');
          } else if (distToPlayer < this.cfg.keepDistance) {
            this.moveAway(playerX, playerY, this.cfg.moveSpeed);
          } else {
            this.moveToward(playerX, playerY, this.cfg.moveSpeed);
          }
        } else if (distToPlayer <= this.cfg.attackRange) {
          this.setState('attack');
        } else {
          this.moveToward(playerX, playerY, this.cfg.moveSpeed);
        }
        this.stepAnim(dtMs, 'walk');
        break;
      case 'attack':
        this.sprite.setVelocity(0, 0);
        if (this.stateTimer > 500) {
          this.setState(distToPlayer < this.cfg.aggroRange ? 'chase' : 'idle');
        }
        this.stepAnim(dtMs, 'attack');
        break;
      case 'return':
        if (distHome < 6) this.setState('idle');
        else this.moveToward(this.homeX, this.homeY, this.cfg.moveSpeed);
        this.stepAnim(dtMs, 'walk');
        break;
      case 'dead':
        break;
    }

    void dt;
  }

  private startWander(): void {
    const ang = Math.random() * Math.PI * 2;
    const r = 24 + Math.random() * 32;
    this.wanderTarget.set(this.homeX + Math.cos(ang) * r, this.homeY + Math.sin(ang) * r);
    this.setState('wander');
  }

  private moveToward(tx: number, ty: number, speed: number): void {
    const ang = Math.atan2(ty - this.y, tx - this.x);
    this.sprite.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
    const vx = Math.cos(ang);
    const vy = Math.sin(ang);
    this.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
  }

  /** Move directly away from a point (hit-and-run retreat). */
  private moveAway(tx: number, ty: number, speed: number): void {
    const ang = Math.atan2(this.y - ty, this.x - tx);
    this.sprite.setVelocity(Math.cos(ang) * speed, Math.sin(ang) * speed);
    const vx = Math.cos(ang);
    const vy = Math.sin(ang);
    this.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
  }

  private stepAnim(dtMs: number, anim: AnimName): void {
    if (this.anim !== anim) {
      this.anim = anim;
      this.frame = 0;
      this.frameElapsed = 0;
    }
    const def = ANIMATIONS[anim];
    this.frameElapsed += dtMs;
    const dur = 1000 / def.fps;
    while (this.frameElapsed >= dur) {
      this.frameElapsed -= dur;
      this.frame = (this.frame + 1) % def.frames;
    }
    this.sprite.setFrame(frameIndex(this.dir, anim, this.frame));
    this.sprite.setFlipX(this.dir === 'right');
    this.sprite.setDepth(Math.round(this.y));
  }
}
