import { describe, it, expect } from 'vitest';
import { BGM, BGM_IDS, channelSteps, midiToFreq } from '@/audio/bgm-defs';

/**
 * BGM scores are pure data; validate them headlessly so a typo (odd bar
 * length, out-of-range note) can't ship as a mistimed or shrieking loop.
 */
describe('bgm scores', () => {
  it('ships the three area tracks', () => {
    expect(BGM_IDS.sort()).toEqual(['boss', 'field', 'town']);
  });

  it('every track has sane tempo and at least melody + bass', () => {
    for (const id of BGM_IDS) {
      const t = BGM[id];
      expect(t.bpm, id).toBeGreaterThanOrEqual(60);
      expect(t.bpm, id).toBeLessThanOrEqual(200);
      expect(t.stepsPerBeat, id).toBeGreaterThanOrEqual(1);
      expect(t.channels.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('all channels of a track loop at the same length (phase lock)', () => {
    for (const id of BGM_IDS) {
      const lens = BGM[id].channels.map(channelSteps);
      for (const l of lens) expect(l, `${id} channel length`).toBe(lens[0]);
      expect(lens[0], id).toBeGreaterThan(0);
    }
  });

  it('notes are inside a sensible midi range with positive lengths', () => {
    for (const id of BGM_IDS) {
      for (const ch of BGM[id].channels) {
        expect(ch.gain).toBeGreaterThan(0);
        expect(ch.gain).toBeLessThanOrEqual(1);
        for (const [midi, len] of ch.notes) {
          expect(len, `${id} note len`).toBeGreaterThan(0);
          if (midi !== null) {
            expect(midi, `${id} midi`).toBeGreaterThanOrEqual(24); // C1
            expect(midi, `${id} midi`).toBeLessThanOrEqual(96); // C7
          }
        }
      }
    }
  });

  it('midiToFreq matches the A440 reference points', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(57)).toBeCloseTo(220);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });
});
