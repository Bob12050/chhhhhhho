import { bus } from '@/core/event-bus';
import { SFX, type SfxDef, type SfxId, type SfxStep } from '@/audio/sfx-defs';

/**
 * Web Audio SFX player. Synthesizes the patches in `sfx-defs.ts` on demand —
 * no audio files (keeps the bundle small and avoids CDN fetches). It is the
 * DOM/engine layer for sound: all game logic stays headless and only talks to
 * it through the typed EventBus (`sfx:play`) or the gameplay events it maps.
 *
 * Browser autoplay policy: an AudioContext starts suspended until a user
 * gesture, so we resume it on the first pointer/key/touch. Nothing plays before
 * that first interaction (which is fine — the first tap is on the title screen).
 */
const MUTE_KEY = 'pixelrpg.sfxMuted';
const MASTER = 0.5;
const MAX_VOICES = 14;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted = false;
  private voices = 0;
  private lastAt = new Map<SfxId, number>();
  private installed = false;
  private unlocked = false;

  /** Wire up bus listeners + the gesture unlock. Idempotent. */
  install(): void {
    if (this.installed) return;
    this.installed = true;
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }

    const unlock = (): void => {
      this.ensureCtx();
      void this.ctx?.resume?.();
      this.unlocked = true;
    };
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
      window.addEventListener(ev, unlock, { passive: true });
    }

    // Direct plays plus a curated mapping of gameplay events → SFX. Kept in one
    // place so wiring lives here, not scattered across scenes.
    bus.on('sfx:play', ({ id }) => this.play(id));
    bus.on('player:level-up', () => this.play('level_up'));
    bus.on('item:picked-up', () => this.play('pickup'));
    bus.on('craft:made', () => this.play('craft'));
    bus.on('equipment:changed', () => this.play('equip'));
    bus.on('skill:cooldown', () => this.play('skill'));
    // Suspend the context when the tab/PWA is hidden (mobile battery/perf).
    bus.on('app:visibility-hidden', () => void this.ctx?.suspend?.());
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Toggle mute, persist the choice, and return the new state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* private mode / storage disabled: run muted-in-memory only */
    }
    return this.muted;
  }

  play(id: SfxId): void {
    if (this.muted || !this.unlocked) return;
    const def: SfxDef | undefined = SFX[id];
    if (!def) return;
    const ctx = this.ensureCtx();
    if (!ctx || ctx.state !== 'running' || !this.master) return;

    const nowMs =
      typeof performance !== 'undefined' ? performance.now() : ctx.currentTime * 1000;
    if (nowMs - (this.lastAt.get(id) ?? -1e9) < def.minGapMs) return;
    this.lastAt.set(id, nowMs);

    const t0 = ctx.currentTime;
    for (const step of def.steps) {
      if (this.voices >= MAX_VOICES) break;
      this.playStep(ctx, this.master, step, def.gain, t0);
    }
  }

  private playStep(
    ctx: AudioContext,
    dest: GainNode,
    step: SfxStep,
    defGain: number,
    t0: number,
  ): void {
    const start = t0 + step.delay;
    const peak = Math.max(0.0001, defGain * (step.gain ?? 1));
    const end = start + step.attack + step.decay;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + step.attack);
    g.gain.linearRampToValueAtTime(0.0001, end);
    g.connect(dest);

    let src: AudioScheduledSourceNode;
    if (step.noise) {
      const b = ctx.createBufferSource();
      b.buffer = this.ensureNoise(ctx);
      src = b;
    } else {
      const o = ctx.createOscillator();
      o.type = step.type ?? 'square';
      o.frequency.setValueAtTime(step.freq, start);
      if (step.freqEnd !== undefined) {
        o.frequency.linearRampToValueAtTime(Math.max(1, step.freqEnd), end);
      }
      src = o;
    }
    src.connect(g);
    this.voices++;
    src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
      src.disconnect();
      g.disconnect();
    };
    src.start(start);
    src.stop(end + 0.02);
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext | undefined =
      typeof window !== 'undefined'
        ? window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  private ensureNoise(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuf) return this.noiseBuf;
    const len = Math.floor(ctx.sampleRate * 0.3);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Deterministic-ish white noise (no Math.random dependency needed, but it's
    // fine here — this is pure audio, not game state).
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    return buf;
  }
}

/** Global SFX engine. Install once at startup (main.ts). */
export const soundEngine = new SoundEngine();
