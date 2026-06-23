import Phaser from 'phaser';
import type { PetDef } from '@/pets/pet-defs';

/**
 * Pet actor: a single finished sprite (NOT paper-doll) that trails the player.
 * Decorative in Phase 1 (no combat); its passive bonus is applied in
 * computeDerived. Positions snap to integer pixels.
 */
export class Pet {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly speed = 120;

  constructor(scene: Phaser.Scene, x: number, y: number, def: PetDef) {
    this.sprite = scene.add.image(Math.round(x), Math.round(y), def.textureKey, 0).setOrigin(0.5, 0.875);
    if (def.scale) this.sprite.setScale(def.scale);
    if (def.tint) this.sprite.setTint(Phaser.Display.Color.HexStringToColor(def.tint).color);
  }

  /** Trail toward the target, keeping a small follow distance. */
  update(dtMs: number, tx: number, ty: number): void {
    const dx = tx - this.sprite.x;
    const dy = ty - this.sprite.y;
    const d = Math.hypot(dx, dy);
    if (d > 26) {
      const f = Math.min(1, (this.speed * (dtMs / 1000)) / d);
      this.sprite.x = Math.round(this.sprite.x + dx * f);
      this.sprite.y = Math.round(this.sprite.y + dy * f);
    }
    this.sprite.setDepth(Math.round(this.sprite.y));
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
