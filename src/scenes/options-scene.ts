import Phaser from 'phaser';
import { FONT, addBackdrop, pillButton } from '@/ui/theme';
import { loadSettings, saveSettings, type Settings } from '@/core/settings';
import { soundEngine } from '@/audio/sound-engine';
import { bgm } from '@/audio/bgm-engine';
import { bus } from '@/core/event-bus';
import { isDebugEnabled, setDebugEnabled } from '@/core/debug';

/**
 * Options overlay: BGM / SE volume and debug-mode toggle, persisted locally and
 * applied live. Launched over Title or Inventory (the caller pauses itself and
 * passes its key in `data.from`); closing resumes it.
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

    this.toggleRow(335, 'デバッグモード', isDebugEnabled(), (enabled) => {
      setDebugEnabled(enabled);
      this.syncDebugScenes(enabled);
    });

    this.add
      .text(w / 2, 390, '設定は自動で保存されます', { fontFamily: FONT, fontSize: '11px', color: '#9aa0b5' })
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

  /** Full-row binary setting with a familiar switch control. */
  private toggleRow(y: number, label: string, value: boolean, onChange: (enabled: boolean) => void): void {
    const w = this.scale.width;
    const trackX = w - 58;
    let current = value;

    const row = this.add.graphics();
    row.fillStyle(0x171b2d, 0.92);
    row.fillRoundedRect(24, y - 27, w - 48, 54, 8);
    row.lineStyle(1, 0xffffff, 0.07);
    row.strokeRoundedRect(24, y - 27, w - 48, 54, 8);

    this.add
      .text(36, y, label, { fontFamily: FONT, fontSize: '14px', color: '#ffffff' })
      .setOrigin(0, 0.5);
    const state = this.add
      .text(trackX - 35, y, '', { fontFamily: FONT, fontSize: '11px', color: '#9aa0b5' })
      .setOrigin(1, 0.5);
    const track = this.add.graphics();
    const knob = this.add.circle(trackX, y, 10, 0xffffff, 1);

    const draw = (): void => {
      track.clear();
      track.fillStyle(current ? 0x46508a : 0x292d42, 1);
      track.fillRoundedRect(trackX - 24, y - 14, 48, 28, 14);
      track.lineStyle(1, current ? 0xf5c542 : 0xffffff, current ? 0.75 : 0.12);
      track.strokeRoundedRect(trackX - 24, y - 14, 48, 28, 14);
      knob.setPosition(trackX + (current ? 10 : -10), y);
      knob.setFillStyle(current ? 0xffe9a8 : 0xb6bbca, 1);
      state.setText(current ? 'ON' : 'OFF');
      state.setColor(current ? '#ffe9a8' : '#9aa0b5');
    };

    this.add
      .zone(w / 2, y, w - 48, 54)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        current = !current;
        onChange(current);
        draw();
        bus.emit('sfx:play', { id: 'ui_tap' });
      });
    draw();
  }

  private syncDebugScenes(enabled: boolean): void {
    if (!enabled) {
      this.scene.stop('Debug');
      this.scene.stop('DebugOverlay');
      return;
    }
    if (this.from === 'Inventory' && !this.scene.isActive('DebugOverlay')) {
      this.scene.launch('DebugOverlay');
    }
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume(this.from);
  }
}
