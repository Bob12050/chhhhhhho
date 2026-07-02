import Phaser from 'phaser';
import { TEX } from '@/assets/gen/textures';

/**
 * Central UI theme (B: 統一感). One place for the font, palette, text-style
 * presets, and the standard menu chrome so every overlay looks consistent and
 * future tweaks happen in a single file. Scenes import from here instead of
 * hardcoding `'system-ui, sans-serif'` and scattered hex values.
 */
/** Pixel UI font (self-hosted DotGothic16 subset), with graceful fallbacks. */
export const FONT = "'DotGothic16', system-ui, sans-serif";

/** Shared palette. Numbers are for Phaser fills; strings for text colors. */
export const UI = {
  // Fills (numbers)
  overlay: 0x0e0f1a, // opaque menu backdrop
  panel: 0x10121c, // framed boxes (HUD bars etc.)
  divider: 0x333a5a, // thin separators between rows
  // Text (strings)
  white: '#ffffff',
  sub: '#9aa0b5', // secondary / descriptions
  gold: '#ffd86b', // currency / confirm actions
  good: '#9fe3a0', // affordable / success
  bad: '#e58a8a', // insufficient / danger
  link: '#9fd0ff', // tappable actions
  accent: '#c8b6ff', // secondary links
  // Tab chip backgrounds (strings, used as backgroundColor)
  tabActiveBg: '#46508a',
  tabIdleBg: '#2a2d44',
} as const;

/** Common text-style presets (spread into add.text). */
export const TEXT = {
  title: { fontFamily: FONT, fontSize: '18px', color: UI.white },
  heading: { fontFamily: FONT, fontSize: '15px', color: UI.white },
  body: { fontFamily: FONT, fontSize: '13px', color: UI.white },
  small: { fontFamily: FONT, fontSize: '11px', color: UI.sub },
  button: { fontFamily: FONT, fontSize: '16px', color: UI.gold },
} satisfies Record<string, Phaser.Types.GameObjects.Text.TextStyle>;

/** Full-screen opaque backdrop (depth 0). For simple, non-scrolling menus. */
export function addBackdrop(scene: Phaser.Scene): void {
  scene.add.rectangle(0, 0, scene.scale.width, scene.scale.height, UI.overlay, 1).setOrigin(0).setDepth(0);
}

/**
 * Themed full-screen backdrop shared by front-end menus (title / save-select):
 * the grass world under a heavy navy gradient + corner vignette, so menus feel
 * like part of the game world rather than flat black panels. `dim` (0..1)
 * controls how dark the top reads (higher = more readable text over it).
 */
export function addSceneBackdrop(scene: Phaser.Scene, dim = 0.72): void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  if (scene.textures.exists(TEX.tileGrass)) {
    scene.add.tileSprite(0, 0, w, h, TEX.tileGrass).setOrigin(0).setDepth(-100);
  } else {
    scene.add.rectangle(0, 0, w, h, UI.overlay, 1).setOrigin(0).setDepth(-100);
  }
  // Vertical navy gradient (fine bands read as a smooth wash, not stripes).
  const g = scene.add.graphics().setDepth(-99);
  const bands = 48;
  for (let i = 0; i < bands; i++) {
    g.fillStyle(0x0e0f1a, dim * (1 - (i / bands) * 0.55));
    g.fillRect(0, Math.floor((i * h) / bands), w, Math.ceil(h / bands) + 1);
  }
  // Corner vignette.
  const vg = scene.add.graphics().setDepth(-98);
  for (let i = 0; i < 10; i++) {
    vg.lineStyle(3, 0x0e0f1a, 0.06 * (1 - i / 10));
    vg.strokeRect(i * 3, i * 3, w - i * 6, h - i * 6);
  }
}

/** Framed pill button (shared menu style). Returns the text object. */
export function pillButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onTap: () => void,
  opts?: { color?: string; bg?: string; size?: number },
): Phaser.GameObjects.Text {
  const t = scene.add
    .text(x, y, label, {
      fontFamily: FONT,
      fontSize: `${opts?.size ?? 14}px`,
      color: opts?.color ?? '#ffffff',
      backgroundColor: opts?.bg ?? '#2a3050',
      padding: { x: 12, y: 7 },
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  t.on('pointerup', onTap);
  return t;
}

/**
 * Standard scrolling-menu chrome: opaque backdrop (depth 0) + opaque
 * header/footer bars (depth 2). A depth-1 scrolling list is then visually
 * clipped to the [viewTop, viewBottom] band — rows never bleed over the
 * title/tabs or the close row. Header/footer text/buttons should be depth >= 3.
 * (Geometry masks proved unreliable in this Phaser build, so we cover instead.)
 */
export function addPanelChrome(scene: Phaser.Scene, viewTop: number, viewBottom: number): void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  scene.add.rectangle(0, 0, w, h, UI.overlay, 1).setOrigin(0).setDepth(0);
  scene.add.rectangle(0, 0, w, viewTop, UI.overlay, 1).setOrigin(0).setDepth(2);
  scene.add.rectangle(0, viewBottom, w, h - viewBottom, UI.overlay, 1).setOrigin(0).setDepth(2);
  // Gold rules along the header/footer edges: carries the title screen's
  // visual language (navy + gold) through every menu.
  scene.add.rectangle(0, viewTop - 1, w, 1, 0xf5c542, 0.55).setOrigin(0).setDepth(3);
  scene.add.rectangle(0, viewBottom, w, 1, 0xf5c542, 0.35).setOrigin(0).setDepth(3);
}

/**
 * Subtle row band behind a list entry (alternating tint keeps long lists
 * scannable without icons). Returns the rect so callers can add it to a
 * scrolling container.
 */
export function rowBand(
  scene: Phaser.Scene,
  y: number,
  height: number,
  index: number,
): Phaser.GameObjects.Rectangle {
  return scene.add
    .rectangle(8, y - 4, scene.scale.width - 16, height, index % 2 ? 0x191c2c : 0x14172a, 0.9)
    .setOrigin(0, 0);
}
