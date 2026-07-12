import Phaser from 'phaser';
import { FONT, UI } from '@/ui/theme';
import { markStartupNoticeSeen } from '@/core/startup-notice';

/**
 * First-install notice between Boot and Title. It is intentionally short and
 * does not claim that paid items exist. Completion is persisted locally so a
 * returning player can reach the title immediately on later cold launches.
 */
export class NoticeScene extends Phaser.Scene {
  private done = false;

  constructor() {
    super('Notice');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, UI.overlay, 1).setOrigin(0);

    let y = Math.max(48, h * 0.13);
    const line = (txt: string, size: number, color: string, gap: number, wrap = true): void => {
      const t = this.add
        .text(w / 2, y, txt, {
          fontFamily: FONT,
          fontSize: `${size}px`,
          color,
          align: 'center',
          lineSpacing: 4,
          // Japanese has no spaces, so per-character wrapping is required.
          wordWrap: wrap ? { width: w - 36, useAdvancedWrap: true } : undefined,
        })
        .setOrigin(0.5, 0);
      y += t.height + gap;
    };

    line('● ご注意 ●', 15, '#ffffff', 18, false);
    line(
      'このゲームは無料で最後まで遊べます。\nプレイデータは、この端末の中に自動で保存されます。',
      12,
      '#cfd3e6',
      34,
    );
    line('● 未成年（18歳未満）の方へ ●', 14, '#ffffff', 18, false);
    line(
      'ゲームを始めるには、保護者（お父さんやお母さんなど）の許可（お許し）が必要です。\n' +
        'ゲームの利用方法（利用時間等）は、保護者とよく相談して決めてください。\n' +
        '長い時間つづけて遊ばず、ときどき休憩してください。',
      12,
      '#cfd3e6',
      24,
    );

    const prompt = this.add
      .text(w / 2, h - 64, 'タップして続ける', { fontFamily: FONT, fontSize: '13px', color: '#ffd86b' })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.25, duration: 700, yoyo: true, repeat: -1 });

    const go = (): void => {
      if (this.done) return;
      this.done = true;
      markStartupNoticeSeen();
      this.cameras.main.fadeOut(150);
      this.time.delayedCall(160, () => this.scene.start('Title'));
    };
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown', go);
    this.time.delayedCall(7000, go); // never a hard gate
  }
}
