import Phaser from 'phaser';
import { FONT } from '@/ui/theme';

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

  /** `color` overrides the number color (e.g. elemental / DoT tints). */
  show(x: number, y: number, amount: number, crit: boolean, color?: string): void {
    const t = this.acquire();
    t.setText(crit ? `${amount}!!` : `${amount}`);
    t.setColor(color ?? (crit ? '#ffd24a' : '#ffffff'));
    t.setFontSize(crit ? 21 : 15);
    // Dark outline keeps numbers readable over any tile/sprite.
    t.setStroke('#1a1020', crit ? 6 : 4);
    t.setShadow(0, 2, '#000000', 2, false, true);
    const jitter = Math.round((Math.random() - 0.5) * 10);
    const px = Math.round(x) + jitter;
    const py = Math.round(y);
    t.setPosition(px, py);
    t.setAlpha(1);
    t.setScale(crit ? 1.65 : 1.35);
    t.setVisible(true);
    // Pop in (scale settle), then rise + fade out.
    this.scene.tweens.add({ targets: t, scaleX: 1, scaleY: 1, duration: 180, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: t,
      y: py - (crit ? 34 : 24),
      alpha: 0,
      duration: crit ? 820 : 690,
      delay: crit ? 140 : 70,
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
      .text(0, 0, '', { fontFamily: FONT, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(this.depth);
  }

  private release(t: Phaser.GameObjects.Text): void {
    t.setVisible(false);
    this.pool.push(t);
  }
}
