import Phaser from 'phaser';
import { ensureGeneratedTextures } from '@/assets/gen/textures';
import { ASSET_MANIFEST } from '@/assets/manifest';

/**
 * Boot: preload any real-art PNGs that exist (manifest), then generate
 * procedural placeholders for whatever is still missing, and hand off to the
 * title. Drop files into public/assets to replace placeholders with no code
 * change (see assets/manifest.ts).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Optional assets: a missing file just falls back to the placeholder.
    this.load.on('loaderror', () => {});
    const base = import.meta.env.BASE_URL;
    for (const a of ASSET_MANIFEST) {
      const url = base + a.src;
      if (a.type === 'spritesheet') {
        this.load.spritesheet(a.key, url, {
          frameWidth: a.frameWidth ?? 64,
          frameHeight: a.frameHeight ?? 96,
        });
      } else {
        this.load.image(a.key, url);
      }
    }
  }

  create(): void {
    ensureGeneratedTextures(this); // fills only the keys no real asset provided
    this.scene.start('Notice');
  }
}
