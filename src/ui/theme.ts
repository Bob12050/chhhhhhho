import Phaser from 'phaser';
import { TEX, UI_FRAME_SLICE } from '@/assets/gen/textures';

/**
 * Central UI theme (B: 統一感). One place for the font, palette, text-style
 * presets, and the standard menu chrome so every overlay looks consistent and
 * future tweaks happen in a single file. Scenes import from here instead of
 * hardcoding `'system-ui, sans-serif'` and scattered hex values.
 */
/**
 * UI body font. A clean device-native gothic (Hiragino on iOS, Noto/Yu on
 * Android/desktop) — this is what pulls the menus out of the "retro doujin"
 * look while the pixel-art world stays crisp. No web-font download (CDN禁止);
 * we ride the OS font, which on the target devices is a polished rounded gothic.
 */
export const FONT =
  "'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', 'YuGothic', system-ui, sans-serif";

/** Pixel display font (self-hosted DotGothic16 subset) — title/logo only. */
export const FONT_PIXEL = "'DotGothic16', system-ui, sans-serif";

/**
 * HUD render depth floor. World objects Y-sort at `round(y)` (at most a few
 * thousand), so pinning every HUD element at/above this guarantees the overlay
 * never interleaves with the world. Use `HUD_DEPTH + n` for small in-HUD layers.
 */
export const HUD_DEPTH = 100000;

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

/**
 * 9-slice framed panel (centre-anchored, like a Rectangle). Draws from the
 * `TEX.uiFrame` texture so a single `assets/ui/frame.png` restyles every menu
 * panel at once. The corners stay fixed while the edges/centre stretch, so one
 * small frame fits any card size. Falls back to a rectangle+stroke (the prior
 * look) only if the frame texture is somehow absent.
 *
 * `active` picks the accent: `true` keeps the frame's gold tone, `false`
 * desaturates it (empty/disabled cards). Returns the game object so callers can
 * set depth / add it to a container.
 */
export function ninePanel(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  width: number,
  height: number,
  opts?: { active?: boolean; alpha?: number; tint?: number },
): Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth {
  if (scene.textures.exists(TEX.uiFrame)) {
    // Soft drop shadow behind the panel (same frame, dark + offset) for depth.
    const shadow = scene.add.nineslice(
      cx,
      cy + 4,
      TEX.uiFrame,
      undefined,
      width,
      height,
      UI_FRAME_SLICE,
      UI_FRAME_SLICE,
      UI_FRAME_SLICE,
      UI_FRAME_SLICE,
    );
    shadow.setTint(0x000000).setAlpha(0.28 * (opts?.alpha ?? 1));
    const n = scene.add.nineslice(
      cx,
      cy,
      TEX.uiFrame,
      undefined,
      width,
      height,
      UI_FRAME_SLICE,
      UI_FRAME_SLICE,
      UI_FRAME_SLICE,
      UI_FRAME_SLICE,
    );
    const tint = opts?.tint ?? (opts?.active === false ? 0x8890a8 : undefined);
    if (tint !== undefined) n.setTint(tint);
    if (opts?.alpha !== undefined) n.setAlpha(opts.alpha);
    // Keep the shadow pinned just under the panel (depth set by the caller).
    n.on('destroy', () => shadow.destroy());
    return n;
  }
  // Fallback: the original flat card so menus still render without a frame tex.
  const r = scene.add
    .rectangle(cx, cy, width, height, 0x141726, opts?.alpha ?? 0.94)
    .setStrokeStyle(2, opts?.active === false ? 0x333a5a : 0x46508a, 0.9);
  return r;
}

/** Parse a #rrggbb string to a Phaser fill number. */
function hexNum(s: string): number {
  return parseInt(s.replace('#', ''), 16);
}

/** A rounded tab chip with a toggleable active state. */
export interface TabHandle {
  root: Phaser.GameObjects.Container;
  setActive(active: boolean): void;
}

/**
 * Rounded, modern tab chip (replaces the flat text-background tabs). Active =
 * lighter fill + a gold underline accent + white label; idle = dark + muted.
 * `width` is the chip's box width (callers usually pass an equal-share width).
 */
