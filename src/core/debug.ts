/**
 * Debug-tools gating. Enabled in dev, or in any build when the URL carries
 * `?debug=1` (so the deployed Pages build can be tested on device) — but kept
 * off for normal players, satisfying "disabled in release".
 */
export function isDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('debug');
  } catch {
    return false;
  }
}
