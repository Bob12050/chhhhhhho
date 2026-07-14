import Phaser from 'phaser';
import { FONT } from '@/ui/theme';
import { TEX } from '@/assets/gen/textures';

export type TouchButtonStyle = 'primary' | 'secondary' | 'utility';

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
  private readonly style: TouchButtonStyle;

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
    style: TouchButtonStyle = 'secondary',
  ) {
    this.cx = x;
    this.cy = y;
    this.radius = Math.max(radius, 24); // 48px diameter minimum
    this.accent = color;
    this.style = style;
    const frameTex = this.radius >= 26 ? TEX.hudActionButton : TEX.hudUtilityButton;
    const hasIllustratedFrame = style === 'primary' && scene.textures.exists(frameTex);
    const baseColor = style === 'primary' ? 0x142d4b : 0x0c1828;
    const baseAlpha = style === 'primary' ? 0.9 : style === 'secondary' ? 0.72 : 0.64;
    this.circle = scene.add.circle(x, y, this.radius, baseColor, baseAlpha).setDepth(depth);
    this.circle.setStrokeStyle(
      style === 'primary' ? 1.5 : 1,
      style === 'primary' ? 0xe8cb79 : 0xdce8f3,
      style === 'primary' ? 0.48 : 0.22,
    );
    this.inner = scene.add
      .circle(x, y, this.radius - 6, color, style === 'primary' ? 0.18 : 0.1)
      .setDepth(depth + 0.25);
    this.inner.setStrokeStyle(1, color, style === 'primary' ? 0.5 : 0.26);
    if (hasIllustratedFrame) {
      const size = this.radius * 2 + (this.radius >= 26 ? 8 : 6);
      this.frameSize = size;
      this.frame = scene.add
        .image(x, y, frameTex)
        .setDisplaySize(size, size)
        .setAlpha(0.86)
        .setDepth(depth + 0.6);
    }
    // Icon + smaller caption reads better than a bare letter; integer scale
    // only (pixel-art rule).
    if (iconTex && scene.textures.exists(iconTex)) {
      const scale = this.radius >= 30 ? 2 : 1;
      this.icon = scene.add.image(x, text ? y - 5 : y, iconTex).setScale(scale).setDepth(depth + 1);
      this.label = scene.add
        .text(x, y + this.radius - 12, text, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
        .setOrigin(0.5)
        .setDepth(depth + 1);
    } else {
      this.label = scene.add
        .text(x, y, text, {
          fontFamily: FONT,
          fontSize: style === 'primary' ? '13px' : style === 'secondary' ? '11px' : '10px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(depth + 1);
    }

    this.applyOpacity(false);

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
    this.resetAppearance();
    this.onChange?.(false);
  }

  private applyOpacity(pressed: boolean): void {
    const idleShell = this.style === 'primary' ? 0.94 : this.style === 'secondary' ? 0.74 : 0.66;
    const dimmedShell = this.style === 'primary' ? 0.46 : 0.34;
    const idleContent = this.style === 'primary' ? 1 : 0.82;
    const dimmedContent = this.style === 'primary' ? 0.58 : 0.46;
    const shellAlpha = pressed ? 1 : this.dimmed ? dimmedShell : idleShell;
    const contentAlpha = pressed ? 1 : this.dimmed ? dimmedContent : idleContent;
    this.circle.setAlpha(shellAlpha);
    this.inner.setAlpha(shellAlpha);
    this.frame?.setAlpha(this.dimmed ? 0.42 : pressed ? 1 : 0.86);
    this.label.setAlpha(contentAlpha);
    this.icon?.setAlpha(contentAlpha);
  }

  private resetAppearance(): void {
    const baseColor = this.style === 'primary' ? 0x142d4b : 0x0c1828;
    const baseAlpha = this.style === 'primary' ? 0.9 : this.style === 'secondary' ? 0.72 : 0.64;
    const innerAlpha = this.style === 'primary' ? 0.18 : 0.1;
    this.circle.setFillStyle(baseColor, baseAlpha);
    this.inner.setFillStyle(this.accent, innerAlpha);
    this.frame?.clearTint().setDisplaySize(this.frameSize, this.frameSize);
    this.applyOpacity(false);
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
    if (v && this.pointerId !== -1) this.forceRelease();
    else this.applyOpacity(false);
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    return Phaser.Math.Distance.Between(p.x, p.y, this.cx, this.cy) <= this.radius;
  }

  private press(p: Phaser.Input.Pointer): void {
    if (this.dimmed || !this.circle.visible || this.pointerId !== -1) return;
    this.pointerId = p.id;
    this.circle.setFillStyle(0x2f6598, 0.98);
    this.inner.setFillStyle(this.accent, this.style === 'primary' ? 0.32 : 0.22);
    this.frame?.setTint(0xfff0bf).setDisplaySize(this.frameSize * 0.96, this.frameSize * 0.96);
    this.applyOpacity(true);
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
    this.resetAppearance();
    this.onChange?.(false);
  }
}
