import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
} from '@/core/settings';

function installStorage(initial?: string): Map<string, string> {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(SETTINGS_STORAGE_KEY, initial);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe('appearance settings', () => {
  it('enables the aligned equipment appearance by default', () => {
    installStorage();
    expect(loadSettings().paperDollPilot).toBe(true);
  });

  it('re-enables appearance when migrating the rejected first pilot', () => {
    installStorage(JSON.stringify({
      bgmVol: 1,
      sfxVol: 1,
      paperDollPilot: false,
      paperDollPilotRevision: 1,
    }));
    expect(loadSettings().paperDollPilot).toBe(true);
  });

  it('allows the aligned appearance to be disabled manually', () => {
    installStorage();
    saveSettings({ bgmVol: 0.5, sfxVol: 0.75, paperDollPilot: false });
    expect(loadSettings()).toEqual({
      bgmVol: 0.5,
      sfxVol: 0.75,
      paperDollPilot: false,
    });
  });
});
