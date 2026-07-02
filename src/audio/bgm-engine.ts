import { soundEngine } from '@/audio/sound-engine';
import { BGM, midiToFreq, type BgmId, type BgmChannel } from '@/audio/bgm-defs';

/**
 * Chiptune BGM sequencer on the shared Web Audio context. Uses the classic
 * lookahead pattern: a coarse JS interval schedules sample-accurate notes a
 * few hundred ms ahead, so timing survives main-thread jank. Follows the SFX
 * mute toggle (one "サウンド" switch controls everything) and inherits the
 * context suspend on tab-hide from the SoundEngine.
 */
const MASTER_GAIN = 0.14; // BGM sits well under the SFX
const LOOKAHEAD_S = 0.35;
const TICK_MS = 120;
const FADE_S = 0.25;

interface ChannelState {
  def: BgmChannel;
  index: number; // next note index
  nextTime: number; // ctx time the next note starts
}

class BgmEngine {
  private current: BgmId | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private gain: GainNode | null = null;
  private channels: ChannelState[] = [];
  private stepDur = 0;

  /** Start (or switch to) a track. Same id = no-op so scenes can call freely. */
  play(id: BgmId): void {
    if (this.current === id) return;
    this.current = id;
    this.restart();
    // The context appears only after the first user gesture; keep trying via
    // the tick until it exists (then scheduling begins transparently).
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    this.current = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = soundEngine.getContext();
    if (this.gain && ctx) {
      const g = this.gain;
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE_S);
      setTimeout(() => g.disconnect(), FADE_S * 1000 + 100);
      this.gain = null;
    }
    this.channels = [];
  }

  /** Reset channel pointers for the current track (called on track switch). */
  private restart(): void {
    const ctx = soundEngine.getContext();
    // Fade out whatever was sounding; a fresh gain is made lazily in tick().
    if (this.gain && ctx) {
      const g = this.gain;
      g.gain.setValueAtTime(g.gain.value, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + FADE_S);
      setTimeout(() => g.disconnect(), FADE_S * 1000 + 100);
    }
    this.gain = null;
    this.channels = [];
  }

  private ensureStarted(ctx: AudioContext): void {
    if (this.gain || !this.current) return;
    const def = BGM[this.current];
    this.gain = ctx.createGain();
    this.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.gain.gain.linearRampToValueAtTime(MASTER_GAIN, ctx.currentTime + FADE_S);
    this.gain.connect(ctx.destination);
    this.stepDur = 60 / (def.bpm * def.stepsPerBeat);
    const t0 = ctx.currentTime + 0.05;
    this.channels = def.channels.map((ch) => ({ def: ch, index: 0, nextTime: t0 }));
  }

  private tick(): void {
    if (!this.current) return;
    const ctx = soundEngine.getContext();
    if (!ctx || ctx.state !== 'running') return;
    // One サウンド toggle rules both SFX and BGM.
    if (soundEngine.isMuted()) {
      if (this.gain) this.gain.gain.value = 0;
      return;
    }
    this.ensureStarted(ctx);
    if (!this.gain) return;
    if (this.gain.gain.value === 0) this.gain.gain.value = MASTER_GAIN;

    const horizon = ctx.currentTime + LOOKAHEAD_S;
    for (const st of this.channels) {
      // If the tab slept long enough for the pointer to fall behind, snap it
      // forward instead of machine-gunning the backlog.
      if (st.nextTime < ctx.currentTime - 0.5) st.nextTime = ctx.currentTime + 0.02;
      while (st.nextTime < horizon) {
        const [midi, len] = st.def.notes[st.index];
        const dur = len * this.stepDur;
        if (midi !== null) this.scheduleNote(ctx, st.def, midi, st.nextTime, dur);
        st.nextTime += dur;
        st.index = (st.index + 1) % st.def.notes.length;
      }
    }
  }

  private scheduleNote(
    ctx: AudioContext,
    ch: BgmChannel,
    midi: number,
    at: number,
    dur: number,
  ): void {
    if (!this.gain) return;
    const osc = ctx.createOscillator();
    osc.type = ch.wave;
    osc.frequency.setValueAtTime(midiToFreq(midi), at);
    const g = ctx.createGain();
    // Small attack + release inside the note keeps steps from clicking.
    const peak = Math.max(0.0001, ch.gain);
    const release = Math.min(0.06, dur * 0.25);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.012);
    g.gain.setValueAtTime(peak, at + dur - release);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(this.gain);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }
}

/** Global BGM engine. Scenes call `bgm.play('town' | 'field' | 'boss')`. */
export const bgm = new BgmEngine();

/** Track for a map id (town → town, hunt arenas/boss rooms → boss, else field). */
export function bgmForMap(mapId: string): BgmId {
  if (mapId === 'town') return 'town';
  if (mapId.startsWith('arena_') || mapId === 'boss_room') return 'boss';
  return 'field';
}
