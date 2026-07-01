import { describe, it, expect } from 'vitest';
import { SFX, SFX_IDS, type Waveform } from '@/audio/sfx-defs';

/**
 * The SFX data is pure (no Web Audio), so we can validate every patch is
 * well-formed here — catching typos (negative times, zero-frequency tones,
 * out-of-range gains) before they reach a device where they'd click or drop.
 */
const WAVEFORMS: Waveform[] = ['sine', 'square', 'sawtooth', 'triangle'];

describe('sfx definitions', () => {
  it('exposes every id with a non-empty patch', () => {
    expect(SFX_IDS.length).toBeGreaterThanOrEqual(10);
    for (const id of SFX_IDS) {
      const def = SFX[id];
      expect(def, id).toBeDefined();
      expect(def.steps.length, `${id} steps`).toBeGreaterThan(0);
    }
  });

  it('has sane gains and rate limits', () => {
    for (const id of SFX_IDS) {
      const def = SFX[id];
      expect(def.gain, `${id} gain`).toBeGreaterThan(0);
      expect(def.gain, `${id} gain`).toBeLessThanOrEqual(1);
      expect(def.minGapMs, `${id} minGap`).toBeGreaterThanOrEqual(0);
    }
  });

  it('every step has non-negative timing and valid tone/noise config', () => {
    for (const id of SFX_IDS) {
      for (const [i, s] of SFX[id].steps.entries()) {
        const at = `${id}[${i}]`;
        expect(s.delay, `${at} delay`).toBeGreaterThanOrEqual(0);
        expect(s.attack, `${at} attack`).toBeGreaterThanOrEqual(0);
        expect(s.decay, `${at} decay`).toBeGreaterThan(0);
        if (s.gain !== undefined) {
          expect(s.gain, `${at} gain`).toBeGreaterThan(0);
          expect(s.gain, `${at} gain`).toBeLessThanOrEqual(1);
        }
        if (s.noise) {
          // Noise bursts ignore frequency/waveform.
          continue;
        }
        expect(s.freq, `${at} freq`).toBeGreaterThan(0);
        if (s.freqEnd !== undefined) expect(s.freqEnd, `${at} freqEnd`).toBeGreaterThan(0);
        if (s.type !== undefined) expect(WAVEFORMS, `${at} type`).toContain(s.type);
      }
    }
  });
});
