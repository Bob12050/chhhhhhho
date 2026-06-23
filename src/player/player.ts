import Phaser from 'phaser';
import { PaperDollAnimator } from '@/paperdoll/paper-doll-animator';
import type { Direction, DrawGroup } from '@/config/layers';
import type { AnimName } from '@/paperdoll/pose-atlas';
import { TEX } from '@/assets/gen/textures';
import type { EquipSlot } from '@/equipment/slots';

/**
 * Player actor. Owns a single PaperDollAnimator (base body + equipment layers)
 * and an Arcade physics body for movement/collision. The paper-doll container
 * follows the physics body each frame, snapped to integer pixels.
 *
 * Equipment slots map onto paper-doll draw groups. Phase 0 supports head /
 * torso / main_hand. Visual updates are immediate on equip change.
 */
const SLOT_TO_GROUP: Partial<Record<EquipSlot, DrawGroup>> = {
  head: 'head',
  torso: 'torso',
  main_hand: 'near_weapon',
};

export class Player {
  readonly body: Phaser.Physics.Arcade.Image;
  readonly doll: PaperDollAnimator;
  private readonly scene: Phaser.Scene;
  private dir: Direction = 'down';
  private moveSpeed = 90; // logical px/sec (Phase 0 fixed; later from stats)
  private attacking = false;

  /** Called when an attack's hit frame lands. */
  onAttackHit: ((dir: Direction) => void) | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;

    // Invisible collider; the visible character is the paper-doll container.
    // The body texture is a 64x96 frame with origin (0.5, 0.5), so center the
    // 20x16 collision box on the actor position (offset = frameHalf - boxHalf).
    // A previous (0,0) offset parked the box in the frame's top-left corner,
    // which (via world bounds) kept the player from reaching edge portals.
    this.body = scene.physics.add.image(x, y, TEX.playerBody);
    this.body.setVisible(false);
    this.body.setSize(20, 16);
    this.body.setOffset(22, 40);
    this.body.setCollideWorldBounds(true);

    this.doll = new PaperDollAnimator(scene, x, y);
    this.doll.setLayer('shadow', TEX.shadow);
    this.doll.setLayer('base_body', TEX.playerBody);
    this.doll.play('idle');
  }

  /** Equip (or clear) a visual layer for a slot. */
  setEquipVisual(slot: EquipSlot, textureKey: string | null): void {
    const group = SLOT_TO_GROUP[slot];
    if (!group) return;
    this.doll.setLayer(group, textureKey);
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

  /** Trigger a melee attack toward the given direction (or current facing). */
  attack(dir?: Direction): void {
    if (this.attacking) return;
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

  update(dtMs: number): void {
    this.doll.setPosition(this.body.x, this.body.y);
    this.doll.setDepth(Math.round(this.body.y));
    this.doll.update(dtMs);
  }

  destroy(): void {
    this.doll.destroy();
    this.body.destroy();
  }
}
