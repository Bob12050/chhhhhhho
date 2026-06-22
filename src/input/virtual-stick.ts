import Phaser from 'phaser';

/**
 * Dynamic virtual analog stick for the lower-left. The base appears wherever
 * the finger first touches (within the active zone) and the thumb tracks the
 * finger; releasing snaps back to center. Outputs a vector in [-1, 1].
 *
 * Tracks a single pointer id so other fingers (buttons) don't interfere.
 */
export class VirtualStick {
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly baseGfx: Phaser.GameObjects.Arc;
  private readonly thumbGfx: Phaser.GameObjects.Arc;

  private pointerId = -1;
  private originX = 0;
  private originY = 0;
  private readonly radius = 44;

  vector = new Phaser.Math.Vector2(0, 0);

  constructor(scene: Phaser.Scene, zoneRect: Phaser.Geom.Rectangle, depth: number) {
    this.zone = scene.add
      .zone(zoneRect.x, zoneRect.y, zoneRect.width, zoneRect.height)
      .setOrigin(0, 0)
      .setInteractive();
    this.zone.setDepth(depth);

    this.baseGfx = scene.add.circle(0, 0, this.radius, 0xffffff, 0.08).setDepth(depth);
    this.thumbGfx = scene.add.circle(0, 0, 20, 0xffffff, 0.22).setDepth(depth + 1);
    this.baseGfx.setVisible(false);
    this.thumbGfx.setVisible(false);

    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== -1) return; // already tracking another finger
    this.pointerId = p.id;
    this.originX = p.x;
    this.originY = p.y;
    this.baseGfx.setPosition(p.x, p.y).setVisible(true);
    this.thumbGfx.setPosition(p.x, p.y).setVisible(true);
    this.update(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.update(p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = -1;
    this.vector.set(0, 0);
    this.baseGfx.setVisible(false);
    this.thumbGfx.setVisible(false);
  }

  private update(px: number, py: number): void {
    let dx = px - this.originX;
    let dy = py - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > this.radius) {
      dx = (dx / len) * this.radius;
      dy = (dy / len) * this.radius;
    }
    this.thumbGfx.setPosition(this.originX + dx, this.originY + dy);
    // Dead zone to avoid jitter.
    const dead = 6;
    this.vector.set(
      Math.abs(dx) < dead ? 0 : dx / this.radius,
      Math.abs(dy) < dead ? 0 : dy / this.radius,
    );
  }

  isActive(): boolean {
    return this.pointerId !== -1;
  }
}
