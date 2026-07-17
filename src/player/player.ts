import Phaser from 'phaser';
import { PaperDollAnimator } from '@/paperdoll/paper-doll-animator';
import type { Direction } from '@/config/layers';
import type { AnimName } from '@/paperdoll/pose-atlas';
import { TEX } from '@/assets/gen/textures';
import { CHAR_FRAME_W } from '@/config/resolution';
import { getJob } from '@/jobs/job-defs';
import { appearanceDiagonalTexKey, appearanceTexKey } from '@/jobs/job-appearance';
import { gameState } from '@/player/game-state';
import { directionFromVector, directionVector } from '@/config/directions';
import { FONT } from '@/ui/theme';
import { loadSettings } from '@/core/settings';
import {
  hasIronEquipmentAppearance,
  resolveIronEquipmentAppearance,
} from '@/paperdoll/iron-equipment';
import {
  applyIronEquipmentAppearance,
  clearIronEquipmentAppearance,
  ironEquipmentTexturesAvailable,
} from '@/paperdoll/iron-equipment-visual';

/**
 * Player actor. Owns a single PaperDollAnimator (body sprite) and an Arcade
 * physics body for movement/collision. The paper-doll container follows the
 * physics body each frame, snapped to integer pixels.
 *
 * Jobs normally use their original fixed sprite. Equipping one of the iron
 * pilot pieces swaps to the aligned layered body; disabling the setting or
 * removing the last supported piece restores the untouched job sheet.
 */

export class Player {
  /** ms between attacks at atkSpeed 1.0 (anim is ~286ms; a hair above it). */
  private static readonly BASE_ATTACK_MS = 360;
  readonly body: Phaser.Physics.Arcade.Image;
  readonly doll: PaperDollAnimator;
  private readonly scene: Phaser.Scene;
  private dir: Direction = 'down';
  private moveSpeed = 90; // logical px/sec (Phase 0 fixed; later from stats)
  private rollMs = 0;
  /** Attack-rate multiplier from derived stats (1 = base). */
  private atkSpeedMult = 1;
  private attackCdMs = 0;
  private shadow!: Phaser.GameObjects.Image;
  private jobPlate!: Phaser.GameObjects.Container;
  private jobPlateBack!: Phaser.GameObjects.Graphics;
  private jobPlateText!: Phaser.GameObjects.Text;
  private attacking = false;
  private moveMagnitude = 0;
  private stridePhase = 0;
  private distanceSinceStep = 0;
  private lastX: number;
  private lastY: number;

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
    this.lastX = x;
    this.lastY = y;

