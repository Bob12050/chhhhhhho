/**
 * Sound-effect definitions (pure data, no Web Audio / DOM dependency so it is
 * headless-testable). Each SFX is a tiny synth patch: one or more scheduled
 * steps, every step being either an oscillator tone (optionally gliding to
 * `freqEnd`) or a white-noise burst. `sound-engine.ts` renders these via Web
 * Audio. Keeping the data separate lets us validate/tune without a browser.
 */
export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

export interface SfxStep {
  /** Start frequency in Hz (ignored for noise steps). */
  readonly freq: number;
  /** Optional glide target; linear ramp from `freq` over attack+decay. */
  readonly freqEnd?: number;
  /** Oscillator waveform (default 'square'). Ignored when `noise` is set. */
  readonly type?: Waveform;
  /** Use a white-noise burst instead of an oscillator (impacts / thuds). */
  readonly noise?: boolean;
  /** Seconds after trigger before this step sounds. */
  readonly delay: number;
  /** Attack time in seconds (ramp 0 → peak). */
  readonly attack: number;
  /** Decay time in seconds (ramp peak → silence). */
  readonly decay: number;
  /** Per-step gain multiplier 0..1 (default 1). */
  readonly gain?: number;
}

export interface SfxDef {
  /** Overall gain 0..1 (applied on top of the master volume). */
  readonly gain: number;
  /** Minimum ms between identical triggers (rate-limits machine-gun replays). */
  readonly minGapMs: number;
  readonly steps: readonly SfxStep[];
}

export type SfxId =
  | 'attack'
  | 'hit'
  | 'crit'
  | 'enemy_down'
  | 'hurt'
  | 'level_up'
  | 'pickup'
  | 'skill'
  | 'craft'
  | 'equip'
  | 'coin'
  | 'ui_tap'
  | 'boom'
  | 'roar'
  | 'dodge'
  | 'fanfare';

