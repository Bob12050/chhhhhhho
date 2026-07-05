import Phaser from 'phaser';
import { FONT, addBackdrop, pillButton } from '@/ui/theme';
import { loadSettings, saveSettings, type Settings } from '@/core/settings';
import { soundEngine } from '@/audio/sound-engine';
import { bgm } from '@/audio/bgm-engine';
import { bus } from '@/core/event-bus';

/**
 * Options overlay: BGM / SE volume in 25% steps, persisted to localStorage and
 * applied to the audio engines live. Launched over Title or Inventory (the
 * caller pauses itself and passes its key in `data.from`); closing resumes it.
 */
export class OptionsScene extends Phaser.Scene {
  private from = 'Title';
  private settings: Settings = loadSettings();

  constructor() {
    super('Options');
  }

  create(data?: { from?: string }): void {
    this.from = data?.from ?? 'Title';
    this.settings = loadSettings();
    const w = this.scale.width;
    const h = this.scale.height;
    addBackdrop(this);

    this.add
      .text(w / 2, 60, '設定', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add.rectangle(w / 2, 84, 120, 2, 0xf5c542, 0.7);

    this.volumeRow(140, 'BGM（音楽）', this.settings.bgmVol, (v) => {
      this.settings.bgmVol = v;
      bgm.setVolume(v);
      this.apply();
    });
    this.volumeRow(230, 'SE（効果音）', this.settings.sfxVol, (v) => {
      this.settings.sfxVol = v;
      soundEngine.setVolume(v);
      this.apply();
      bus.emit('sfx:play', { id: 'ui_tap' }); // audible feedback at the new level
    });

    this.add
      .text(w / 2, 300, '設定は自動で保存されます', { fontFamily: FONT, fontSize: '11px', color: '#9aa0b5' })
      .setOrigin(0.5);

    pillButton(this, w / 2, h - 60, 'とじる', () => this.close(), {
      color: '#ffe9a8',
      bg: '#39406a',
      size: 15,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private apply(): void {
    saveSettings(this.settings);
  }

  /** Label + 5 tappable level cells (0/25/50/75/100%). Rebuilds highlight on tap. */
  private volumeRow(y: number, label: string, value: number, onChange: (v: number) => void): void {
    const w = this.scale.width;
    this.add.text(24, y, label, { fontFamily: FONT, fontSize: '14px', color: '#ffffff' });
    const levels = [0, 0.25, 0.5, 0.75, 1];
    const cellW = 52;
    const startX = 24;
    const cy = y + 40;
    const cells: Phaser.GameObjects.Graphics[] = [];
    const labels = ['OFF', '25', '50', '75', '100'];
    const draw = (current: number): void => {
      levels.forEach((lv, i) => {
        const g = cells[i];
        g.clear();
        const x = startX + i * (cellW + 8);
        const active = Math.abs(lv - current) < 0.01;
        g.fillStyle(active ? 0x37406a : 0x191d30, active ? 1 : 0.85);
        g.fillRoundedRect(x, cy - 16, cellW, 32, 8);
        if (active) {
          g.fillStyle(0xf5c542, 0.95);
          g.fillRoundedRect(x + 8, cy + 10, cellW - 16, 3, 2);
        }
        g.lineStyle(1, 0xffffff, active ? 0.18 : 0.06);
        g.strokeRoundedRect(x, cy - 16, cellW, 32, 8);
      });
    };
    levels.forEach((lv, i) => {
      const x = startX + i * (cellW + 8);
      const g = this.add.graphics();
      cells.push(g);
      const t = this.add
        .text(x + cellW / 2, cy - 2, labels[i], {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#e8eaf4',
        })
        .setOrigin(0.5)
        .setDepth(1);
      const hit = this.add
        .rectangle(x + cellW / 2, cy, cellW, 32, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true })
        .setDepth(2);
      hit.on('pointerup', () => {
        onChange(lv);
        draw(lv);
      });
      void t;
    });
    draw(value);
    void w;
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume(this.from);
  }
}
