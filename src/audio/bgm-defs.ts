/**
 * Chiptune BGM scores (pure data, no Web Audio — headless-testable). Each
 * track is a fixed-length loop of channels; a channel is a waveform + a list
 * of [midiNote|null, lengthInSteps] pairs (null = rest). All channels of a
 * track must sum to the same step count so the loop stays phase-locked
 * (enforced by bgm-defs.test and easy to eyeball per 16-step bar).
 */
export type BgmId = 'town' | 'field' | 'boss';

export interface BgmChannel {
  readonly wave: OscillatorType;
  /** Channel gain 0..1 (relative; the engine applies a low master volume). */
  readonly gain: number;
  /** [midi | null(rest), length in steps] — 4 steps = quarter note. */
  readonly notes: readonly (readonly [number | null, number])[];
}

export interface BgmDef {
  readonly bpm: number;
  /** Steps per beat (4 = 16th-note grid). */
  readonly stepsPerBeat: number;
  readonly channels: readonly BgmChannel[];
}

// Note names (12-TET midi numbers) used below, for readability.
const E2 = 40, F2 = 41, G2 = 43, A2 = 45, C3 = 48, D3 = 50, E3 = 52, F3 = 53, G3 = 55;
const C4 = 60, D4 = 62, E4 = 64, G4 = 67, A4 = 69, B4 = 71, GS4 = 68, FS4 = 66;
const C5 = 72, D5 = 74, E5 = 76, F5 = 77;
const _ = null; // rest

export const BGM: Record<BgmId, BgmDef> = {
  // のんびりした拠点曲（Cメジャー・ペンタ中心、8小節ループ）。
  town: {
    bpm: 92,
    stepsPerBeat: 4,
    channels: [
      {
        wave: 'square',
        gain: 0.30,
        notes: [
          [E4, 4], [G4, 4], [A4, 4], [G4, 4],
          [E4, 4], [D4, 4], [C4, 8],
          [E4, 4], [G4, 4], [A4, 4], [C5, 4],
          [G4, 8], [E4, 4], [D4, 4],
          [A4, 4], [G4, 4], [E4, 4], [G4, 4],
          [D4, 4], [E4, 4], [C4, 8],
          [E4, 4], [D4, 4], [E4, 4], [G4, 4],
          [C4, 12], [_, 4],
        ],
      },
      {
        wave: 'triangle',
        gain: 0.5,
        notes: [
          [C3, 8], [G3, 8],
          [A2, 8], [E3, 8],
          [F3, 8], [C3, 8],
          [G3, 8], [G2, 8],
          [C3, 8], [G3, 8],
          [A2, 8], [E3, 8],
          [F3, 8], [G3, 8],
          [C3, 16],
        ],
      },
    ],
  },

  // 冒険フィールド曲（Gメジャー・跳ねる8分、8小節ループ）。
  field: {
    bpm: 122,
    stepsPerBeat: 4,
    channels: [
      {
        wave: 'square',
        gain: 0.28,
        notes: [
          [G4, 2], [A4, 2], [B4, 2], [D5, 2], [B4, 4], [G4, 4],
          [A4, 2], [B4, 2], [C5, 2], [A4, 2], [B4, 8],
          [G4, 2], [A4, 2], [B4, 2], [D5, 2], [E5, 4], [D5, 4],
          [B4, 2], [A4, 2], [G4, 4], [A4, 8],
          [C5, 2], [B4, 2], [A4, 2], [C5, 2], [B4, 4], [G4, 4],
          [A4, 2], [G4, 2], [FS4, 2], [A4, 2], [G4, 8],
          [E5, 4], [D5, 2], [B4, 2], [C5, 4], [A4, 4],
          [G4, 12], [_, 4],
        ],
      },
      {
        wave: 'triangle',
        gain: 0.5,
        notes: [
          [G2, 4], [G2, 4], [D3, 4], [G2, 4],
          [G2, 4], [G2, 4], [D3, 4], [G2, 4],
          [C3, 4], [C3, 4], [G3, 4], [C3, 4],
          [G2, 4], [G2, 4], [D3, 4], [G2, 4],
          [A2, 4], [A2, 4], [E3, 4], [A2, 4],
          [G2, 4], [G2, 4], [D3, 4], [G2, 4],
          [C3, 4], [C3, 4], [D3, 4], [D3, 4],
          [G2, 8], [D3, 8],
        ],
      },
    ],
  },

  // ボス戦曲（Aマイナー・刻むベース、8小節ループ）。
  boss: {
    bpm: 140,
    stepsPerBeat: 4,
    channels: [
      {
        wave: 'square',
        gain: 0.30,
        notes: [
          [A4, 2], [_, 2], [A4, 2], [_, 2], [C5, 2], [B4, 2], [A4, 4],
          [E5, 4], [D5, 2], [C5, 2], [B4, 8],
          [A4, 2], [_, 2], [A4, 2], [_, 2], [D5, 2], [C5, 2], [B4, 4],
          [GS4, 4], [B4, 4], [E4, 8],
          [F5, 4], [E5, 2], [D5, 2], [C5, 4], [D5, 4],
          [E5, 4], [C5, 2], [A4, 2], [B4, 8],
          [A4, 2], [B4, 2], [C5, 2], [D5, 2], [E5, 4], [GS4, 4],
          [A4, 8], [_, 8],
        ],
      },
      {
        wave: 'sawtooth',
        gain: 0.34,
        notes: [
          [A2, 2], [A2, 2], [A2, 2], [A2, 2], [A2, 2], [A2, 2], [E3, 2], [E3, 2],
          [A2, 2], [A2, 2], [A2, 2], [A2, 2], [A2, 2], [A2, 2], [E3, 2], [E3, 2],
          [F2, 2], [F2, 2], [F2, 2], [F2, 2], [F2, 2], [F2, 2], [C3, 2], [C3, 2],
          [G2, 2], [G2, 2], [G2, 2], [G2, 2], [G2, 2], [G2, 2], [D3, 2], [D3, 2],
          [A2, 2], [A2, 2], [A2, 2], [A2, 2], [A2, 2], [A2, 2], [E3, 2], [E3, 2],
          [A2, 2], [A2, 2], [A2, 2], [A2, 2], [A2, 2], [A2, 2], [E3, 2], [E3, 2],
          [F2, 2], [F2, 2], [F2, 2], [F2, 2], [F2, 2], [F2, 2], [C3, 2], [C3, 2],
          [E2, 2], [E2, 2], [E2, 2], [E2, 2], [E2, 2], [E2, 2], [E2, 2], [E2, 2],
        ],
      },
    ],
  },
};

export const BGM_IDS = Object.keys(BGM) as BgmId[];

/** MIDI note number → frequency in Hz (A4 = 440). */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Total loop length of a channel in steps (validation + scheduling). */
export function channelSteps(ch: BgmChannel): number {
  return ch.notes.reduce((sum, [, len]) => sum + len, 0);
}
