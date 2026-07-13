import Phaser from 'phaser';
import { FONT } from '@/ui/theme';
import { TEX } from '@/assets/gen/textures';

/**
 * Round touch button. Handles multi-touch correctly: it binds to the specific
 * pointer id that pressed it, releases when that finger lifts, and cancels if
 * the finger slides outside the button radius. Minimum 48 logical px.
 */
export class TouchButton {
  private readonly circle: Phaser.GameObjects.Arc;
  private readonly inner: Phaser.GameObjects.Arc;
  private readonly frame?: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private icon?: Phaser.GameObjects.Image;
  private frameSize = 0;
  private dimmed = false;
  private pointerId = -1;
  private readonly cx: number;
  private readonly cy: number;
  private readonly radius: number;
  private readonly accent: number;

  onChange: ((down: boolean) => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    radius: number,
    text: string,
    color: number,
    depth: number,
    iconTex?: string,
  ) {
    this.cx = x;
    this.cy = y;
    this.radius = Math.max(radius, 24); // 48px diameter minimum
    this.accent = color;
    const frameTex = this.radius >= 26 ? TEX.hudActionButton : TEX.hudUtilityButton;
    const hasIllustratedFrame = scene.textures.exists(frameTex);
    // The live colour remains code-driven beneath the illustrated metal bezel.
    this.circle = scene.add.circle(x, y, this.radius, 0x173b69, 0.92).setDepth(depth);
    if (!hasIllustratedFrame) this.circle.setStrokeStyle(2, 0xf2c765, 0.9);
    this.inner = scene.add.circle(x, y, this.radius - 6, color, 0.2).setDepth(depth + 0.25);
    this.inner.setStrokeStyle(1, color, 0.62);
    if (hasIllustratedFrame) {
      const size = this.radius * 2 + (this.radius >= 26 ? 8 : 6);
      this.frameSize = size;
      this.frame = scene.add.image(x, y, frameTex).setDisplaySize(size, size).setDepth(depth + 0.6);
    }
    // Icon + smaller caption reads better than a bare letter; integer scale
    // only (pixel-art rule).
    if (iconTex && scene.textures.exists(iconTex)) {
      const scale = this.radius >= 30 ? 2 : 1;
      this.icon = scene.add.image(x, text ? y - 5 : y, iconTex).setScale(scale).setDepth(depth + 1);
      this.label = scene.add
        .text(x, y + this.radius - 12, text, { fontFamily: FONT, fontSize: '9px', color: '#ffffff' })
        .setOrigin(0.5)
        .setDepth(depth + 1);
    } else {
      this.label = scene.add
        .text(x, y, text, { fontFamily: FONT, fontSize: '13px', color: '#ffffff' })
        .setOrigin(0.5)
        .setDepth(depth + 1);
    }

    this.circle.setInteractive(
      new Phaser.Geom.Circle(this.radius, this.radius, this.radius),
      Phaser.Geom.Circle.Contains,
    );
    this.circle.on('pointerdown', (p: Phaser.Input.Pointer) => this.press(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.move(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.release(p));
    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.release(p));
    scene.input.on('pointercancel', (p: Phaser.Input.Pointer) => this.release(p));
    // Self-heal: release if the tracked finger's up event was ever missed, so a
    // button can't get stuck "held".
    scene.events.on(Phaser.Scenes.Events.UPDATE, () => {
      if (this.pointerId === -1) return;
      const p = scene.input.manager.pointers.find((pt) => pt.id === this.pointerId);
      if (!p || !p.isDown) this.forceRelease();
    });
  }

  private forceRelease(): void {
    this.pointerId = -1;
    this.circle.setFillStyle(0x173b69, 0.92);
    this.inner.setFillStyle(this.accent, 0.16);
    this.frame?.clearTint().setDisplaySize(this.frameSize, this.frameSize);
    this.onChange?.(false);
  }

  setVisible(v: boolean): void {
    this.circle.setVisible(v);
    this.inner.setVisible(v);
    this.frame?.setVisible(v);
    this.label.setVisible(v);
    this.icon?.setVisible(v);
    if (!v && this.pointerId !== -1) {
      this.pointerId = -1;
      this.onChange?.(false);
    }
  }

  /** Fade + disable (safe zones): dimmed buttons ignore presses and read muted. */
  setDimmed(v: boolean): void {
    if (this.dimmed === v) return;
    this.dimmed = v;
    const a = v ? 0.72 : 1;
    this.circle.setAlpha(a);
    this.inner.setAlpha(a);
    this.frame?.setAlpha(a);
    this.label.setAlpha(a);
    this.icon?.setAlpha(a);
    if (v && this.pointerId !== -1) this.forceRelease();
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    return Phaser.Math.Distance.Between(p.x, p.y, this.cx, this.cy) <= this.radius;
  }

  private press(p: Phaser.Input.Pointer): void {
    if (this.dimmed || !this.circle.visible || this.pointerId !== -1) return;
    this.pointerId = p.id;
    this.circle.setFillStyle(0x2f6598, 0.98);
    this.inner.setFillStyle(this.accent, 0.3);
    this.frame?.setTint(0xfff0bf).setDisplaySize(this.frameSize * 0.96, this.frameSize * 0.96);
    this.onChange?.(true);
  }

  private move(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    // Cancel if the finger slides off the button.
    if (!this.contains(p)) this.release(p);
  }

  private release(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = -1;
    this.circle.setFillStyle(0x173b69, 0.92);
    this.inner.setFillStyle(this.accent, 0.16);
    this.frame?.clearTint().setDisplaySize(this.frameSize, this.frameSize);
    this.onChange?.(false);
  }
}
