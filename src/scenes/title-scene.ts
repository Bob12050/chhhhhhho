import Phaser from 'phaser';
import { applyPendingUpdate } from '@/core/pwa';
import { bus } from '@/core/event-bus';
import { FONT } from '@/ui/theme';
import { soundEngine } from '@/audio/sound-engine';

/**
 * Title screen. Entry point after Boot. A pending PWA update (deferred during
 * play) is applied here, where a reload is safe. From here the player goes to
 * save-slot selection.
 */
export class TitleScene extends Phaser.Scene {
  private updateText?: Phaser.GameObjects.Text;

  constructor() {
    super('Title');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add
      .text(w / 2, h * 0.32, 'Pixel Action RPG', {
        fontFamily: FONT,
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h * 0.32 + 30, '〜 仮タイトル 〜', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9aa0b5',
      })
      .setOrigin(0.5);

    this.makeButton(w / 2, h * 0.56, '▶ ゲームをはじめる', () => this.scene.start('SaveSelect'));

    // Sound toggle (device preference, persisted). Tapping it also counts as the
    // user gesture that unlocks Web Audio, so the confirm blip is audible.
    const soundBtn = this.makeButton(w / 2, h * 0.56 + 56, this.soundLabel(), () => {
      const muted = soundEngine.toggleMute();
      soundBtn.setText(this.soundLabel());
      if (!muted) bus.emit('sfx:play', { id: 'ui_tap' });
    });

    // If a new app version is waiting, offer to apply it now (safe at title).
    this.updateText = this.add
      .text(w / 2, h - 40, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ffd86b',
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.updateText.on('pointerup', () => void applyPendingUpdate());
    const off = bus.on('pwa:update-available', () => {
      this.updateText?.setText('更新があります（タップで適用）').setVisible(true);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  private soundLabel(): string {
    return soundEngine.isMuted() ? 'サウンド: OFF' : 'サウンド: ON';
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    onTap: () => void,
  ): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#2a2d44',
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    t.on('pointerup', onTap);
    return t;
  }
}
