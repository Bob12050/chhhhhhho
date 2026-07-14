import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { createDefaultSave, migrate } from '@/save/schema';
import {
  availableQuests,
  acceptQuest,
  abandonQuest,
  recordKill,
  isComplete,
  reconcileHuntAttempts,
  turnInQuest,
  requireMet,
} from '@/quests/quests';
import { getQuest } from '@/quests/quest-defs';

function fresh(): GameState {
  const gs = new GameState();
  gs.loadFrom(createDefaultSave(0));
  return gs;
}

describe('quests', () => {
  it('accept → kill progress → complete → turn in grants rewards', () => {
    const gs = fresh();
    expect(acceptQuest(gs, 'subj_wolves')).toBe(true);
    expect(gs.activeQuests).toContain('subj_wolves');

    const goldBefore = gs.gold;
    for (let i = 0; i < 4; i++) recordKill(gs, 'green_wolf');
    expect(isComplete(gs, 'subj_wolves')).toBe(false);
    recordKill(gs, 'green_wolf'); // 5th
    expect(isComplete(gs, 'subj_wolves')).toBe(true);

    expect(turnInQuest(gs, 'subj_wolves')).toBe(true);
    expect(gs.completedQuests).toContain('subj_wolves');
    expect(gs.activeQuests).not.toContain('subj_wolves');
    expect(gs.gold).toBe(goldBefore + getQuest('subj_wolves')!.rewards.gold!);
    expect(gs.materials.soft_leather ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('kills only count for accepted quests and cap at the objective', () => {
    const gs = fresh();
    recordKill(gs, 'green_wolf'); // not accepted yet → no effect
    acceptQuest(gs, 'subj_wolves');
    for (let i = 0; i < 10; i++) recordKill(gs, 'green_wolf');
    expect(gs.questProgress['subj_wolves'].green_wolf).toBe(5); // capped
  });

  it('cannot turn in an incomplete quest', () => {
    const gs = fresh();
    acceptQuest(gs, 'subj_wolves');
    recordKill(gs, 'green_wolf');
    expect(turnInQuest(gs, 'subj_wolves')).toBe(false);
  });

  it('availability gates on minLevel and prerequisite quest', () => {
    const gs = fresh();
    // subj_treant needs level 6.
    expect(requireMet(gs, getQuest('subj_treant')!)).toBe(false);
    gs.level = 6;
    expect(requireMet(gs, getQuest('subj_treant')!)).toBe(true);
    // subj_stone needs subj_treant completed.
    expect(requireMet(gs, getQuest('subj_stone')!)).toBe(false);
    gs.completedQuests.push('subj_treant');
    expect(requireMet(gs, getQuest('subj_stone')!)).toBe(true);
  });

  it('places the 4次職 trial in ★7 and settles a cleared legacy attempt', () => {
    const gs = fresh();
    gs.level = 94;
    gs.completedQuests.push('main_09_finale');
    expect(getQuest('tier4_trial')?.rank).toBe(7);
    expect(acceptQuest(gs, 'tier4_trial')).toBe(true);
    recordKill(gs, 'boss_slime');
    expect(reconcileHuntAttempts(gs, 'town').completed).toEqual(['tier4_trial']);
    expect(gs.flags['quest_tier4_trial']).toBe(true);
    expect(gs.completedQuests).toContain('tier4_trial');
    expect(gs.activeQuests).not.toContain('tier4_trial');
  });

  it('repairs an old cleared 4次職 trial even without the new story gate', () => {
    const gs = fresh();
    gs.level = 30;
    gs.activeQuests.push('tier4_trial');
    gs.questProgress.tier4_trial = { boss_slime: 1 };

    expect(reconcileHuntAttempts(gs, 'town').completed).toEqual(['tier4_trial']);
    expect(gs.flags.quest_tier4_trial).toBe(true);
    expect(gs.completedQuests).toContain('tier4_trial');
  });

  it('allows only one arena quest at a time and resets an abandoned attempt', () => {
    const gs = fresh();
    gs.level = 99;
    expect(acceptQuest(gs, 'hunt_flame_lord')).toBe(true);
    gs.questProgress.hunt_flame_lord = { flame_wisp: 2 };
    expect(acceptQuest(gs, 'hunt_bat_lord')).toBe(false);
    expect(availableQuests(gs).filter((q) => q.huntMap)).toHaveLength(0);

    expect(abandonQuest(gs, 'hunt_flame_lord')).toBe(true);
    expect(gs.questProgress.hunt_flame_lord).toBeUndefined();
    expect(acceptQuest(gs, 'hunt_bat_lord')).toBe(true);
  });

  it('abandons an unfinished hunt after leaving its arena', () => {
    const gs = fresh();
    gs.level = 99;
    expect(acceptQuest(gs, 'hunt_flame_lord')).toBe(true);

    const result = reconcileHuntAttempts(gs, 'town');

    expect(result.abandoned).toEqual(['hunt_flame_lord']);
    expect(gs.activeQuests).not.toContain('hunt_flame_lord');
  });

  it('hunt quest: repeatable boss hunt with a huntMap, re-acceptable after turn-in', () => {
    const gs = fresh();
    gs.level = 20; // meets minLevel
    const hunt = getQuest('hunt_flame_lord')!;
    expect(hunt.type).toBe('hunt');
    expect(hunt.huntMap).toBe('arena_volcano');
    expect(hunt.repeatable).toBe(true);
    expect(hunt.objectives[0].enemyId).toBe('boss_flame');

    expect(acceptQuest(gs, 'hunt_flame_lord')).toBe(true);
    recordKill(gs, 'boss_flame');
    expect(isComplete(gs, 'hunt_flame_lord')).toBe(true);
    expect(turnInQuest(gs, 'hunt_flame_lord')).toBe(true);
    // Repeatable: completion IS recorded (so 歴戦/連続 quests gated on
    // questDone can unlock) but the hunt stays available and re-acceptable.
    expect(gs.completedQuests).toContain('hunt_flame_lord');
    expect(availableQuests(gs).map((q) => q.id)).toContain('hunt_flame_lord');
    expect(acceptQuest(gs, 'hunt_flame_lord')).toBe(true);
  });

  it('questDone gate unlocks a follow-up behind a repeatable hunt (歴戦)', () => {
    const gs = fresh();
    gs.level = 60;
    const vet = getQuest('hunt_r3_10_veteran_flame')!;
    expect(vet.veteran).toBe(true);
    // Locked until the base hunt has been turned in at least once.
    expect(availableQuests(gs).map((q) => q.id)).not.toContain('hunt_r3_10_veteran_flame');
    acceptQuest(gs, 'hunt_flame_lord');
    recordKill(gs, 'boss_flame');
    turnInQuest(gs, 'hunt_flame_lord');
    expect(availableQuests(gs).map((q) => q.id)).toContain('hunt_r3_10_veteran_flame');
  });

  it('sequential hunt objectives complete in order (露払い→ボス)', () => {
    const gs = fresh();
    gs.level = 60;
    acceptQuest(gs, 'hunt_bat_lord');
    recordKill(gs, 'boss_bat_lord');
    turnInQuest(gs, 'hunt_bat_lord');
    expect(acceptQuest(gs, 'hunt_r2_09_night_prelude')).toBe(true);
    for (let i = 0; i < 4; i++) recordKill(gs, 'cave_bat');
    expect(isComplete(gs, 'hunt_r2_09_night_prelude')).toBe(false);
    recordKill(gs, 'boss_bat_lord');
    expect(isComplete(gs, 'hunt_r2_09_night_prelude')).toBe(true);
  });

  it('available list excludes active and completed quests', () => {
    const gs = fresh();
    const before = availableQuests(gs).map((q) => q.id);
    expect(before).toContain('subj_wolves');
    acceptQuest(gs, 'subj_wolves');
    expect(availableQuests(gs).map((q) => q.id)).not.toContain('subj_wolves');
  });

  it('quest state survives a save round trip', () => {
    const gs = fresh();
    acceptQuest(gs, 'subj_wolves');
    recordKill(gs, 'green_wolf');
    recordKill(gs, 'green_wolf');
    const loaded = new GameState();
    loaded.loadFrom(migrate(JSON.parse(JSON.stringify(gs.toSave(0))), 0));
    expect(loaded.activeQuests).toContain('subj_wolves');
    expect(loaded.questProgress['subj_wolves'].green_wolf).toBe(2);
  });
});
