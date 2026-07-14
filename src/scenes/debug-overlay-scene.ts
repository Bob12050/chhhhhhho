import Phaser from 'phaser';
import { bus } from '@/core/event-bus';
import { readInsets } from '@/core/safe-area';
import { FONT } from '@/ui/theme';
import { DEBUG_DEPTH } from '@/core/debug';

const PLAY_HUD_SCENES = new Set(['World', 'UI', 'DebugOverlay']);

/**
 * Developer overlay — launched ONLY when debug is enabled (see core/debug). It is
 * a separate scene kept on top of everything (game UI is never mixed with dev
 * tools) at DEBUG_DEPTH. Hosts the small "DEV" button in the top-right that opens
 * the existing debug menu (warp / grant). It stays absent while the setting is
 * off, so screenshots and regular play remain clean by default.
 */
export class DebugOverlayScene extends Phaser.Scene {
  private button?: Phaser.GameObjects.Container;

  constructor() {
    super('DebugOverlay');
  }

  create(): void {
    this.scene.bringToTop();
    const w = this.scale.width;
    const cssPerLogical = this.scale.displaySize.width / this.scale.gameSize.width;
    const insets = readInsets(cssPerLogical || 1);

    // Debug stays reachable but visually recedes into the utility cluster. The
    // hit area remains comfortably larger than the small on-screen badge.
    const plate = this.add.graphics();
    plate.fillStyle(0x091522, 0.86);
    plate.fillRoundedRect(-14, -8, 28, 16, 4);
    plate.lineStyle(1, 0xc7d2df, 0.18);
    plate.strokeRoundedRect(-14, -8, 28, 16, 4);
    const label = this.add
      .text(0, 0, 'DEV', {
        fontFamily: FONT,
        fontSize: '8px',
        color: '#aeb9c7',
      })
      .setOrigin(0.5);
    const btn = this.add
      .container(w - insets.right - 82, insets.top + 13, [plate, label])
      .setSize(36, 30)
      .setScrollFactor(0)
      .setDepth(DEBUG_DEPTH)
      .setAlpha(0.58)
      .setInteractive({ useHandCursor: true });
    this.button = btn;
    btn.on('pointerdown', () => btn.setAlpha(0.95));
    btn.on('pointerout', () => btn.setAlpha(0.58));
    btn.on('pointerup', () => {
      btn.setAlpha(0.58);
      bus.emit('ui:open-debug', {});
    });
  }

  update(): void {
    // The developer shortcut belongs to the play HUD. Full-screen menus have
    // their own structured headers, so hiding DEV there prevents it from
    // covering currency, counters, and title controls.
    const hasFullScreenMenu = this.scene.manager
      .getScenes(true)
      .some((scene) => !PLAY_HUD_SCENES.has(scene.scene.key));
    this.button?.setVisible(!hasFullScreenMenu);
  }
}
