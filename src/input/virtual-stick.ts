import Phaser from 'phaser';

/**
 * Dynamic virtual analog stick for either lower corner. The base appears wherever
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
  private readonly radius: number;
  private readonly standbyX: number;
  private readonly standbyY: number;
  private readonly idleOpacity: number;

  vector = new Phaser.Math.Vector2(0, 0);

  constructor(
    scene: Phaser.Scene,
    zoneRect: Phaser.Geom.Rectangle,
    depth: number,
    options?: { scale?: number; opacity?: number; standby?: { x: number; y: number } },
  ) {
    const scale = Phaser.Math.Clamp(options?.scale ?? 1, 0.85, 1.2);
    this.radius = 44 * scale;
    this.idleOpacity = Phaser.Math.Clamp(options?.opacity ?? 1, 0.5, 1);
    this.standbyX = options?.standby?.x ?? zoneRect.x + 60;
    this.standbyY = options?.standby?.y ?? zoneRect.y + zoneRect.height - 60;
    this.zone = scene.add
      .zone(zoneRect.x, zoneRect.y, zoneRect.width, zoneRect.height)
      .setOrigin(0, 0)
      .setInteractive();
    this.zone.setDepth(depth);

    this.baseGfx = scene.add
      .circle(0, 0, this.radius, 0x081522, 0.58)
      .setStrokeStyle(1.5, 0xdce8f3, 0.22)
      .setDepth(depth);
    this.thumbGfx = scene.add
      .circle(0, 0, 18 * scale, 0x294b68, 0.82)
      .setStrokeStyle(1, 0xe6f0f6, 0.32)
      .setDepth(depth + 1);
    this.baseGfx.setPosition(this.standbyX, this.standbyY).setAlpha(0.56 * this.idleOpacity);
    this.thumbGfx.setPosition(this.standbyX, this.standbyY).setAlpha(0.7 * this.idleOpacity);

    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => this.onUp(p));
    scene.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.onUp(p));
    scene.input.on('pointercancel', (p: Phaser.Input.Pointer) => this.onUp(p));
    // Self-heal: if the tracked finger's pointerup was ever missed (multi-touch,
    // a menu opening mid-drag, OS interruptions), the stick would stay "held"
    // and ignore new touches — making the player unable to move. Each frame,
    // verify the tracked pointer is still down; otherwise release.
    scene.events.on(Phaser.Scenes.Events.UPDATE, () => this.poll(scene));
  }

  private poll(scene: Phaser.Scene): void {
    if (this.pointerId === -1) return;
    const p = scene.input.manager.pointers.find((pt) => pt.id === this.pointerId);
    if (!p || !p.isDown) this.reset();
  }

  /** Release the tracked pointer and return the stick to its neutral position. */
  reset(): void {
    this.pointerId = -1;
    this.vector.set(0, 0);
    this.baseGfx
      .setPosition(this.standbyX, this.standbyY)
      .setAlpha(0.56 * this.idleOpacity)
      .setVisible(true);
    this.thumbGfx
      .setPosition(this.standbyX, this.standbyY)
      .setAlpha(0.7 * this.idleOpacity)
      .setVisible(true);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== -1) return; // already tracking another finger
    this.pointerId = p.id;
    this.originX = p.x;
    this.originY = p.y;
    this.baseGfx.setPosition(p.x, p.y).setAlpha(1).setVisible(true);
    this.thumbGfx.setPosition(p.x, p.y).setAlpha(1).setVisible(true);
    this.update(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.update(p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.reset();
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