export const SFX: Record<SfxId, SfxDef> = {
  // Whoosh of a swing: a short noise swish plus a low body.
  attack: {
    gain: 0.5,
    minGapMs: 45,
    steps: [
      { freq: 0, noise: true, delay: 0, attack: 0.005, decay: 0.07, gain: 0.5 },
      { freq: 190, freqEnd: 120, type: 'square', delay: 0, attack: 0.004, decay: 0.06, gain: 0.4 },
    ],
  },
  // Solid connect: a bright falling blip with a tiny transient.
  hit: {
    gain: 0.55,
    minGapMs: 30,
    steps: [
      { freq: 460, freqEnd: 320, type: 'square', delay: 0, attack: 0.002, decay: 0.07, gain: 0.6 },
      { freq: 0, noise: true, delay: 0, attack: 0.001, decay: 0.03, gain: 0.3 },
    ],
  },
  // Critical: two rising tones, brighter and a touch longer.
  crit: {
    gain: 0.6,
    minGapMs: 40,
    steps: [
      { freq: 660, type: 'square', delay: 0, attack: 0.002, decay: 0.06, gain: 0.6 },
      { freq: 990, type: 'square', delay: 0.05, attack: 0.002, decay: 0.11, gain: 0.6 },
      { freq: 0, noise: true, delay: 0, attack: 0.001, decay: 0.04, gain: 0.35 },
    ],
  },
  // Defeat: a downward saw sweep with a noise tail.
  enemy_down: {
    gain: 0.5,
    minGapMs: 60,
    steps: [
      { freq: 420, freqEnd: 80, type: 'sawtooth', delay: 0, attack: 0.005, decay: 0.28, gain: 0.5 },
      { freq: 0, noise: true, delay: 0, attack: 0.005, decay: 0.2, gain: 0.25 },
    ],
  },
  // Player takes a hit: low noisy thud.
  hurt: {
    gain: 0.6,
    minGapMs: 120,
    steps: [
      { freq: 170, freqEnd: 70, type: 'square', delay: 0, attack: 0.004, decay: 0.18, gain: 0.6 },
      { freq: 0, noise: true, delay: 0, attack: 0.002, decay: 0.12, gain: 0.4 },
    ],
  },
  // Level up: a bright rising major arpeggio (C-E-G-C).
  level_up: {
    gain: 0.5,
    minGapMs: 250,
    steps: [
      { freq: 523, type: 'triangle', delay: 0, attack: 0.005, decay: 0.14, gain: 0.5 },
      { freq: 659, type: 'triangle', delay: 0.11, attack: 0.005, decay: 0.14, gain: 0.5 },
      { freq: 784, type: 'triangle', delay: 0.22, attack: 0.005, decay: 0.16, gain: 0.5 },
      { freq: 1047, type: 'triangle', delay: 0.33, attack: 0.005, decay: 0.26, gain: 0.55 },
    ],
  },
  // Item pickup: a quick upward blip.
  pickup: {
    gain: 0.45,
    minGapMs: 40,
    steps: [{ freq: 660, freqEnd: 990, type: 'triangle', delay: 0, attack: 0.003, decay: 0.09, gain: 0.5 }],
  },
  // Skill cast: an upward sweep with a soft sine layer.
  skill: {
    gain: 0.45,
    minGapMs: 80,
    steps: [
      { freq: 220, freqEnd: 660, type: 'sawtooth', delay: 0, attack: 0.005, decay: 0.18, gain: 0.4 },
      { freq: 440, type: 'sine', delay: 0.02, attack: 0.005, decay: 0.16, gain: 0.3 },
    ],
  },
  // Craft complete: a pleasant two-note ding.
  craft: {
    gain: 0.5,
    minGapMs: 120,
    steps: [
      { freq: 784, type: 'triangle', delay: 0, attack: 0.003, decay: 0.12, gain: 0.5 },
      { freq: 1047, type: 'triangle', delay: 0.09, attack: 0.003, decay: 0.22, gain: 0.5 },
    ],
  },
  // Equip: a short click plus a low tone.
  equip: {
    gain: 0.45,
    minGapMs: 80,
    steps: [
      { freq: 0, noise: true, delay: 0, attack: 0.001, decay: 0.03, gain: 0.35 },
      { freq: 392, type: 'square', delay: 0.01, attack: 0.003, decay: 0.1, gain: 0.4 },
    ],
  },
  // Coins: two quick high blips.
  coin: {
    gain: 0.4,
    minGapMs: 60,
    steps: [
      { freq: 988, type: 'square', delay: 0, attack: 0.002, decay: 0.06, gain: 0.4 },
      { freq: 1319, type: 'square', delay: 0.06, attack: 0.002, decay: 0.08, gain: 0.4 },
    ],
  },
  // UI tap: a tiny short click.
  ui_tap: {
    gain: 0.3,
    minGapMs: 20,
    steps: [{ freq: 330, type: 'square', delay: 0, attack: 0.001, decay: 0.04, gain: 0.3 }],
  },
  // Boss AoE detonation: deep thump + noise burst.
  boom: {
    gain: 0.6,
    minGapMs: 90,
    steps: [
      { freq: 120, freqEnd: 45, type: 'square', delay: 0, attack: 0.004, decay: 0.24, gain: 0.6 },
      { freq: 0, noise: true, delay: 0, attack: 0.002, decay: 0.18, gain: 0.45 },
    ],
  },
  // Dodge roll: short airy whoosh.
  dodge: {
    gain: 0.4,
    minGapMs: 200,
    steps: [
      { freq: 0, noise: true, delay: 0, attack: 0.01, decay: 0.12, gain: 0.5 },
      { freq: 320, freqEnd: 170, type: 'triangle', delay: 0, attack: 0.006, decay: 0.1, gain: 0.3 },
    ],
  },
  // Quest clear fanfare: short rising four-note flourish (C-E-G-C + fifth cap).
  fanfare: {
    gain: 0.55,
    minGapMs: 800,
    steps: [
      { freq: 523, type: 'square', delay: 0, attack: 0.004, decay: 0.16, gain: 0.45 },
      { freq: 659, type: 'square', delay: 0.13, attack: 0.004, decay: 0.16, gain: 0.45 },
      { freq: 784, type: 'square', delay: 0.26, attack: 0.004, decay: 0.2, gain: 0.45 },
      { freq: 1047, type: 'square', delay: 0.42, attack: 0.004, decay: 0.34, gain: 0.5 },
      { freq: 1568, type: 'triangle', delay: 0.42, attack: 0.004, decay: 0.4, gain: 0.35 },
    ],
  },
  // Boss enrage roar: long falling saw growl with a noise bed.
  roar: {
    gain: 0.6,
    minGapMs: 400,
    steps: [
      { freq: 300, freqEnd: 70, type: 'sawtooth', delay: 0, attack: 0.02, decay: 0.55, gain: 0.55 },
      { freq: 150, freqEnd: 55, type: 'square', delay: 0.05, attack: 0.02, decay: 0.5, gain: 0.4 },
      { freq: 0, noise: true, delay: 0, attack: 0.01, decay: 0.4, gain: 0.3 },
    ],
  },
};

export const SFX_IDS = Object.keys(SFX) as SfxId[];
