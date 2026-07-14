import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { getSkill, allSkills } from '@/skills/skill-defs';
import { CLASS_FAMILIES } from '@/jobs/job-defs';
import { bus } from '@/core/event-bus';

describe('skills', () => {
  it('gates learning by points, level, and prerequisites', () => {
    const gs = new GameState();
    gs.level = 1;
    gs.skillPoints = 0;
    gs.recompute(false);

    // power_strike needs Lv3 + slash; with no points -> 'points' first.
    expect(gs.skillLearnBlock('power_strike')).toBe('points');
    gs.skillPoints = 5;
    expect(gs.skillLearnBlock('power_strike')).toBe('level');
    gs.level = 3;
    expect(gs.skillLearnBlock('power_strike')).toBe('requires');
    gs.learnSkill('slash');
    expect(gs.skillLearnBlock('power_strike')).toBeNull();
  });

  it('assigns learned actives to skill slots', () => {
    const gs = new GameState();
    gs.level = 3;
    gs.skillPoints = 3;
    gs.learnSkill('slash');
    gs.learnSkill('power_strike');
    expect(gs.skillSlots).toContain('slash');
    expect(gs.skillSlots).toContain('power_strike');
  });

  it('reassigns active skills by swapping S1 and S2 without duplicates', () => {
    const gs = new GameState();
    gs.level = 3;
    gs.skillPoints = 3;
    gs.learnSkill('slash');
    gs.learnSkill('power_strike');

    expect(gs.skillSlots).toEqual(['slash', 'power_strike']);
    expect(gs.assignSkill(0, 'power_strike')).toBe(true);
    expect(gs.skillSlots).toEqual(['power_strike', 'slash']);
    expect(gs.assignSkill(2, 'slash')).toBe(false);
    expect(gs.assignSkill(0, 'toughness')).toBe(false);
  });

  it('publishes slot snapshots after learning and assigning active skills', () => {
    const snapshots: (string | null)[][] = [];
    const off = bus.on('skill:slots-changed', ({ slots }) => snapshots.push(slots));
    const gs = new GameState();
    gs.level = 3;
    gs.skillPoints = 3;
    gs.learnSkill('slash');
    gs.learnSkill('power_strike');
    gs.assignSkill(0, 'power_strike');
    off();

    expect(snapshots).toEqual([
      ['slash', null],
      ['slash', 'power_strike'],
      ['power_strike', 'slash'],
    ]);
  });

  it('passive skills modify derived stats', () => {
    const gs = new GameState();
    gs.level = 2;
    gs.skillPoints = 1;
    gs.recompute(false);
    const hp0 = gs.derived.maxHp;
    gs.learnSkill('toughness');
    const passive = getSkill('toughness')!;
    expect(gs.derived.maxHp).toBe(hp0 + (passive.derived!.maxHp ?? 0));
  });

  it('level-up grants a skill point', () => {
    const gs = new GameState();
    gs.recompute(false);
    const p0 = gs.skillPoints;
    gs.gainExp(100000); // force several level-ups
    expect(gs.skillPoints).toBeGreaterThan(p0);
  });

  it('gates family skills by the active job family', () => {
    const gs = new GameState();
    gs.level = 10;
    gs.skillPoints = 5;
    gs.recompute(false);
    // w_cleave is a warrior skill; as adventurer (no family) it is locked.
    expect(getSkill('w_cleave')!.family).toBe('warrior');
    expect(gs.skillLearnBlock('w_cleave')).toBe('job');
    // A mage cannot learn it either.
    gs.jobId = 'mage';
    expect(gs.skillLearnBlock('w_cleave')).toBe('job');
    // A warrior-family job can.
    gs.jobId = 'fighter';
    expect(gs.skillLearnBlock('w_cleave')).toBeNull();
    gs.learnSkill('w_cleave');
    expect(gs.skills['w_cleave']).toBe(1);
  });

  it('gates higher skills by job tier (promotion), not just level', () => {
    const gs = new GameState();
    gs.level = 60; // high enough level for every warrior skill
    gs.skillPoints = 20;
    // 1次職 fighter: tier-1 skills OK, tier-2+ locked behind promotion.
    gs.jobId = 'fighter';
    gs.recompute(false);
    expect(getSkill('w_cleave')!.minTier).toBe(1);
    expect(getSkill('w_whirl')!.minTier).toBe(2);
    expect(gs.skillLearnBlock('w_cleave')).toBeNull(); // t1 skill, t1 job
    expect(gs.skillLearnBlock('w_whirl')).toBe('tier'); // needs 2次職
    // 2次職 samurai unlocks the tier-2 skill (after its prerequisite).
    gs.jobId = 'samurai';
    gs.learnSkill('w_cleave');
    expect(gs.skillLearnBlock('w_whirl')).toBeNull();
    // 4次職-only skill still locked for a 2次職.
    expect(getSkill('w_calamity')!.minTier).toBe(4);
    expect(gs.skillLearnBlock('w_calamity')).toBe('tier');
  });

  it('learned skills persist after changing to a different family', () => {
    const gs = new GameState();
    gs.level = 10;
    gs.skillPoints = 5;
    gs.jobId = 'fighter';
    gs.recompute(false);
    gs.learnSkill('w_cleave');
    gs.jobId = 'mage'; // switch family
    expect(gs.skills['w_cleave']).toBe(1); // still known
  });

  it('every class family has at least one active and one passive skill', () => {
    for (const fam of CLASS_FAMILIES) {
      const fams = allSkills().filter((s) => s.family === fam);
      expect(fams.some((s) => s.type === 'active'), `${fam} active`).toBe(true);
      expect(fams.some((s) => s.type === 'passive'), `${fam} passive`).toBe(true);
    }
  });

  it('active skills declare a valid scaling and passives declare none', () => {
    for (const s of allSkills()) {
      if (s.type === 'active') {
        expect(['phys', 'mag', undefined]).toContain(s.scaling);
      } else {
        expect(s.scaling).toBeUndefined();
      }
    }
  });
});

describe('skill effect verbs', () => {
  it('each family gained a distinct verb (heal/buff/projectile)', () => {
    expect(getSkill('c_holylight')!.effect).toBe('heal');
    expect(getSkill('w_warcry')!.effect).toBe('buff');
    expect(getSkill('w_warcry')!.buffStats?.physAtk).toBeGreaterThan(0);
    expect(getSkill('m_firebolt')!.effect).toBe('projectile');
    expect(getSkill('b_volley')!.effect).toBe('projectile');
    expect(getSkill('b_volley')!.projCount).toBe(3);
  });

  it('effects only appear on active skills with sane params', () => {
    for (const s of allSkills()) {
      if (s.effect === undefined) continue;
      expect(s.type, s.id).toBe('active');
      if (s.effect === 'buff') {
        expect(s.buffMs, s.id).toBeGreaterThan(0);
        expect(Object.keys(s.buffStats ?? {}).length, s.id).toBeGreaterThan(0);
      }
      if (s.effect === 'projectile' && s.projSpeed !== undefined) {
        expect(s.projSpeed, s.id).toBeGreaterThan(0);
      }
    }
  });
});

