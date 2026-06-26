import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { createDefaultSave, migrate } from '@/save/schema';
import {
  availableQuests,
  acceptQuest,
  recordKill,
  isComplete,
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

  it('unlock quest sets the 4次職 flag the job tree reads', () => {
    const gs = fresh();
    gs.level = 30;
    gs.completedQuests.push('subj_stone');
    expect(acceptQuest(gs, 'tier4_trial')).toBe(true);
    recordKill(gs, 'boss_slime');
    expect(turnInQuest(gs, 'tier4_trial')).toBe(true);
    expect(gs.flags['quest_tier4_trial']).toBe(true);
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
