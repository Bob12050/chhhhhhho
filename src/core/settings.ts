/** User settings persisted to localStorage. */
export const SETTINGS_STORAGE_KEY = 'pixelrpg.settings.v1';
const PAPER_DOLL_PILOT_REVISION = 3;

export interface Settings {
  bgmVol: number; // 0..1
  sfxVol: number; // 0..1
  /** Show supported equipment layers. False always restores the fixed job art. */
  paperDollPilot: boolean;
  /** On-screen movement/combat control scale. */
  controlScale: number;
  /** Idle opacity multiplier for on-screen controls. */
  controlOpacity: number;
  /** Swap the movement stick and combat cluster for left-handed play. */
  leftHanded: boolean;
}

const DEFAULTS: Settings = {
  bgmVol: 1,
  sfxVol: 1,
  paperDollPilot: true,
  controlScale: 1,
  controlOpacity: 0.82,
  leftHanded: false,
};

type StoredSettings = Partial<Settings> & {
  paperDollPilotRevision?: number;
};

function clamp01(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.max(0, Math.min(1, n));
}

function clamp(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(min, Math.min(max, n));
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as StoredSettings;
    return {
      bgmVol: clamp01(p.bgmVol),
      sfxVol: clamp01(p.sfxVol),
      // Each substantially revised renderer gets a fresh default so existing
      // saves actually exercise the newly approved implementation.
      paperDollPilot:
        p.paperDollPilotRevision === PAPER_DOLL_PILOT_REVISION
        && typeof p.paperDollPilot === 'boolean'
          ? p.paperDollPilot
          : DEFAULTS.paperDollPilot,
      controlScale: clamp(p.controlScale, DEFAULTS.controlScale, 0.85, 1.2),
      controlOpacity: clamp(p.controlOpacity, DEFAULTS.controlOpacity, 0.5, 1),
      leftHanded: typeof p.leftHanded === 'boolean' ? p.leftHanded : DEFAULTS.leftHanded,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...s, paperDollPilotRevision: PAPER_DOLL_PILOT_REVISION }),
    );
  } catch {
    /* private mode etc. — settings just won't persist */
  }
}
