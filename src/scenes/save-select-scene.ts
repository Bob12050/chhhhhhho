import Phaser from 'phaser';
import { saveManager, SLOT_COUNT, type SlotSummary } from '@/save/save-manager';
import { beginGame } from '@/core/game-flow';
import { getMap } from '@/maps/map-def';
import { FONT, addSceneBackdrop, pillButton, ninePanel } from '@/ui/theme';

/**
 * Save-slot selection. Shows each slot's summary; an empty slot starts a new
 * game, a filled slot continues. Themed to match the title screen (grass world
 * + navy wash) so the front-end feels like one piece.
 */
export class SaveSelectScene extends Phaser.Scene {
  constructor() {
    super('SaveSelect');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    addSceneBackdrop(this, 0.8);

    // Title + gold rule (title-screen language).
    this.add
      .text(w / 2, 42, 'セーブを選択', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1a1030',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.add.rectangle(w / 2, 64, 150, 2, 0xf5c542, 0.7).setDepth(2);

    this.add
      .text(w / 2, 80, '読み込み中…', { fontFamily: FONT, fontSize: '12px', color: '#9aa0b5' })
      .setOrigin(0.5)
      .setDepth(2)
      .setName('loading');

    pillButton(this, w / 2 - 72, h - 40, '◀ もどる', () => this.scene.start('Title')).setDepth(2);
    this.makeResetAllButton(w / 2 + 74, h - 40);

    void this.populate();
  }

  private async populate(): Promise<void> {
    const summaries = await saveManager.summaries();
    this.children.getByName('loading')?.destroy();
    const w = this.scale.width;
    let y = 116;
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      this.buildRow(summaries[slot], slot, y, w);
      y += 96;
    }
  }

  private buildRow(summary: SlotSummary, slot: number, y: number, w: number): void {
    const cardH = 80;
    const cy = y + cardH / 2;
    // Card panel (9-slice frame) + gold left-edge accent + slot chip.
    ninePanel(this, w / 2, cy, w - 32, cardH, { active: summary.exists }).setDepth(1);
    this.add.rectangle(17, cy, 4, cardH, summary.exists ? 0xf5c542 : 0x555a78, 1).setOrigin(0, 0.5).setDepth(2);
    this.add
      .text(28, y + 10, `スロット ${slot + 1}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfd3e6',
        fontStyle: 'bold',
      })
      .setDepth(2);

    if (summary.exists) {
      // Character emblem (round chip) — reads as "a save with a hero in it".
      this.add.circle(w - 118, cy, 15, 0x2a2d44).setStrokeStyle(2, 0x46508a, 1).setDepth(2);
      this.add.circle(w - 118, cy - 3, 6, 0xf0c8a0).setDepth(3); // head
      this.add.rectangle(w - 118, cy + 8, 14, 8, 0x6a4ea0).setDepth(3); // body
      const mapName = summary.mapId ? getMap(summary.mapId)?.name ?? summary.mapId : '';
      this.add
        .text(28, y + 32, `Lv ${summary.level ?? '?'}`, {
          fontFamily: FONT,
          fontSize: '16px',
          color: '#9fd0ff',
          fontStyle: 'bold',
        })
        .setDepth(2);
      this.add
        .text(78, y + 36, mapName, { fontFamily: FONT, fontSize: '12px', color: '#cfd3e6' })
        .setDepth(2);
      const when = summary.savedAt ? new Date(summary.savedAt).toLocaleString('ja-JP') : '';
      this.add
        .text(28, y + 56, when, { fontFamily: FONT, fontSize: '10px', color: '#7e8499' })
        .setDepth(2);
      pillButton(this, w - 62, y + 20, 'つづき', () => void beginGame(this, slot, 'load'), {
        color: '#bfffce',
        bg: '#274a30',
        size: 13,
      }).setDepth(3);
      this.makeDeleteButton(slot, w - 62, y + 56);
    } else {
      this.add
        .text(28, y + 38, '（空き）', { fontFamily: FONT, fontSize: '13px', color: '#7e8499' })
        .setDepth(2);
      pillButton(this, w - 66, cy, '＋ はじめる', () => void beginGame(this, slot, 'new'), {
        color: '#ffe9a8',
        bg: '#3a3050',
        size: 14,
      }).setDepth(3);
    }
  }

  /** Delete button with a two-tap confirm to avoid accidental wipes. */
  private makeDeleteButton(slot: number, x: number, y: number): void {
    let armed = false;
    const t = this.add
      .text(x, y, '削除', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#e58a8a',
        backgroundColor: '#2a2d44',
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(3)
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
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5)
      .setDepth(2)
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
}
