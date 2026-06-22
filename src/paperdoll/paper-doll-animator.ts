import Phaser from 'phaser';
import {
  DRAW_GROUPS,
  DRAW_ORDER_BY_DIRECTION,
  type DrawGroup,
  type Direction,
} from '@/config/layers';
import {
  ANIMATIONS,
  frameIndex,
  shouldFlipX,
  type AnimName,
} from '@/paperdoll/pose-atlas';
import { CHAR_ANCHOR_X, CHAR_ANCHOR_Y, CHAR_FRAME_W, CHAR_FRAME_H } from '@/config/resolution';

/**
 * Central paper-doll controller (PLAYER ONLY, and the menu preview which reuses
 * it). ONE logical clock drives the current animation/direction/frame and
 * syncs every layer Sprite. There are deliberately NO per-layer timers.
 *
 * All layer sheets share the pose-atlas layout, so a single frame index applies
 * to every layer. Layers are reordered per-direction so weapons/hands/back
 * items flip front<->back correctly.
 */
export class PaperDollAnimator {
  readonly container: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly layers = new Map<DrawGroup, Phaser.GameObjects.Sprite>();

  private anim: AnimName = 'idle';
  private dir: Direction = 'down';
  private frame = 0;
  private elapsed = 0; // ms into current frame
  private playing = true;
  private onComplete: (() => void) | null = null;

  // Normalized origin so the actor's (x, y) is the feet anchor and flipX mirrors
  // around the horizontal center (anchor x == frame center == 32).
  private static readonly ORIGIN_X = CHAR_ANCHOR_X / CHAR_FRAME_W;
  private static readonly ORIGIN_Y = CHAR_ANCHOR_Y / CHAR_FRAME_H;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(Math.round(x), Math.round(y));
  }

  /** Assign (or clear) the texture for a draw group. */
  setLayer(group: DrawGroup, textureKey: string | null): void {
    const existing = this.layers.get(group);
    if (!textureKey) {
      if (existing) {
        existing.destroy();
        this.layers.delete(group);
      }
      return;
    }
    if (existing) {
      existing.setTexture(textureKey);
    } else {
      const sprite = this.scene.add.sprite(0, 0, textureKey);
      sprite.setOrigin(PaperDollAnimator.ORIGIN_X, PaperDollAnimator.ORIGIN_Y);
      this.container.add(sprite);
      this.layers.set(group, sprite);
    }
    this.applyOrder();
    this.applyFrame();
  }

  /** True if a layer is currently set. */
  hasLayer(group: DrawGroup): boolean {
    return this.layers.has(group);
  }

  setDirection(dir: Direction): void {
    if (this.dir === dir) return;
    this.dir = dir;
    this.applyOrder();
    this.applyFrame();
  }

  getDirection(): Direction {
    return this.dir;
  }

  /** Start an animation. `force` restarts even if already playing the same one. */
  play(anim: AnimName, opts?: { force?: boolean; onComplete?: () => void }): void {
    if (this.anim === anim && this.playing && !opts?.force) return;
    this.anim = anim;
    this.frame = 0;
    this.elapsed = 0;
    this.playing = true;
    this.onComplete = opts?.onComplete ?? null;
    this.applyFrame();
  }

  getAnim(): AnimName {
    return this.anim;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setPosition(x: number, y: number): void {
    // Round to integer pixels so dots stay crisp (no sub-pixel rendering).
    this.container.setPosition(Math.round(x), Math.round(y));
  }

  setDepth(depth: number): void {
    this.container.setDepth(depth);
  }

  /** Advance the single clock and push the frame to all layers. */
  update(dtMs: number): void {
    const def = ANIMATIONS[this.anim];
    if (this.playing) {
      this.elapsed += dtMs;
      const frameDur = 1000 / def.fps;
      while (this.elapsed >= frameDur) {
        this.elapsed -= frameDur;
        this.frame++;
        if (this.frame >= def.frames) {
          if (def.loop) {
            this.frame = 0;
          } else {
            this.frame = def.frames - 1;
            this.playing = false;
            const cb = this.onComplete;
            this.onComplete = null;
            if (cb) cb();
            break;
          }
        }
      }
      this.applyFrame();
    }
  }

  destroy(): void {
    this.container.destroy(true);
    this.layers.clear();
  }

  private applyFrame(): void {
    const flip = shouldFlipX(this.dir);
    const idx = frameIndex(this.dir, this.anim, this.frame);
    for (const sprite of this.layers.values()) {
      sprite.setFrame(idx);
      sprite.setFlipX(flip);
    }
  }

  /** Reorder children to match the per-direction draw order (back -> front). */
  private applyOrder(): void {
    const order = DRAW_ORDER_BY_DIRECTION[this.dir] ?? DRAW_GROUPS;
    for (const group of order) {
      const sprite = this.layers.get(group);
      if (sprite) this.container.bringToTop(sprite);
    }
  }
}
