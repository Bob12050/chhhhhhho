import Phaser from 'phaser';
import { ensureGeneratedTextures } from '@/assets/gen/textures';
import { saveManager } from '@/save/save-manager';
import { gameState } from '@/player/game-state';

/**
 * Boot: generate placeholder textures (no external assets in Phase 0), load (or
 * create) save slot 0 into the game state, then hand off to the town. A title /
 * save-select flow lands in Phase 1; Phase 0 auto-uses slot 0 for device tests.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    ensureGeneratedTextures(this);
    void this.boot();
  }

  private async boot(): Promise<void> {
    const existing = await saveManager.read(0);
    if (existing) gameState.loadFrom(existing);
    else gameState.loadFrom(await saveManager.startNew(0));
    this.scene.launch('UI');
    this.scene.start('Town');
  }
}
