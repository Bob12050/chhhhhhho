/** User settings persisted to localStorage. */
export const SETTINGS_STORAGE_KEY = 'pixelrpg.settings.v1';
const PAPER_DOLL_PILOT_REVISION = 1;

export interface Settings {
  bgmVol: number; // 0..1
  sfxVol: number; // 0..1
  /** Fighter-only equipment-layer pilot. False restores the original job art. */
  paperDollPilot: boolean;
}

const DEFAULTS: Settings = { bgmVol: 1, sfxVol: 1, paperDollPilot: false };

type StoredSettings = Partial<Settings> & {
  paperDollPilotRevision?: number;
};

function clamp01(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
  return Math.max(0, Math.min(1, n));
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as StoredSettings;
    return {
      bgmVol: clamp01(p.bgmVol),
      sfxVol: clamp01(p.sfxVol),
      // The first public pilot had mismatched anchors. Require a value saved by
      // the revised settings screen so that every existing player rolls back.
      paperDollPilot:
        p.paperDollPilot === true
        && p.paperDollPilotRevision === PAPER_DOLL_PILOT_REVISION,
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
