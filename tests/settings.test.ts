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
  it('keeps the layered pilot off by default', () => {
    installStorage();
    expect(loadSettings().paperDollPilot).toBe(false);
  });

  it('rolls back the first public pilot setting', () => {
    installStorage(JSON.stringify({ bgmVol: 1, sfxVol: 1, paperDollPilot: true }));
    expect(loadSettings().paperDollPilot).toBe(false);
  });

  it('allows the revised trial to be enabled manually', () => {
    installStorage();
    saveSettings({ bgmVol: 0.5, sfxVol: 0.75, paperDollPilot: true });
    expect(loadSettings()).toEqual({
      bgmVol: 0.5,
      sfxVol: 0.75,
      paperDollPilot: true,
    });
  });
});
