import Phaser from 'phaser';
import { FONT } from '@/ui/theme';

export type TouchButtonStyle = 'primary' | 'secondary' | 'utility';

/**
 * Round touch button. Handles multi-touch correctly: it binds to the specific
 * pointer id that pressed it, releases when that finger lifts, and cancels if
 * the finger slides outside the button radius. Minimum 48 logical px.
 */
export class TouchButton {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly circle: Phaser.GameObjects.Arc;
  private readonly inner: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private icon?: Phaser.GameObjects.Image;
  private hasIconContent = false;
  private dimmed = false;
  private unavailable = false;
  private pointerId = -1;
  private readonly cx: number;
  private readonly cy: number;
  private readonly radius: number;
  private accent: number;
  private readonly style: TouchButtonStyle;
  private opacityMultiplier = 1;

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
    this.scene = scene;
    this.depth = depth;
    this.cx = x;
    this.cy = y;
    this.radius = Math.max(radius, 24); // 48px diameter minimum
    this.accent = color;
    this.style = style;
    const baseColor = style === 'primary' ? 0x0a2139 : 0x0a1a2d;
    const baseAlpha = style === 'primary' ? 0.98 : style === 'secondary' ? 0.94 : 0.9;
    this.circle = scene.add.circle(x, y, this.radius, baseColor, baseAlpha).setDepth(depth);
    this.circle.setStrokeStyle(
      style === 'primary' ? 2 : 1.5,
      0xe8cb79,
      style === 'primary' ? 0.9 : style === 'secondary' ? 0.72 : 0.58,
    );
    this.inner = scene.add
      .circle(x, y, this.radius - 6, color, style === 'primary' ? 0.24 : 0.14)
      .setDepth(depth + 0.25);
    this.inner.setStrokeStyle(1, color, style === 'primary' ? 0.66 : 0.4);
    // Icon + smaller caption reads better than a bare letter; integer scale
    // only (pixel-art rule).
    if (iconTex && scene.textures.exists(iconTex)) {
      const scale = this.style === 'primary' && this.radius >= 36 ? 3 : this.radius >= 26 ? 2 : 1;
      this.hasIconContent = true;
      this.icon = scene.add.image(x, text ? y - 7 : y, iconTex).setScale(scale).setDepth(depth + 1);
      this.label = scene.add
        .text(x, y + this.radius - 10, text, {
          fontFamily: FONT,
          fontSize: '9px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
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
    const idleShell = this.style === 'primary' ? 1 : this.style === 'secondary' ? 0.94 : 0.9;
    const dimmedShell = this.style === 'primary' ? 0.96 : 0.9;
    const idleContent = this.style === 'primary' ? 1 : 0.94;
    const dimmedContent = this.style === 'primary' ? 0.98 : 0.92;
    const shellAlpha = pressed
      ? 1
      : this.dimmed
        ? dimmedShell
        : this.unavailable
          ? idleShell * 0.68
          : idleShell;
    const contentAlpha = pressed
      ? 1
      : this.dimmed
        ? dimmedContent
        : this.unavailable
          ? idleContent * 0.55
          : idleContent;
    const multiplier = pressed ? 1 : this.opacityMultiplier;
    this.circle.setAlpha(shellAlpha * multiplier);
    this.inner.setAlpha(shellAlpha * multiplier);
    this.label.setAlpha(contentAlpha * multiplier);
    this.icon?.setAlpha(contentAlpha * multiplier);
    this.label.setColor(this.unavailable && !pressed ? '#aab3be' : '#ffffff');
    this.icon?.setTint(this.unavailable && !pressed ? 0x98a3ae : 0xffffff);
  }

  private resetAppearance(): void {
    const baseColor = this.style === 'primary' ? 0x0a2139 : 0x0a1a2d;
    const baseAlpha = this.style === 'primary' ? 0.98 : this.style === 'secondary' ? 0.94 : 0.9;
    const innerAlpha = this.style === 'primary' ? 0.24 : 0.14;
    this.circle.setFillStyle(baseColor, baseAlpha);
    this.circle.setStrokeStyle(
      this.style === 'primary' ? 2 : 1.5,
      0xe8cb79,
      this.style === 'primary' ? 0.9 : this.style === 'secondary' ? 0.72 : 0.58,
    );
    this.inner.setFillStyle(this.unavailable ? 0x52606c : this.accent, innerAlpha);
    this.inner.setStrokeStyle(1, this.unavailable ? 0x6f7c89 : this.accent, this.style === 'primary' ? 0.66 : 0.4);
    this.applyOpacity(false);
  }

  /** Replace the caption/icon without rebuilding the touch target. */
  setContent(text: string, iconTex?: string): void {
    const hasIcon = !!iconTex && this.scene.textures.exists(iconTex);
    this.hasIconContent = hasIcon;
    this.label.setText(text);
    if (hasIcon) {
      if (!this.icon) {
        this.icon = this.scene.add.image(this.cx, this.cy, iconTex).setDepth(this.depth + 1);
      } else {
        this.icon.setTexture(iconTex);
      }
      this.icon
        .setPosition(this.cx, text ? this.cy - 7 : this.cy)
        .setScale(this.style === 'primary' && this.radius >= 36 ? 3 : this.radius >= 26 ? 2 : 1)
        .setVisible(this.circle.visible);
      this.label
        .setPosition(this.cx, text ? this.cy + this.radius - 10 : this.cy)
        .setFontSize(8);
    } else {
      this.icon?.setVisible(false);
      this.label
        .setPosition(this.cx, this.cy)
        .setFontSize(this.style === 'primary' ? 13 : this.style === 'secondary' ? 11 : 10);
    }
    this.applyOpacity(false);
  }

  setAccent(color: number): void {
    if (this.accent === color) return;
    this.accent = color;
    this.resetAppearance();
  }

  /** Apply the player's idle-visibility preference without weakening press feedback. */
  setOpacityMultiplier(value: number): void {
    this.opacityMultiplier = Phaser.Math.Clamp(value, 0.8, 1);
    this.applyOpacity(false);
  }

  /** Muted but still tappable, so the player can receive a useful reason. */
  setUnavailable(v: boolean): void {
    if (this.unavailable === v) return;
    this.unavailable = v;
    this.resetAppearance();
  }

  flashWarning(color = 0xe16b6b): void {
    if (this.dimmed) return;
    this.circle.setStrokeStyle(2, color, 0.95);
    this.inner.setFillStyle(color, 0.42).setAlpha(1);
    this.label.setColor('#ffe0e0').setAlpha(1);
    this.icon?.setTint(0xffc4c4).setAlpha(1);
    this.scene.time.delayedCall(180, () => {
      if (this.circle.active) this.resetAppearance();
    });
  }

  setVisible(v: boolean): void {
    this.circle.setVisible(v);
    this.inner.setVisible(v);
    this.label.setVisible(v);
    this.icon?.setVisible(v && this.hasIconContent);
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
