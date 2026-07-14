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
  private button?: Phaser.GameObjects.Text;

  constructor() {
    super('DebugOverlay');
  }

  create(): void {
    this.scene.bringToTop();
    const w = this.scale.width;
    const cssPerLogical = this.scale.displaySize.width / this.scale.gameSize.width;
    const insets = readInsets(cssPerLogical || 1);

    // Top-right, but LEFT of the game's bag/map buttons so dev tools never sit on
    // top of gameplay UI.
    const btn = this.add
      .text(w - insets.right - 54, insets.top + 8, 'DEV', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#ffb4b4',
        backgroundColor: '#3a1a1a',
        padding: { x: 7, y: 4 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEBUG_DEPTH)
      .setInteractive({ useHandCursor: true });
    this.button = btn;
    btn.on('pointerup', () => bus.emit('ui:open-debug', {}));
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
