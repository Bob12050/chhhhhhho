import type Phaser from 'phaser';

const SCENE_START_EVENT = 'start';

/**
 * Draw the 360px logical game at double density. Gameplay coordinates stay
 * unchanged while the WebGL backing buffer carries four times the pixels.
 */
export const RENDER_DENSITY = 2;

function configureSceneCameras(
  scene: Phaser.Scene,
  logicalWidth: number,
  logicalHeight: number,
): void {
  const renderWidth = logicalWidth * RENDER_DENSITY;
  const renderHeight = logicalHeight * RENDER_DENSITY;

  for (const camera of scene.cameras.cameras) {
    camera.setSize(renderWidth, renderHeight);
    camera.setZoom(RENDER_DENSITY);
    camera.centerOn(logicalWidth / 2, logicalHeight / 2);
  }
}

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
    configureSceneCameras(scene, logicalWidth, logicalHeight);

    // Stopping a Phaser scene destroys its cameras. When an overlay is opened
    // again, CameraManager creates a fresh 720px camera at zoom 1, so a 360px
    // menu only fills the left half. Reapply density after every scene start.
    scene.sys.events.on(SCENE_START_EVENT, () => {
      configureSceneCameras(scene, logicalWidth, logicalHeight);
    });
  }
}

export function renderZoom(logicalZoom: number): number {
  return logicalZoom * RENDER_DENSITY;
}
