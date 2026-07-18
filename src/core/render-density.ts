import Phaser from 'phaser';

/**
 * Draw the 360px logical game at double density. Gameplay coordinates stay
 * unchanged while the WebGL backing buffer carries four times the pixels.
 */
export const RENDER_DENSITY = 2;

export function installRenderDensity(
  game: Phaser.Game,
  logicalWidth: number,
  logicalHeight: number,
): void {
  const scale = game.scale;
  const renderWidth = logicalWidth * RENDER_DENSITY;
  const renderHeight = logicalHeight * RENDER_DENSITY;

  scale.baseSize.setSize(renderWidth, renderHeight);
  scale.canvas.width = renderWidth;
  scale.canvas.height = renderHeight;
  scale.refresh();

  for (const scene of game.scene.getScenes(false)) {
    for (const camera of scene.cameras.cameras) {
      camera.setSize(renderWidth, renderHeight);
      camera.setZoom(RENDER_DENSITY);
      camera.centerOn(logicalWidth / 2, logicalHeight / 2);
    }
  }
}

export function renderZoom(logicalZoom: number): number {
  return logicalZoom * RENDER_DENSITY;
}
