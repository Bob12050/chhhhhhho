import Phaser from 'phaser';
import { saveManager, SLOT_COUNT, type SlotSummary } from '@/save/save-manager';
import { beginGame } from '@/core/game-flow';
import { FONT } from '@/ui/theme';

/**
 * Save-slot selection. Shows each slot's summary; an empty slot starts a new
 * game, a filled slot continues. Overwrite/delete is intentionally deferred
 * (later save-management UI) to keep this safe and simple.
 */
export class SaveSelectScene extends Phaser.Scene {
  constructor() {
    super('SaveSelect');
  }

  create(): void {
    const w = this.scale.width;

    this.add
      .text(w / 2, 40, 'セーブを選択', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, 70, '読み込み中…', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9aa0b5',
      })
      .setOrigin(0.5)
      .setName('loading');

    this.makeButton(w / 2 - 70, this.scale.height - 44, '◀ もどる', () => this.scene.start('Title'));
    this.makeResetAllButton(w / 2 + 70, this.scale.height - 44);

    void this.populate();
  }

  private async populate(): Promise<void> {
    const summaries = await saveManager.summaries();
    this.children.getByName('loading')?.destroy();
    const w = this.scale.width;
    let y = 120;
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      this.buildRow(summaries[slot], slot, y, w);
      y += 92;
    }
  }

  private buildRow(summary: SlotSummary, slot: number, y: number, w: number): void {
    this.add.rectangle(w / 2, y + 18, w - 32, 76, 0x1b1e30, 0.9).setStrokeStyle(1, 0x3a3f5e);

    this.add
      .text(28, y, `スロット ${slot + 1}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfd3e6',
      })
      .setOrigin(0, 0);

    if (summary.exists) {
      const when = summary.savedAt ? new Date(summary.savedAt).toLocaleString('ja-JP') : '';
      this.add
        .text(28, y + 22, `Lv ${summary.level ?? '?'}  ${summary.mapId ?? ''}\n${when}`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#9fd0ff',
          lineSpacing: 2,
        })
        .setOrigin(0, 0);
      this.makeButton(w - 78, y + 8, 'つづき', () => void beginGame(this, slot, 'load'));
      this.makeDeleteButton(slot, w - 78, y + 44);
    } else {
      this.add
        .text(28, y + 26, '（空き）', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#7e8499',
        })
        .setOrigin(0, 0);
      this.makeButton(w - 96, y + 26, '＋ はじめる', () => void beginGame(this, slot, 'new'));
    }
  }

  /** Delete button with a two-tap confirm to avoid accidental wipes. */
  private makeDeleteButton(slot: number, x: number, y: number): void {
    let armed = false;
    const t = this.add
      .text(x, y, '削除', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#e58a8a',
        backgroundColor: '#2a2d44',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    t.on('pointerup', () => {
      if (!armed) {
        armed = true;
        t.setText('本当に？').setColor('#ff6666');
        this.time.delayedCall(2000, () => {
          armed = false;
          if (t.active) t.setText('削除').setColor('#e58a8a');
        });
        return;
      }
      void saveManager.delete(slot).then(() => this.scene.restart());
    });
  }

  /** Wipe every slot (two-tap confirm). */
  private makeResetAllButton(x: number, y: number): void {
    let armed = false;
    const t = this.add
      .text(x, y, '全初期化', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#e58a8a',
        backgroundColor: '#2a2d44',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    t.on('pointerup', () => {
      if (!armed) {
        armed = true;
        t.setText('全部消す？').setColor('#ff6666');
        this.time.delayedCall(2500, () => {
          armed = false;
          if (t.active) t.setText('全初期化').setColor('#e58a8a');
        });
        return;
      }
      void saveManager.deleteAll().then(() => this.scene.restart());
    });
  }

  private makeButton(x: number, y: number, label: string, onTap: () => void): void {
    const t = this.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#2a2d44',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    t.on('pointerup', onTap);
  }
}
