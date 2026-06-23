import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';

describe('jobs / job change', () => {
  it('starts as novice and gates the tier-1 change by level', () => {
    const gs = new GameState();
    gs.recompute(false);
    expect(gs.jobId).toBe('novice');
    expect(gs.jobChangeBlock('warrior')).toBe('level');
    gs.level = 3;
    expect(gs.jobChangeBlock('warrior')).toBeNull();
  });

  it('changing job applies base + derived modifiers', () => {
    const gs = new GameState();
    gs.level = 3;
    gs.recompute(false);
    const str0 = gs.base.STR;
    const atk0 = gs.derived.physAtk;
    expect(gs.changeJob('warrior')).toBe(true);
    expect(gs.jobId).toBe('warrior');
    expect(gs.unlockedJobs).toContain('warrior');
    // STR +4 raises physAtk (2 per STR) plus the flat +2 derived modifier.
    expect(gs.derived.physAtk).toBeGreaterThan(atk0);
    // Base STR itself is unchanged; the modifier is applied in computeDerived.
    expect(gs.base.STR).toBe(str0);
  });

  it('cannot change to the current job', () => {
    const gs = new GameState();
    expect(gs.changeJob('novice')).toBe(false);
  });

  it('persists job through save round-trip', () => {
    const gs = new GameState();
    gs.level = 3;
    gs.changeJob('warrior');
    const loaded = new GameState();
    loaded.loadFrom(JSON.parse(JSON.stringify(gs.toSave(0))));
    expect(loaded.jobId).toBe('warrior');
    expect(loaded.derived.physAtk).toBe(gs.derived.physAtk);
  });
});
