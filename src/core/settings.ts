/**
 * User settings (audio volumes), persisted to localStorage. Values are 0..1
 * multipliers applied on top of each engine's internal master gain, in 25%
 * steps from the options screen. Loaded once at startup; setters persist and
 * notify the audio engines live (wired in main.ts / options-scene).
 */
const KEY = 'pixelrpg.settings.v1';

export interface Settings {
  bgmVol: number; // 0..1
  sfxVol: number; // 0..1
}

const DEFAULTS: Settings = { bgmVol: 1, sfxVol: 1 };

function clamp01(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.max(0, Math.min(1, n));
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return { bgmVol: clamp01(p.bgmVol), sfxVol: clamp01(p.sfxVol) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. — settings just won't persist */
  }
}
