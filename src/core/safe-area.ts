/**
 * Reads the CSS safe-area insets (notch / home indicator) into logical-pixel
 * space so on-screen controls avoid them. Falls back to 0 when unsupported.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLDivElement | null = null;

function ensureProbe(): HTMLDivElement {
  if (probe) return probe;
  probe = document.createElement('div');
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top)',
    'padding-right:env(safe-area-inset-right)',
    'padding-bottom:env(safe-area-inset-bottom)',
    'padding-left:env(safe-area-inset-left)',
  ].join(';');
  document.body.appendChild(probe);
  return probe;
}

/**
 * Returns insets scaled from device px into the game's logical px.
 * `logicalToDevice` is the current render scale (device px per logical px).
 */
export function readInsets(logicalToDevice: number): Insets {
  const el = ensureProbe();
  const cs = getComputedStyle(el);
  const scale = logicalToDevice > 0 ? logicalToDevice : 1;
  const px = (v: string): number => Math.ceil((parseFloat(v) || 0) / scale);
  return {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
}
