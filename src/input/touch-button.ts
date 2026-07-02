import Phaser from 'phaser';
import { FONT } from '@/ui/theme';

/**
 * Round touch button. Handles multi-touch correctly: it binds to the specific
 * pointer id that pressed it, releases when that finger lifts, and cancels if
 * the finger slides outside the button radius. Minimum 48 logical px.
 */
export class TouchButton {
  private readonly circle: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private pointerId = -1;
  private readonly cx: number;
  private readonly cy: number;
  private readonly radius: number;

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
    this.circle = scene.add.circle(x, y, this.radius, color, 0.35).setDepth(depth);
    this.circle.setStrokeStyle(2, 0xffffff, 0.4);
    // Icon + smaller caption reads better than a bare letter; integer scale
    // only (pixel-art rule).
    if (iconTex && scene.textures.exists(iconTex)) {
      const scale = this.radius >= 30 ? 2 : 1;
      scene.add.image(x, text ? y - 5 : y, iconTex).setScale(scale).setDepth(depth + 1);
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
    this.circle.setFillStyle(this.circle.fillColor, 0.35);
    this.onChange?.(false);
  }

  setVisible(v: boolean): void {
    this.circle.setVisible(v);
    this.label.setVisible(v);
    if (!v && this.pointerId !== -1) {
      this.pointerId = -1;
      this.onChange?.(false);
    }
  }

  private contains(p: Phaser.Input.Pointer): boolean {
    return Phaser.Math.Distance.Between(p.x, p.y, this.cx, this.cy) <= this.radius;
  }

  private press(p: Phaser.Input.Pointer): void {
    if (!this.circle.visible || this.pointerId !== -1) return;
    this.pointerId = p.id;
    this.circle.setFillStyle(this.circle.fillColor, 0.6);
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
    this.circle.setFillStyle(this.circle.fillColor, 0.35);
    this.onChange?.(false);
  }
}
