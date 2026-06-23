import Phaser from 'phaser';
import { saveManager } from '@/save/save-manager';
import { gameState } from '@/player/game-state';
import { bus } from '@/core/event-bus';

/**
 * Entry transition from the menu scenes into gameplay. Loads (or creates) the
 * slot into the global game state, then launches the persistent UI overlay and
 * starts the world. Kept here (not in a scene) so Title and SaveSelect share
 * exactly one path into the game.
 */
export async function beginGame(
  scene: Phaser.Scene,
  slot: number,
  mode: 'new' | 'load',
): Promise<void> {
  const data =
    mode === 'load' ? ((await saveManager.read(slot)) ?? (await saveManager.startNew(slot))) : await saveManager.startNew(slot);
  gameState.loadFrom(data);
  bus.emit(mode === 'new' ? 'game:new' : 'game:load', { slot });
  scene.scene.launch('UI');
  scene.scene.start('World');
}

/** Return from gameplay to the title screen, tearing down world + overlays. */
export function returnToTitle(scene: Phaser.Scene): void {
  scene.scene.stop('Inventory');
  scene.scene.stop('Crafting');
  scene.scene.stop('JobChange');
  scene.scene.stop('Dialogue');
  scene.scene.stop('UI');
  scene.scene.stop('World');
  bus.emit('game:return-to-title', {});
  scene.scene.start('Title');
}
