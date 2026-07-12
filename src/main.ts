import Phaser from 'phaser';
import {
  LOGICAL_WIDTH,
  computeLogicalHeight,
} from '@/config/resolution';
import { BootScene } from '@/scenes/boot-scene';
import { NoticeScene } from '@/scenes/notice-scene';
import { TitleScene } from '@/scenes/title-scene';
import { SaveSelectScene } from '@/scenes/save-select-scene';
import { WorldScene } from '@/scenes/world-scene';
import { UIScene } from '@/scenes/ui-scene';
import { InventoryScene } from '@/scenes/inventory-scene';
import { CraftingScene } from '@/scenes/crafting-scene';
import { JobChangeScene } from '@/scenes/job-change-scene';
import { JobTreeScene } from '@/scenes/job-tree-scene';
import { QuestBoardScene } from '@/scenes/quest-board-scene';
import { DialogueScene } from '@/scenes/dialogue-scene';
import { ShopScene } from '@/scenes/shop-scene';
import { OptionsScene } from '@/scenes/options-scene';
import { loadSettings } from '@/core/settings';
import { bgm } from '@/audio/bgm-engine';
import { DebugScene } from '@/scenes/debug-scene';
import { DebugOverlayScene } from '@/scenes/debug-overlay-scene';
import { ChecklistScene } from '@/scenes/checklist-scene';
import { MapSelectScene } from '@/scenes/map-select-scene';
import { BestiaryScene } from '@/scenes/bestiary-scene';
import { PetScene } from '@/scenes/pet-scene';
import { QuestResultScene } from '@/scenes/quest-result-scene';
import { EndingScene } from '@/scenes/ending-scene';
import { installOrientationGuard } from '@/scenes/orientation-guard';
import { installLifecycle } from '@/core/lifecycle';
import { registerServiceWorker } from '@/core/pwa';
import { soundEngine } from '@/audio/sound-engine';
import { installTestHooks } from '@/core/test-hooks';

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
  scene: [
    BootScene,
    NoticeScene,
    TitleScene,
    SaveSelectScene,
    WorldScene,
    UIScene,
    InventoryScene,
    CraftingScene,
    JobChangeScene,
    JobTreeScene,
    QuestBoardScene,
    DialogueScene,
    ShopScene,
    OptionsScene,
    DebugScene,
    DebugOverlayScene,
    ChecklistScene,
    MapSelectScene,
    BestiaryScene,
    PetScene,
    QuestResultScene,
    EndingScene,
  ],
};

function startGame(): void {
  const game = new Phaser.Game(config);
  soundEngine.install();
  // Apply persisted user volumes before anything plays.
  const settings = loadSettings();
  soundEngine.setVolume(settings.sfxVol);
  bgm.setVolume(settings.bgmVol);
  installOrientationGuard(game);
  installLifecycle(game);
  installTestHooks(game); // no-op unless the debug flag is on
  void registerServiceWorker();
}

// Load the pixel UI font (DotGothic16, self-hosted subset) BEFORE the game
// starts: Phaser bakes text to canvas and won't reflow once the font arrives,
// so scenes must be created with it already available. Base-prefixed so it
// resolves under the GitHub Pages sub-path. Falls back after a short timeout.
const fontUrl = import.meta.env.BASE_URL + 'assets/fonts/dotgothic16-subset.woff2';
const fontStyle = document.createElement('style');
fontStyle.textContent = `@font-face{font-family:'DotGothic16';font-style:normal;font-weight:400;font-display:swap;src:url('${fontUrl}') format('woff2');}`;
document.head.appendChild(fontStyle);
const fontReady = (document.fonts?.load('16px "DotGothic16"') ?? Promise.resolve()).catch(() => {});
Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).finally(startGame);
