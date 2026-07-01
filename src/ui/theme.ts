import Phaser from 'phaser';

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
}
