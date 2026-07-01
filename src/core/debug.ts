/**
 * Debug-tools gating. Enabled in dev builds always. In the published build the
 * debug menu is opt-in: visiting once with `?debug=1` turns it on and persists
 * (localStorage), `?debug=0` turns it back off. This keeps the DBG button and
 * warp menu hidden from normal players while staying reachable on device.
 */
const DEBUG_KEY = 'pixelrpg.debug';

export function isDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    const q = new URLSearchParams(window.location.search).get('debug');
    if (q === '1') localStorage.setItem(DEBUG_KEY, '1');
    else if (q === '0') localStorage.removeItem(DEBUG_KEY);
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}
