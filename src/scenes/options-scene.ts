import Phaser from 'phaser';
import { FONT, addBackdrop, pillButton, tabChip, titlePlate, type TabHandle } from '@/ui/theme';
import { loadSettings, saveSettings, type Settings } from '@/core/settings';
import { soundEngine } from '@/audio/sound-engine';
import { bgm } from '@/audio/bgm-engine';
import { bus } from '@/core/event-bus';
import { isDebugEnabled, setDebugEnabled } from '@/core/debug';

/**
 * Options overlay: sound, mobile controls, and debug mode. Values persist
 * locally; sound applies live and control layout refreshes when the menu closes.
 * Launched over Title or Inventory; closing resumes the caller.
 */
export class OptionsScene extends Phaser.Scene {
  private from = 'Title';
  private settings: Settings = loadSettings();
  private content!: Phaser.GameObjects.Container;
  private sectionTabs: Array<{ id: 'sound' | 'controls'; tab: TabHandle }> = [];
  private controlsDirty = false;
  private closing = false;

  constructor() {
    super('Options');
  }

  create(data?: { from?: string }): void {
    this.from = data?.from ?? 'Title';
    this.settings = loadSettings();
    this.controlsDirty = false;
    this.closing = false;
    const w = this.scale.width;
    const h = this.scale.height;
    addBackdrop(this);
    titlePlate(this, w / 2, 48, w - 72, 50, 0, 0.96);

    this.add
      .text(w / 2, 48, '設定', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add.rectangle(w / 2, 69, 120, 2, 0xf5c542, 0.7);

    this.sectionTabs = [
      {
        id: 'sound',
        tab: tabChip(this, w / 2 - 82, 98, 156, 'サウンド', () => this.showSection('sound')),
      },
      {
        id: 'controls',
        tab: tabChip(this, w / 2 + 82, 98, 156, '操作', () => this.showSection('controls')),
      },
    ];
    this.content = this.add.container(0, 0);
    this.showSection('sound');

    pillButton(this, w / 2, h - 60, 'とじる', () => this.close(), {
      color: '#ffe9a8',
      bg: '#39406a',
      size: 15,
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private apply(controlsChanged = false): void {
    saveSettings(this.settings);
    this.controlsDirty ||= controlsChanged;
  }

  private showSection(section: 'sound' | 'controls'): void {
    this.sectionTabs.forEach((entry) => entry.tab.setActive(entry.id === section));
    this.content.removeAll(true);

    if (section === 'sound') {
      this.volumeRow(138, 'BGM（音楽）', this.settings.bgmVol, (v) => {
        this.settings.bgmVol = v;
        bgm.setVolume(v);
        this.apply();
      });
      this.volumeRow(226, 'SE（効果音）', this.settings.sfxVol, (v) => {
        this.settings.sfxVol = v;
        soundEngine.setVolume(v);
        this.apply();
        bus.emit('sfx:play', { id: 'ui_tap' });
      });
      const debugMenuButton = pillButton(
        this,
        this.scale.width / 2,
        424,
        'デバッグメニューを開く',
        () => this.openDebugMenu(),
        {
          color: '#ffe9a8',
          bg: '#4a3040',
          size: 14,
        },
      );
      const setDebugMenuVisible = (enabled: boolean): void => {
        debugMenuButton.setVisible(enabled);
        if (debugMenuButton.input) debugMenuButton.input.enabled = enabled;
      };
      setDebugMenuVisible(isDebugEnabled());
      this.content.add(debugMenuButton);

      this.toggleRow(340, 'デバッグモード', isDebugEnabled(), (enabled) => {
        setDebugEnabled(enabled);
        this.syncDebugScenes(enabled);
        setDebugMenuVisible(enabled);
      });
    } else {
      this.choiceRow(
        138,
        '操作ボタンの大きさ',
        [
          { label: '小', value: 0.9 },
          { label: '標準', value: 1 },
          { label: '大', value: 1.12 },
        ],
        this.settings.controlScale,
        (value) => {
          this.settings.controlScale = value;
          this.apply(true);
        },
      );
      this.choiceRow(
        226,
        '操作ボタンの濃さ',
        [
          { label: '薄', value: 0.6 },
          { label: '標準', value: 0.82 },
          { label: '濃', value: 1 },
        ],
        this.settings.controlOpacity,
        (value) => {
          this.settings.controlOpacity = value;
          this.apply(true);
        },
      );
      this.toggleRow(340, '左利きモード', this.settings.leftHanded, (enabled) => {
        this.settings.leftHanded = enabled;
        this.apply(true);
      });
    }

    this.content.add(
      this.add
        .text(this.scale.width / 2, section === 'sound' ? 478 : 398, '設定は自動で保存されます', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#9aa0b5',
        })
        .setOrigin(0.5),
    );
  }

  /** Label + 5 tappable level cells (0/25/50/75/100%). Rebuilds highlight on tap. */
  private volumeRow(y: number, label: string, value: number, onChange: (v: number) => void): void {
    this.content.add(this.add.text(24, y, label, { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }));
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
      this.content.add(g);
      const t = this.add
        .text(x + cellW / 2, cy - 2, labels[i], {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#e8eaf4',
        })
        .setOrigin(0.5)
        .setDepth(1);
      this.content.add(t);
      const hit = this.add
        .rectangle(x + cellW / 2, cy, cellW, 32, 0x000000, 0.001)
        .setInteractive({ useHandCursor: true })
        .setDepth(2);
      this.content.add(hit);
      hit.on('pointerup', () => {
        onChange(lv);
        draw(lv);
      });
      void t;
    });
    draw(value);
  }

  private choiceRow(
    y: number,
    label: string,
    options: Array<{ label: string; value: number }>,
    value: number,
    onChange: (value: number) => void,
  ): void {
    const w = this.scale.width;
    this.content.add(this.add.text(24, y, label, { fontFamily: FONT, fontSize: '14px', color: '#ffffff' }));
    const gap = 8;
    const startX = 24;
    const cellW = (w - 48 - gap * (options.length - 1)) / options.length;
    const cy = y + 40;
    const cells: Phaser.GameObjects.Graphics[] = [];
    const labels: Phaser.GameObjects.Text[] = [];
    const draw = (current: number): void => {
      let activeIndex = 0;
      options.forEach((option, index) => {
        if (Math.abs(option.value - current) < Math.abs(options[activeIndex].value - current)) activeIndex = index;
      });
      options.forEach((_, index) => {
        const g = cells[index];
        const active = index === activeIndex;
        g.clear();
        g.fillStyle(active ? 0x37406a : 0x191d30, active ? 1 : 0.85);
        g.fillRoundedRect(startX + index * (cellW + gap), cy - 18, cellW, 36, 8);
        if (active) {
          g.fillStyle(0xf5c542, 0.95);
          g.fillRoundedRect(startX + index * (cellW + gap) + 10, cy + 12, cellW - 20, 3, 2);
        }
        g.lineStyle(1, 0xffffff, active ? 0.18 : 0.07);
        g.strokeRoundedRect(startX + index * (cellW + gap), cy - 18, cellW, 36, 8);
        labels[index].setColor(active ? '#ffffff' : '#a7adc2');
      });
    };

    options.forEach((option, index) => {
      const x = startX + index * (cellW + gap);
      const g = this.add.graphics();
      const text = this.add
        .text(x + cellW / 2, cy - 2, option.label, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#e8eaf4',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const hit = this.add
        .zone(x + cellW / 2, cy, cellW, 40)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          onChange(option.value);
          draw(option.value);
          bus.emit('sfx:play', { id: 'ui_tap' });
        });
      cells.push(g);
      labels.push(text);
      this.content.add([g, text, hit]);
    });
    draw(value);
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
    this.content.add(row);

    const labelText = this.add
      .text(36, y, label, { fontFamily: FONT, fontSize: '14px', color: '#ffffff' })
      .setOrigin(0, 0.5);
    const state = this.add
      .text(trackX - 35, y, '', { fontFamily: FONT, fontSize: '11px', color: '#9aa0b5' })
      .setOrigin(1, 0.5);
    const track = this.add.graphics();
    const knob = this.add.circle(trackX, y, 10, 0xffffff, 1);
    this.content.add([labelText, state, track, knob]);

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

    const hit = this.add
      .zone(w / 2, y, w - 48, 54)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        current = !current;
        onChange(current);
        draw();
        bus.emit('sfx:play', { id: 'ui_tap' });
      });
    this.content.add(hit);
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

  private openDebugMenu(): void {
    if (!isDebugEnabled() || this.scene.isActive('Debug')) return;
    this.scene.pause();
    this.scene.launch('Debug', {
      returnTo: 'Options',
      settingsFrom: this.from,
    });
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    if (this.controlsDirty) bus.emit('settings:controls-changed', {});
    this.scene.stop();
    this.scene.resume(this.from);
  }
}
