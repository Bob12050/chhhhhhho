import Phaser from 'phaser';
import { PaperDollAnimator } from '@/paperdoll/paper-doll-animator';
import type { Direction } from '@/config/layers';
import type { AnimName } from '@/paperdoll/pose-atlas';
import { TEX } from '@/assets/gen/textures';
import { CHAR_FRAME_W } from '@/config/resolution';
import { getJob } from '@/jobs/job-defs';
import { appearanceTexKey } from '@/jobs/job-appearance';
import { gameState } from '@/player/game-state';

/**
 * Player actor. Owns a single PaperDollAnimator (body sprite) and an Arcade
 * physics body for movement/collision. The paper-doll container follows the
 * physics body each frame, snapped to integer pixels.
 *
 * Appearance is JOB-FIXED: the body sprite is decided by the active job, and
 * equipment only changes stats (not the look). Until a job's art PNG ships, the
 * body falls back to the default player body.
 */

export class Player {
  readonly body: Phaser.Physics.Arcade.Image;
  readonly doll: PaperDollAnimator;
  private readonly scene: Phaser.Scene;
  private dir: Direction = 'down';
  private moveSpeed = 90; // logical px/sec (Phase 0 fixed; later from stats)
  private rollMs = 0;
  private attacking = false;

  /** Called when an attack's hit frame lands. */
  onAttackHit: ((dir: Direction) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Invisible collider; the visible character is the paper-doll container.
    // The body texture is a CHAR_FRAME_W x CHAR_FRAME_H frame with origin
    // (0.5, 0.5), so center the 20x16 collision box horizontally on the actor
    // (offset = frameHalf - boxHalf). A previous (0,0) offset parked the box in
    // the frame's top-left corner, which kept the player from reaching portals.
    this.body = scene.physics.add.image(x, y, TEX.playerBody);
    this.body.setVisible(false);
    this.body.setSize(20, 16);
    this.body.setOffset((CHAR_FRAME_W - 20) / 2, 40);
    this.body.setCollideWorldBounds(true);

    this.doll = new PaperDollAnimator(scene, x, y);
    this.doll.setLayer('shadow', TEX.shadow);
    this.setJobAppearance(gameState.jobId);
    this.doll.play('idle');
  }

  /**
   * Set the body sprite from the active job (job-fixed appearance). Uses the
   * job's art if its PNG is loaded, else the default body. Equipment layers stay
   * cleared — gear changes stats only.
   */
  setJobAppearance(jobId: string): void {
    const key = appearanceTexKey(getJob(jobId)?.appearance);
    const tex = key && this.scene.textures.exists(key) ? key : TEX.playerBody;
    this.doll.setLayer('base_body', tex);
  }

  getDirection(): Direction {
    return this.dir;
  }

  get x(): number {
    return this.body.x;
  }
  get y(): number {
    return this.body.y;
  }

  setMoveSpeed(v: number): void {
    this.moveSpeed = v;
  }

  /** Apply a normalized-ish movement vector (components in [-1, 1]). */
  setMovement(vx: number, vy: number): void {
    if (this.rollMs > 0) return; // roll keeps its own velocity
    if (this.attacking) {
      this.body.setVelocity(0, 0);
      return;
    }
    const len = Math.hypot(vx, vy);
    if (len > 0.001) {
      const nx = vx / len;
      const ny = vy / len;
      this.body.setVelocity(nx * this.moveSpeed, ny * this.moveSpeed);
      // Direction by dominant axis (4-way).
      if (Math.abs(nx) > Math.abs(ny)) {
        this.dir = nx > 0 ? 'right' : 'left';
      } else {
        this.dir = ny > 0 ? 'down' : 'up';
      }
      this.doll.setDirection(this.dir);
      if (this.doll.getAnim() !== 'walk') this.doll.play('walk');
    } else {
      this.body.setVelocity(0, 0);
      if (this.doll.getAnim() === 'walk') this.doll.play('idle');
    }
  }

  /**
   * Dodge roll: burst of speed in the stick direction (or facing when
   * neutral). The scene grants the i-frames/cooldown; this only moves.
   * Returns false while attacking/already rolling.
   */
  roll(vx: number, vy: number, ms = 260, speedMult = 2.4): boolean {
    if (this.attacking || this.rollMs > 0) return false;
    const len = Math.hypot(vx, vy);
    let nx: number;
    let ny: number;
    if (len > 0.001) {
      nx = vx / len;
      ny = vy / len;
    } else {
      nx = this.dir === 'left' ? -1 : this.dir === 'right' ? 1 : 0;
      ny = this.dir === 'up' ? -1 : this.dir === 'down' ? 1 : 0;
    }
    this.rollMs = ms;
    this.body.setVelocity(nx * this.moveSpeed * speedMult, ny * this.moveSpeed * speedMult);
    if (Math.abs(nx) > Math.abs(ny)) this.dir = nx > 0 ? 'right' : 'left';
    else this.dir = ny > 0 ? 'down' : 'up';
    this.doll.setDirection(this.dir);
    this.doll.play('walk', { force: true });
    return true;
  }

  isRolling(): boolean {
    return this.rollMs > 0;
  }

  /** Trigger a melee attack toward the given direction (or current facing). */
  attack(dir?: Direction): void {
    if (this.attacking || this.rollMs > 0) return;
    this.attacking = true;
    if (dir) {
      this.dir = dir;
      this.doll.setDirection(dir);
    }
    this.body.setVelocity(0, 0);
    let hit = false;
    this.doll.play('attack', {
      force: true,
      onComplete: () => {
        this.attacking = false;
      },
    });
    // Resolve the hit at the mid-point of the swing.
    this.scene.time.delayedCall(120, () => {
      if (!hit) {
        hit = true;
        this.onAttackHit?.(this.dir);
      }
    });
  }

  isAttacking(): boolean {
    return this.attacking;
  }

  play(anim: AnimName): void {
    this.doll.play(anim);
  }

  /** Took a hit: white flash (the invuln blink is driven by the scene). */
  hurt(): void {
    this.doll.flashWhite(140);
  }

  /** Defeated: stop, play the death pose, flash, and fade the doll out. */
  die(): void {
    this.attacking = false;
    this.body.setVelocity(0, 0);
    this.doll.play('death', { force: true });
    this.doll.flashWhite(120);
    this.scene.tweens.add({
      targets: this.doll.container,
      alpha: 0,
      duration: 450,
      delay: 150,
    });
  }

  update(dtMs: number): void {
    if (this.rollMs > 0) {
      this.rollMs -= dtMs;
      if (this.rollMs <= 0) this.body.setVelocity(0, 0);
    }
    this.doll.setPosition(this.body.x, this.body.y);
    this.doll.setDepth(Math.round(this.body.y));
    this.doll.update(dtMs);
  }

  destroy(): void {
    this.doll.destroy();
    this.body.destroy();
  }
}
