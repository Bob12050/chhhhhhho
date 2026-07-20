import Phaser from 'phaser';
import { saveManager, SLOT_COUNT, type SlotSummary } from '@/save/save-manager';
import { beginGame } from '@/core/game-flow';
import { getMap } from '@/maps/map-def';
import { getJob } from '@/jobs/job-defs';
import {
  appearanceTexKey,
  appearanceTextureScale,
  baseAppearanceTexKey,
} from '@/jobs/job-appearance';
import { frameIndex } from '@/paperdoll/pose-atlas';
import { TEX } from '@/assets/gen/textures';
import { FONT, addSceneBackdrop, pillButton, ninePanel, titlePlate } from '@/ui/theme';

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
    addSceneBackdrop(this, 0.7);

    titlePlate(this, w / 2, 48, w - 38, 58, 1, 0.98);
    this.add
      .text(w / 2, 48, 'セーブを選択', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1a1030',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.add
      .text(w / 2, 84, '読み込み中…', { fontFamily: FONT, fontSize: '12px', color: '#b9c7dc' })
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
    let y = 106;
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      this.buildRow(summaries[slot], slot, y, w);
      y += 104;
    }
  }

  private buildRow(summary: SlotSummary, slot: number, y: number, w: number): void {
    const cardH = 90;
    const cy = y + cardH / 2;
    // Card panel (9-slice frame) + gold left-edge accent + slot chip.
    ninePanel(this, w / 2, cy, w - 24, cardH, { active: summary.exists }).setDepth(1);
    this.add
      .text(90, y + 10, `スロット ${slot + 1}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#cfd3e6',
        fontStyle: 'bold',
      })
      .setDepth(2);

    if (summary.exists) {
      const job = summary.jobId ? getJob(summary.jobId) : undefined;
      const gender = summary.gender ?? 'female';
      const art = appearanceTexKey(job?.appearance, gender);
      const texture = art && this.textures.exists(art)
        ? art
        : baseAppearanceTexKey(gender);
      this.add
        .ellipse(54, y + 76, 44, 12, 0x050814, 0.52)
        .setDepth(2);
      this.add
        .sprite(54, y + 82, texture, frameIndex('down', 'idle', 0))
        .setOrigin(0.5, 0.875)
        .setScale(0.64 * appearanceTextureScale(texture))
        .setDepth(3);
      const mapName = summary.mapId ? getMap(summary.mapId)?.name ?? summary.mapId : '';
      this.add
        .text(90, y + 30, summary.playerName ?? '冒険者', {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#fff0b0',
          fontStyle: 'bold',
        })
        .setDepth(2);
      this.add.text(90, y + 51, `Lv ${summary.level ?? '?'}  ${job?.name ?? '冒険者'}  ${mapName}`, {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#9fd0ff',
      }).setDepth(2);
      const when = summary.savedAt ? new Date(summary.savedAt).toLocaleString('ja-JP') : '';
      this.add
        .text(90, y + 72, when, { fontFamily: FONT, fontSize: '10px', color: '#aebed1' })
        .setDepth(2);
      pillButton(this, w - 62, y + 27, 'つづき', () => void beginGame(this, slot, 'load'), {
        color: '#bfffce',
        bg: '#274a30',
        size: 13,
      }).setDepth(3);
      this.makeDeleteButton(slot, w - 62, y + 67);
    } else {
      this.add.circle(54, cy, 23, 0x10264a, 0.95).setStrokeStyle(2, 0xd8b45b, 0.75).setDepth(2);
      this.add.image(54, cy, TEX.iconSword).setScale(2).setTint(0xffdf85).setDepth(3);
      this.add
        .text(90, y + 31, '新しい冒険', { fontFamily: FONT, fontSize: '15px', color: '#e8eefc' })
        .setDepth(2);
      this.add.text(90, y + 55, '最初から始める', { fontFamily: FONT, fontSize: '10px', color: '#8fa0b8' }).setDepth(2);
      pillButton(this, w - 66, cy, '＋ はじめる', () => {
        this.scene.start('CharacterSelect', { slot });
      }, {
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
