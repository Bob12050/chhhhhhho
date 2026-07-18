import Phaser from 'phaser';
import {
  DRAW_GROUPS,
  DRAW_ORDER_BY_DIRECTION,
  type DrawGroup,
  type Direction,
} from '@/config/layers';
import {
  ANIMATIONS,
  diagonalFrameIndex,
  frameIndex,
  shouldFlipX,
  supportsDiagonalAnim,
  type AnimName,
} from '@/paperdoll/pose-atlas';
import { CHAR_ANCHOR_X, CHAR_ANCHOR_Y, CHAR_FRAME_W, CHAR_FRAME_H } from '@/config/resolution';
import { isDiagonalDirection } from '@/config/directions';

interface LayerVisual {
  readonly sprite: Phaser.GameObjects.Sprite;
  cardinalTextureKey: string;
  diagonalTextureKey: string | null;
  displayScale: number;
}

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
  private readonly layers = new Map<DrawGroup, LayerVisual>();

  private anim: AnimName = 'idle';
  private dir: Direction = 'down';
  private frame = 0;
  private elapsed = 0; // ms into current frame
  private playing = true;
  private onComplete: (() => void) | null = null;
  private flashTimer = 0;
  private playbackRate = 1;

  // Normalized origin so the actor's (x, y) is the feet anchor and flipX mirrors
  // around the horizontal center (anchor x == frame center == 48).
  private static readonly ORIGIN_X = CHAR_ANCHOR_X / CHAR_FRAME_W;
  private static readonly ORIGIN_Y = CHAR_ANCHOR_Y / CHAR_FRAME_H;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.container = scene.add.container(Math.round(x), Math.round(y));
  }

  /** Assign (or clear) the texture for a draw group. */
  setLayer(
    group: DrawGroup,
    textureKey: string | null,
    opts?: { diagonalTextureKey?: string | null; displayScale?: number },
  ): void {
    const existing = this.layers.get(group);
    if (!textureKey) {
      if (existing) {
        existing.sprite.destroy();
        this.layers.delete(group);
      }
      return;
    }
    if (existing) {
      existing.cardinalTextureKey = textureKey;
      existing.diagonalTextureKey = opts?.diagonalTextureKey ?? null;
      existing.displayScale = opts?.displayScale ?? 1;
      existing.sprite.setTexture(textureKey).setScale(existing.displayScale);
    } else {
      const sprite = this.scene.add.sprite(0, 0, textureKey);
      sprite.setOrigin(PaperDollAnimator.ORIGIN_X, PaperDollAnimator.ORIGIN_Y);
      sprite.setScale(opts?.displayScale ?? 1);
      this.container.add(sprite);
      this.layers.set(group, {
        sprite,
        cardinalTextureKey: textureKey,
        diagonalTextureKey: opts?.diagonalTextureKey ?? null,
        displayScale: opts?.displayScale ?? 1,
      });
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

  setPlaybackRate(rate: number): void {
    this.playbackRate = Phaser.Math.Clamp(rate, 0.5, 2);
  }

  setPosition(x: number, y: number): void {
    // Round to integer pixels so dots stay crisp (no sub-pixel rendering).
    this.container.setPosition(Math.round(x), Math.round(y));
  }

  setDepth(depth: number): void {
    this.container.setDepth(depth);
  }

  /**
   * White hit-flash across every layer (Phaser 4: FILL tint mode; plain
   * setTint would multiply). Cleared automatically by update() after `ms`.
   */
  flashWhite(ms: number): void {
    this.flashTimer = ms;
    for (const layer of this.layers.values()) {
      layer.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    }
  }

  /** Advance the single clock and push the frame to all layers. */
  update(dtMs: number): void {
    if (this.flashTimer > 0) {
      this.flashTimer -= dtMs;
      if (this.flashTimer <= 0) {
        for (const layer of this.layers.values()) layer.sprite.clearTint();
      }
    }
    const def = ANIMATIONS[this.anim];
    if (this.playing) {
      this.elapsed += dtMs;
      const frameDur = 1000 / (def.fps * this.playbackRate);
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
    const diagonalAnim = supportsDiagonalAnim(this.anim) ? this.anim : null;
    const diagonalPose = isDiagonalDirection(this.dir) && diagonalAnim !== null;
    for (const layer of this.layers.values()) {
      const useDiagonal = diagonalPose
        && !!layer.diagonalTextureKey
        && this.scene.textures.exists(layer.diagonalTextureKey);
      const textureKey = useDiagonal ? layer.diagonalTextureKey! : layer.cardinalTextureKey;
      if (layer.sprite.texture.key !== textureKey) layer.sprite.setTexture(textureKey);
      const idx = useDiagonal
        ? diagonalFrameIndex(this.dir, diagonalAnim!, this.frame)
        : frameIndex(this.dir, this.anim, this.frame);
      layer.sprite.setFrame(idx);
      layer.sprite.setFlipX(flip);
    }
  }

  /** Reorder children to match the per-direction draw order (back -> front). */
  private applyOrder(): void {
    const order = DRAW_ORDER_BY_DIRECTION[this.dir] ?? DRAW_GROUPS;
    for (const group of order) {
      const layer = this.layers.get(group);
      if (layer) this.container.bringToTop(layer.sprite);
    }
  }
}