export function tabChip(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  width: number,
  label: string,
  onTap: () => void,
  opts?: { icon?: string },
): TabHandle {
  const h = 34; // finger-sized (30 was too easy to miss on device)
  const bw = width - 4;
  const txt = scene.add
    .text(opts?.icon ? 8 : 0, 0, label, { fontFamily: FONT, fontSize: '13px', color: '#fff' })
    .setOrigin(0.5);
  const g = scene.add.graphics();
  const icon = opts?.icon && scene.textures.exists(opts.icon)
    ? scene.add.image(-14, 0, opts.icon).setDisplaySize(14, 14)
    : null;
  const root = scene.add.container(cx, cy, icon ? [g, icon, txt] : [g, txt]);
  // Argless setInteractive derives the hit rect from setSize — correct for
  // Phaser 4 containers, whose displayOrigin is size/2 and gets ADDED to the
  // hit-test point. A manual centred Rectangle(-bw/2, -h/2, …) here shifted
  // the tappable area up-left by half a chip (only the top-left quadrant
  // responded), which made every tab/chip feel broken on device.
  root.setSize(bw, h).setInteractive();
  root.on('pointerup', onTap);
  const draw = (active: boolean): void => {
    g.clear();
    const r = 9;
    g.fillStyle(active ? 0x37406a : 0x191d30, active ? 1 : 0.8);
    g.fillRoundedRect(-bw / 2, -h / 2, bw, h, { tl: r, tr: r, bl: 4, br: 4 });
    if (active) {
      g.fillStyle(0xf5c542, 0.95);
      g.fillRoundedRect(-bw / 2 + 7, h / 2 - 5, bw - 14, 3, 2);
    }
    g.lineStyle(1, 0xffffff, active ? 0.18 : 0.06);
    g.strokeRoundedRect(-bw / 2, -h / 2, bw, h, { tl: r, tr: r, bl: 4, br: 4 });
    txt.setColor(active ? '#ffffff' : '#a7adc2');
    icon?.setTint(active ? 0xffd86b : 0x8992ad);
  };
  draw(false);
  return { root, setActive: draw };
}

/**
 * Rounded, soft menu button. Draws a rounded-rect backing (fill + top sheen +
 * subtle border + a 1px drop line) with the label centred on top, wrapped in a
 * Container so callers can `.setDepth()` it. Replaces the old flat text-bg pill,
 * which was the boxy, dated look. `bg` is the fill colour; `color` the text.
 */
export function pillButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onTap: () => void,
  opts?: { color?: string; bg?: string; size?: number },
): Phaser.GameObjects.Container {
  const size = opts?.size ?? 14;
  const bg = hexNum(opts?.bg ?? '#2a3050');
  const txt = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: `${size}px`, color: opts?.color ?? '#ffffff' })
    .setOrigin(0.5);
  const padX = 14;
  const padY = 9;
  const w = Math.ceil(txt.width) + padX * 2;
  const h = Math.ceil(txt.height) + padY * 2;
  const r = Math.min(h / 2, 12);
  const g = scene.add.graphics();
  // Drop line under the button for a little lift.
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(-w / 2, -h / 2 + 2, w, h, r);
  // Body.
  g.fillStyle(bg, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  // Top sheen.
  g.fillStyle(0xffffff, 0.1);
  g.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h / 2 - 2, { tl: r, tr: r, bl: 0, br: 0 });
  // Border.
  g.lineStyle(1.5, 0xffffff, 0.16);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  const c = scene.add.container(x, y, [g, txt]);
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerup', onTap);
  // Press feedback.
  c.on('pointerdown', () => c.setScale(0.96));
  c.on('pointerup', () => c.setScale(1));
  c.on('pointerout', () => c.setScale(1));
  return c;
}

/**
 * Standard scrolling-menu chrome: opaque backdrop (depth 0) + opaque
 * header/footer bars (depth 2). A depth-1 scrolling list is then visually
 * clipped to the [viewTop, viewBottom] band — rows never bleed over the
 * title/tabs or the close row. Header/footer text/buttons should be depth >= 3.
 * (Geometry masks proved unreliable in this Phaser build, so we cover instead.)
 */
export function addPanelChrome(
  scene: Phaser.Scene,
  viewTop: number,
  viewBottom: number,
  opts?: { backdropAlpha?: number; chromeColor?: number; chromeAlpha?: number },
): void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const chromeColor = opts?.chromeColor ?? UI.overlay;
  const chromeAlpha = opts?.chromeAlpha ?? 1;
  scene.add.rectangle(0, 0, w, h, UI.overlay, opts?.backdropAlpha ?? 1).setOrigin(0).setDepth(0);
  scene.add.rectangle(0, 0, w, viewTop, chromeColor, chromeAlpha).setOrigin(0).setDepth(2);
  scene.add.rectangle(0, viewBottom, w, h - viewBottom, chromeColor, chromeAlpha).setOrigin(0).setDepth(2);
  // Soft light dividers along the header/footer edges (subtle, not a hard gold
  // hairline — that read as dated).
  scene.add.rectangle(0, viewTop - 1, w, 1, 0xffffff, 0.1).setOrigin(0).setDepth(3);
  scene.add.rectangle(0, viewBottom, w, 1, 0xffffff, 0.08).setOrigin(0).setDepth(3);
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
): Phaser.GameObjects.Graphics {
  const w = scene.scale.width - 16;
  const g = scene.add.graphics();
  // Soft rounded card per row (alternating tint) — reads far less "spreadsheet"
  // than hard full-width bands.
  g.fillStyle(index % 2 ? 0x222741 : 0x1a1e33, 0.92);
  g.fillRoundedRect(8, y - 4, w, height, 8);
  g.lineStyle(1, 0xffffff, 0.05);
  g.strokeRoundedRect(8, y - 4, w, height, 8);
  return g;
}
