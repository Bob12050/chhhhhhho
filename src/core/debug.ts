/**
 * Debug-tools gating. Enabled in dev, or in any build when the URL carries
 * `?debug=1` (so the deployed Pages build can be tested on device).
 *
 * NOTE: `FORCE_DEBUG` is temporarily true so the debug menu is always on in the
 * published build too (開発中の常駐指定). Set back to false before release.
 */
const FORCE_DEBUG = true;

export function isDebugEnabled(): boolean {
  if (FORCE_DEBUG) return true;
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}