    this.doll = new PaperDollAnimator(scene, x, y);
    this.shadow = scene.add
      .image(x, y + 1, TEX.groundShadow)
      .setDisplaySize(28, 10)
      .setAlpha(0.72)
      .setDepth(Math.round(y) - 1);
    this.jobPlateBack = scene.add.graphics();
    this.jobPlateText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#fff0aa',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.jobPlateText.setShadow(0, 1, '#000000', 2);
    this.jobPlate = scene.add
      .container(Math.round(x), Math.round(y) - 57, [this.jobPlateBack, this.jobPlateText])
      .setDepth(Math.round(y) + 2);
    this.setJobAppearance(gameState.jobId);
    this.doll.play('idle');
  }

  /** Set either the iron paper doll or the untouched fixed job art. */
  setJobAppearance(jobId: string): void {
    const job = getJob(jobId);
    const appearance = job?.appearance;
    const ironState = resolveIronEquipmentAppearance(gameState.equipment);
    const layeredAppearance = loadSettings().paperDollPilot
      && hasIronEquipmentAppearance(ironState)
      && ironEquipmentTexturesAvailable(this.scene);
    clearIronEquipmentAppearance(this.doll);

    if (layeredAppearance) {
      applyIronEquipmentAppearance(this.doll, ironState);
    } else {
      const key = appearanceTexKey(appearance);
      const tex = key && this.scene.textures.exists(key) ? key : TEX.playerBody;
      this.doll.setLayer('base_body', tex, {
        diagonalTextureKey: tex === TEX.playerBody
          ? TEX.playerBodyDiagonal
          : appearanceDiagonalTexKey(appearance),
      });
    }
    this.jobPlateText.setText(job?.name ?? jobId);
    const plateW = Math.ceil(this.jobPlateText.width) + 12;
    this.jobPlateBack.clear();
    this.jobPlateBack.fillStyle(0x091221, 0.82);
    this.jobPlateBack.fillRoundedRect(-plateW / 2, -7, plateW, 14, 3);
    this.jobPlateBack.lineStyle(1, 0xe4ca72, 0.66);
    this.jobPlateBack.strokeRoundedRect(-plateW / 2, -7, plateW, 14, 3);
  }

  /** Re-evaluate the active body and every supported equipment layer. */
  refreshEquipmentAppearance(): void {
    this.setJobAppearance(gameState.jobId);
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

  /** Attack cadence = BASE_ATTACK_MS / mult, so 攻速 gear actually matters. */
  setAtkSpeed(mult: number): void {
    this.atkSpeedMult = Math.max(0.25, mult);
  }

  /** Apply a normalized-ish movement vector (components in [-1, 1]). */
  setMovement(vx: number, vy: number): void {
    if (this.rollMs > 0) return; // roll keeps its own velocity
    if (this.attacking) {
      this.body.setVelocity(0, 0);
      this.moveMagnitude = 0;
      this.doll.setPlaybackRate(1);
      return;
    }
    const len = Math.hypot(vx, vy);
    if (len >= 0.08) {
      const nx = vx / len;
      const ny = vy / len;
      this.moveMagnitude = Math.min(1, len);
      this.body.setVelocity(
        nx * this.moveSpeed * this.moveMagnitude,
        ny * this.moveSpeed * this.moveMagnitude,
      );
      this.dir = directionFromVector(nx, ny, this.dir) ?? this.dir;
      this.doll.setDirection(this.dir);
      this.doll.setPlaybackRate(0.82 + this.moveMagnitude * 0.28);
      if (this.doll.getAnim() !== 'walk') this.doll.play('walk');
    } else {
      this.body.setVelocity(0, 0);
      this.moveMagnitude = 0;
      this.doll.setPlaybackRate(1);
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
      const facing = directionVector(this.dir);
      nx = facing.x;
      ny = facing.y;
    }
    this.rollMs = ms;
    this.body.setVelocity(nx * this.moveSpeed * speedMult, ny * this.moveSpeed * speedMult);
    this.dir = directionFromVector(nx, ny, this.dir) ?? this.dir;
    this.doll.setDirection(this.dir);
    this.doll.setPlaybackRate(1.45);
    this.doll.play('walk', { force: true });
    return true;
  }

  isRolling(): boolean {
    return this.rollMs > 0;
  }

  /** Trigger a melee attack toward the given direction (or current facing). */
  attack(dir?: Direction): void {
    if (this.attacking || this.rollMs > 0 || this.attackCdMs > 0) return;
    this.attackCdMs = Player.BASE_ATTACK_MS / this.atkSpeedMult;
    this.attacking = true;
    this.moveMagnitude = 0;
    this.doll.setPlaybackRate(1);
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
        this.doll.play('idle');
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
    this.moveMagnitude = 0;
    this.body.setVelocity(0, 0);
    this.doll.setPlaybackRate(1);
    this.doll.play('death', { force: true });
    this.doll.flashWhite(120);
    this.scene.tweens.add({
      targets: [this.doll.container, this.shadow, this.jobPlate],
      alpha: 0,
      duration: 450,
      delay: 150,
    });
  }

  update(dtMs: number): void {
    if (this.attackCdMs > 0) this.attackCdMs -= dtMs;
    if (this.rollMs > 0) {
      this.rollMs -= dtMs;
      if (this.rollMs <= 0) {
        this.body.setVelocity(0, 0);
        this.doll.setPlaybackRate(1);
      }
    }

    const dx = this.body.x - this.lastX;
    const dy = this.body.y - this.lastY;
    const speed = Math.hypot(this.body.body?.velocity.x ?? 0, this.body.body?.velocity.y ?? 0);
    const walking = !this.attacking && speed > 4 && this.doll.getAnim() === 'walk';
    let contact = 0;
    if (walking) {
      const speedRatio = Phaser.Math.Clamp(speed / Math.max(1, this.moveSpeed), 0.35, 2.5);
      this.stridePhase += dtMs * 0.014 * (0.72 + speedRatio * 0.28);
      this.stridePhase %= Math.PI * 2;
      contact = Math.abs(Math.cos(this.stridePhase));
      this.distanceSinceStep += Math.hypot(dx, dy);
      if (this.distanceSinceStep >= 24) {
        this.distanceSinceStep %= 24;
        this.spawnFootstep();
      }
    } else {
      this.distanceSinceStep = 0;
    }

    this.shadow
      .setPosition(Math.round(this.body.x), Math.round(this.body.y) + 1)
      .setDisplaySize(Math.round(28 + contact * 2), Math.round(10 - contact))
      .setAlpha(0.68 + contact * 0.06)
      .setDepth(Math.round(this.body.y) - 1);
    this.jobPlate
      .setPosition(Math.round(this.body.x), Math.round(this.body.y) - 57)
      .setDepth(Math.round(this.body.y) + 2);
    this.doll.setPosition(this.body.x, this.body.y);
    this.doll.setDepth(Math.round(this.body.y));
    this.doll.update(dtMs);
    this.lastX = this.body.x;
    this.lastY = this.body.y;
  }

  private spawnFootstep(): void {
    const facing = directionVector(this.dir);
    const side = Math.sin(this.stridePhase) >= 0 ? 1 : -1;
    const x = Math.round(this.body.x - facing.x * 4 - facing.y * side * 3);
    const y = Math.round(this.body.y - facing.y * 2 + facing.x * side * 2);
    const puff = this.scene.add
      .ellipse(x, y, 6, 3, 0xd8c7a3, 0.24)
      .setDepth(Math.round(this.body.y) - 2);
    this.scene.tweens.add({
      targets: puff,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 0.7,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  destroy(): void {
    this.doll.destroy();
    this.shadow.destroy();
    this.jobPlate.destroy(true);
    this.body.destroy();
  }
}
