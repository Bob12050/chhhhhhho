import Phaser from 'phaser';
import { ensureGeneratedTextures } from '@/assets/gen/textures';

/**
 * Boot: generate placeholder textures (no external assets yet), then hand off
 * to the title screen. Save loading happens from the title / save-select flow
 * (see `core/game-flow.ts`).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    ensureGeneratedTextures(this);
    this.scene.start('Title');
  }
}
