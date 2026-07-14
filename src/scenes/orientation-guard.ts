import Phaser from 'phaser';
import { bus } from '@/core/event-bus';

/**
 * Landscape guard for touch-first devices. Desktop browsers keep running in a
 * centred portrait frame even when the monitor is landscape; phones/tablets
 * still pause and ask the player to rotate the device.
 */
export function installOrientationGuard(game: Phaser.Game): void {
  const overlay = document.createElement('div');
  overlay.id = 'orientation-guard';
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:none',
    'align-items:center',
    'justify-content:center',
    'text-align:center',
    'background:#0e0f1a',
    'color:#e8e8f0',
    'font-family:system-ui,sans-serif',
    'font-size:18px',
    'line-height:1.6',
    'z-index:9999',
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
  ].join(';');
  overlay.innerHTML = '<div>📱↻<br>端末を縦向きにしてください</div>';
  document.body.appendChild(overlay);

  const evaluate = (): void => {
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? navigator.maxTouchPoints > 0;
    const blocked = coarsePointer && window.innerWidth > window.innerHeight;
    overlay.style.display = blocked ? 'flex' : 'none';
    bus.emit('app:orientation-blocked', { blocked });
    if (blocked) {
      game.loop.sleep();
    } else {
      game.loop.wake();
    }
  };

  window.addEventListener('resize', evaluate);
  window.addEventListener('orientationchange', evaluate);
  evaluate();
}
