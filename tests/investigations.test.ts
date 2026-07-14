import { afterEach, describe, expect, it } from 'vitest';
import { GameState } from '@/player/game-state';
import {
  INVESTIGATION_GROUP,
  INVESTIGATION_SEAL_ID,
  syncInvestigationQuests,
} from '@/endgame/investigations';
import { getQuest, replaceRuntimeQuests } from '@/quests/quest-defs';
import { acceptQuest, availableQuests, turnInQuest } from '@/quests/quests';

function postClearState(): GameState {
  const gs = new GameState();
  gs.level = 99;
  gs.flags['main_story_complete'] = true;
  gs.investigationSeed = 0x12345678;
  gs.investigationsCompleted = 0;
  return gs;
}

afterEach(() => replaceRuntimeQuests(INVESTIGATION_GROUP, []));

describe('post-clear investigations', () => {
  it('deals three deterministic, distinct boss contracts', () => {
    const gs = postClearState();
    const first = syncInvestigationQuests(gs);
    const second = syncInvestigationQuests(gs);

    expect(first).toHaveLength(3);
    expect(second.map((q) => q.id)).toEqual(first.map((q) => q.id));
    expect(new Set(first.map((q) => q.objectives[0].enemyId)).size).toBe(3);
    for (const quest of first) {
      expect(quest.investigation?.threat).toBeGreaterThanOrEqual(1);
      expect(quest.huntModifiers?.hpMult).toBeGreaterThan(1);
      expect(quest.huntModifiers?.dmgMult).toBeGreaterThan(1);
      expect(quest.rewards.items?.[INVESTIGATION_SEAL_ID]).toBeGreaterThan(0);
    }
    expect(availableQuests(gs).filter((q) => q.investigation)).toHaveLength(3);
  });

  it('allows only one investigation hunt at a time', () => {
    const gs = postClearState();
    const [first, second] = syncInvestigationQuests(gs);

    expect(acceptQuest(gs, first.id)).toBe(true);
    expect(acceptQuest(gs, second.id)).toBe(false);
    expect(availableQuests(gs).filter((q) => q.investigation)).toHaveLength(0);
  });

  it('grants seals and refreshes the board after turn-in', () => {
    const gs = postClearState();
    const board = syncInvestigationQuests(gs);
    const quest = board[0];
    const target = quest.objectives[0];
    const oldSeed = gs.investigationSeed;
    expect(acceptQuest(gs, quest.id)).toBe(true);
    gs.questProgress[quest.id] = { [target.enemyId]: target.count };

    expect(turnInQuest(gs, quest.id)).toBe(true);
    expect(gs.materials[INVESTIGATION_SEAL_ID]).toBe(quest.rewards.items?.[INVESTIGATION_SEAL_ID]);
    expect(gs.investigationsCompleted).toBe(1);
    expect(gs.investigationSeed).not.toBe(oldSeed);
    expect(getQuest(quest.id)).toBeUndefined();
    expect(availableQuests(gs).filter((q) => q.investigation)).toHaveLength(3);
  });

  it('preserves an active generated contract across save and load', () => {
    const gs = postClearState();
    const [quest] = syncInvestigationQuests(gs);
    expect(acceptQuest(gs, quest.id)).toBe(true);
    const save = gs.toSave(1);

    const loaded = new GameState();
    loaded.loadFrom(save);
    expect(loaded.investigationSeed).toBe(gs.investigationSeed);
    expect(loaded.investigationsCompleted).toBe(0);
    expect(loaded.activeQuests).toContain(quest.id);
    expect(getQuest(quest.id)?.investigation).toBeDefined();
  });
});
