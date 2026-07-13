/**
 * Debug-tools gating. The persisted flag is controlled from the options screen;
 * `?debug=1` and `?debug=0` remain as convenient startup overrides for device
 * testing and automated checks. Debug mode is off by default.
 */

/** Dev-overlay render depth: above ALL game UI (HUD_DEPTH = 100000). */
export const DEBUG_DEPTH = 999999;
export const DEBUG_STORAGE_KEY = 'debug';

type WritableDebugStorage = Pick<Storage, 'setItem' | 'removeItem'>;

function compute(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('debug');
    if (q === '0') {
      window.localStorage.removeItem(DEBUG_STORAGE_KEY);
      return false; // explicit off wins over DEV (clean screenshots)
    }
    if (q === '1') {
      window.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
      return true;
    }
    if (window.localStorage.getItem(DEBUG_STORAGE_KEY) === '1') return true;
  } catch {
    /* no window (SSR / tests) */
  }
  return false;
}

let debugEnabled = compute();

export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/** Apply the setting immediately and remember it for the next launch. */
export function setDebugEnabled(enabled: boolean, storage?: WritableDebugStorage): void {
  debugEnabled = enabled;

  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (enabled) target?.setItem(DEBUG_STORAGE_KEY, '1');
    else target?.removeItem(DEBUG_STORAGE_KEY);
  } catch {
    /* private mode etc. - the live setting still applies */
  }

  // Once the player uses the in-game setting, it becomes authoritative. Strip
  // a startup override so their choice also survives a refresh of that URL.
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('debug')) return;
    url.searchParams.delete('debug');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    /* URL replacement is optional; persistence above is the important part */
  }
}
