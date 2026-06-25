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
    t.setText(crit ? `${amount}!` : `${amount}`);
    t.setColor(crit ? '#ffd24a' : '#ffffff');
    t.setFontSize(crit ? 19 : 13);
    // Dark outline keeps numbers readable over any tile/sprite.
    t.setStroke('#1a1020', crit ? 5 : 4);
    const jitter = Math.round((Math.random() - 0.5) * 10);
    const px = Math.round(x) + jitter;
    const py = Math.round(y);
    t.setPosition(px, py);
    t.setAlpha(1);
    t.setScale(crit ? 1.5 : 1.3);
    t.setVisible(true);
    // Pop in (scale settle), then rise + fade out.
    this.scene.tweens.add({ targets: t, scaleX: 1, scaleY: 1, duration: 160, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: py - (crit ? 28 : 18),
      alpha: 0,
      duration: crit ? 700 : 600,
      delay: crit ? 120 : 60,
      ease: 'Quad.easeOut',
      onComplete: () => this.release(t),
    });
  }

  private acquire(): Phaser.GameObjects.Text {
    const t = this.pool.pop();
    if (t) {
      t.setScale(1);
      return t;
    }
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
