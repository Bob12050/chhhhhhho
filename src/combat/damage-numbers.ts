import Phaser from 'phaser';

/**
 * Pooled floating damage numbers. Reuses Text objects (per mobile-perf budget:
 * damage numbers must use an object pool).
 */
export class DamageNumbers {
  private readonly scene: Phaser.Scene;
  private readonly pool: Phaser.GameObjects.Text[] = [];
  private readonly depth: number;

  constructor(scene: Phaser.Scene, depth = 2000) {
    this.scene = scene;
    this.depth = depth;
  }

  show(x: number, y: number, amount: number, crit: boolean): void {
    const t = this.acquire();
    t.setText(`${amount}`);
    t.setColor(crit ? '#ffd24a' : '#ffffff');
    t.setFontSize(crit ? 16 : 12);
    t.setPosition(Math.round(x), Math.round(y));
    t.setAlpha(1);
    t.setVisible(true);
    this.scene.tweens.add({
      targets: t,
      y: y - 18,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => this.release(t),
    });
  }

  private acquire(): Phaser.GameObjects.Text {
    const t = this.pool.pop();
    if (t) return t;
    return this.scene.add
      .text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(this.depth);
  }

  private release(t: Phaser.GameObjects.Text): void {
    t.setVisible(false);
    this.pool.push(t);
  }
}
