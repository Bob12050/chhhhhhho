import Phaser from 'phaser';
import {
  LOGICAL_WIDTH,
  computeLogicalHeight,
} from '@/config/resolution';
import { BootScene } from '@/scenes/boot-scene';
import { TownScene } from '@/scenes/town-scene';
import { UIScene } from '@/scenes/ui-scene';
import { EquipmentScene } from '@/scenes/equipment-scene';
import { installOrientationGuard } from '@/scenes/orientation-guard';
import { installLifecycle } from '@/core/lifecycle';
import { registerServiceWorker } from '@/core/pwa';

// Logical size: width is fixed at 360; height follows the device aspect ratio
// clamped to [640, 800]. Integer zoom + letterbox is handled by Phaser FIT
// with pixelArt + roundPixels so dots stay crisp.
const logicalHeight = computeLogicalHeight(window.innerWidth, window.innerHeight);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: '#0e0f1a',
  width: LOGICAL_WIDTH,
  height: logicalHeight,
  pixelArt: true, // Nearest filtering, no antialias
  roundPixels: true, // integer render positions
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Mobile twin-control scheme needs several simultaneous touches: the stick
  // (1 finger) plus attack/skill/interact buttons. Phaser tracks only 1 touch
  // pointer by default, so buttons silently ignored presses made while the
  // stick finger was down. Track enough pointers for stick + two buttons.
  input: {
    activePointers: 4,
  },
  // Top-down game: Arcade physics with no gravity. Required for `scene.physics`
  // to exist; without it Town/Player/Enemy physics calls throw at runtime.
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  scene: [BootScene, TownScene, UIScene, EquipmentScene],
};

const game = new Phaser.Game(config);

installOrientationGuard(game);
installLifecycle(game);
void registerServiceWorker();
