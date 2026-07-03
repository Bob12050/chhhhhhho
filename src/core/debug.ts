/**
 * Debug-tools gating. `debug` is true when ANY of:
 *   - URL `?debug=1`
 *   - `localStorage.debug === "1"`
 *   - `import.meta.env.DEV` (dev server)
 * ...UNLESS `?debug=0` is present, which forces it OFF even on the dev server —
 * this is the clean "screenshot / art-review" mode. `?debug=1` / `?debug=0` also
 * persist to `localStorage.debug`. A normal published URL resolves to false, so
 * players never see the DEV button, warp menu, or any debug overlay.
 *
 * Computed once at load (the URL/flag can't change without a reload).
 */

/** Dev-overlay render depth: above ALL game UI (HUD_DEPTH = 100000). */
export const DEBUG_DEPTH = 999999;

function compute(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('debug');
    if (q === '0') {
      localStorage.removeItem('debug');
      return false; // explicit off wins over DEV (clean screenshots)
    }
    if (q === '1') {
      localStorage.setItem('debug', '1');
      return true;
    }
    if (localStorage.getItem('debug') === '1') return true;
  } catch {
    /* no window (SSR / tests) */
  }
  return !!import.meta.env.DEV;
}

const DEBUG = compute();

export function isDebugEnabled(): boolean {
  return DEBUG;
}
