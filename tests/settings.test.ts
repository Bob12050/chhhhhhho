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

describe('persisted settings', () => {
  it('enables the aligned equipment appearance by default', () => {
    installStorage();
    expect(loadSettings()).toMatchObject({
      paperDollPilot: true,
      controlScale: 1,
      controlOpacity: 0.82,
      leftHanded: false,
    });
  });

  it('re-enables appearance when migrating an older renderer', () => {
    installStorage(JSON.stringify({
      bgmVol: 1,
      sfxVol: 1,
      paperDollPilot: false,
      paperDollPilotRevision: 2,
    }));
    expect(loadSettings().paperDollPilot).toBe(true);
  });

  it('allows the aligned appearance to be disabled manually', () => {
    installStorage();
    saveSettings({
      bgmVol: 0.5,
      sfxVol: 0.75,
      paperDollPilot: false,
      controlScale: 1.12,
      controlOpacity: 0.6,
      leftHanded: true,
    });
    expect(loadSettings()).toEqual({
      bgmVol: 0.5,
      sfxVol: 0.75,
      paperDollPilot: false,
      controlScale: 1.12,
      controlOpacity: 0.6,
      leftHanded: true,
    });
  });

  it('sanitizes invalid mobile control values from storage', () => {
    installStorage(JSON.stringify({
      controlScale: 9,
      controlOpacity: -1,
      leftHanded: 'yes',
    }));
    expect(loadSettings()).toMatchObject({
      controlScale: 1.2,
      controlOpacity: 0.5,
      leftHanded: false,
    });
  });
});
