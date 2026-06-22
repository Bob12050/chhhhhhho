import Phaser from 'phaser';
import { bus } from './event-bus';

/**
 * Pause the game when the tab/PWA is backgrounded and emit a hidden event so
 * systems can auto-save. Resume on return. Keeps the device cool and avoids
 * losing progress when the user switches apps.
 */
export function installLifecycle(game: Phaser.Game): void {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      bus.emit('app:visibility-hidden', {});
      game.loop.sleep();
    } else {
      game.loop.wake();
    }
  });

  // Best-effort save on pagehide (iOS may not fire visibilitychange reliably).
  window.addEventListener('pagehide', () => {
    bus.emit('app:visibility-hidden', {});
  });
}
