import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { allJobs } from '@/jobs/job-defs';
import { JOB_APPEARANCE_IDS } from '@/jobs/job-appearance-ids';

describe('jobs / job change', () => {
  it('starts as adventurer and gates the 1次職 change by job level', () => {
    const gs = new GameState();
    gs.recompute(false);
    expect(gs.jobId).toBe('adventurer');
    expect(gs.jobChangeBlock('fighter')).toBe('level');
    gs.level = 20; // adventurer reaches Lv20
    expect(gs.jobChangeBlock('fighter')).toBeNull();
  });

  it('changing job applies base + derived modifiers', () => {
    const gs = new GameState();
    gs.level = 20;
    gs.recompute(false);
    const str0 = gs.base.STR;
    const atk0 = gs.derived.physAtk;
    expect(gs.changeJob('fighter')).toBe(true);
    expect(gs.jobId).toBe('fighter');
    expect(gs.unlockedJobs).toContain('fighter');
    // STR +4 raises physAtk (2 per STR) plus the flat +2 derived modifier.
    expect(gs.derived.physAtk).toBeGreaterThan(atk0);
    // Base STR itself is unchanged; the modifier is applied in computeDerived.
    expect(gs.base.STR).toBe(str0);
  });

  it('cannot change to the current job', () => {
    const gs = new GameState();
    expect(gs.changeJob('adventurer')).toBe(false);
  });

  it('gates a 2次職 on multiple job levels (multi-job system)', () => {
    const gs = new GameState();
    gs.level = 20;
    // Samurai needs Fighter 50 AND Thief 30.
    expect(gs.jobChangeBlock('samurai')).toBe('level');
    gs.jobLevels.fighter = 50;
    expect(gs.jobChangeBlock('samurai')).toBe('level'); // thief still short
    gs.jobLevels.thief = 30;
    expect(gs.jobChangeBlock('samurai')).toBeNull();
  });

  it('gates a 4次職 on the completed high-difficulty trial', () => {
    const gs = new GameState();
    gs.jobLevels.sword_kaiser = 80;
    expect(gs.jobChangeBlock('aramikagura')).toBe('quest');
    gs.completedQuests.push('tier4_trial');
    expect(gs.jobChangeBlock('aramikagura')).toBeNull();
  });

  it('retains per-job levels when switching jobs', () => {
    const gs = new GameState();
    gs.level = 20;
    gs.changeJob('fighter');
    gs.level = 35; // grind fighter to 35
    gs.jobLevels.fighter = 35;
    gs.changeJob('adventurer'); // back to adventurer (level 20 retained)
    expect(gs.level).toBe(20);
    expect(gs.jobLevelOf('fighter')).toBe(35);
  });

  it('every promoted job keeps a valid fixed character appearance', () => {
    const promoted = allJobs().filter((j) => j.tier >= 1);
    expect(promoted.length).toBeGreaterThan(0);
    const valid = new Set<string>(JOB_APPEARANCE_IDS);
    for (const j of promoted) {
      expect(j.appearance, `${j.id} appearance`).toBeTruthy();
      expect(valid.has(j.appearance!), `${j.id} appearance "${j.appearance}"`).toBe(true);
    }
    // The starter job (adventurer) keeps the default look (no override).
    expect(allJobs().find((j) => j.id === 'adventurer')?.appearance).toBeUndefined();
  });

  it('persists job through save round-trip', () => {
    const gs = new GameState();
    gs.level = 20;
    gs.changeJob('fighter');
    const loaded = new GameState();
    loaded.loadFrom(JSON.parse(JSON.stringify(gs.toSave(0))));
    expect(loaded.jobId).toBe('fighter');
    expect(loaded.derived.physAtk).toBe(gs.derived.physAtk);
  });
});
