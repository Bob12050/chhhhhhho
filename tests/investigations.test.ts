import { afterEach, describe, expect, it } from 'vitest';
import { GameState } from '@/player/game-state';
import {
  INVESTIGATION_GROUP,
  INVESTIGATION_SEAL_ID,
  syncInvestigationQuests,
} from '@/endgame/investigations';
import { getQuest, replaceRuntimeQuests } from '@/quests/quest-defs';
import { acceptQuest, availableQuests, turnInQuest } from '@/quests/quests';
import { getEquipment, replaceRuntimeEquipment } from '@/data/items';
import { generateInvestigationEquipment } from '@/endgame/investigation-loot';

function postClearState(): GameState {
  const gs = new GameState();
  gs.level = 99;
  gs.flags['main_story_complete'] = true;
  gs.investigationSeed = 0x12345678;
  gs.investigationsCompleted = 0;
  return gs;
}

afterEach(() => {
  replaceRuntimeQuests(INVESTIGATION_GROUP, []);
  replaceRuntimeEquipment([]);
});

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
    const lootId = gs.lastInvestigationLootId;
    expect(lootId).toBeTruthy();
    expect(gs.equipmentOwned).toContain(lootId);
    const loot = getEquipment(lootId!);
    expect(loot?.rarity).toBe(quest.investigation?.rewardRank);
    expect(loot?.generated?.affixes).toHaveLength(2);
    expect(gs.investigationsCompleted).toBe(1);
    expect(gs.investigationSeed).not.toBe(oldSeed);
    expect(getQuest(quest.id)).toBeUndefined();
    expect(availableQuests(gs).filter((q) => q.investigation)).toHaveLength(3);
  });

  it('rolls deterministic affixes for a contract', () => {
    const gs = postClearState();
    const [quest] = syncInvestigationQuests(gs);

    const first = generateInvestigationEquipment(gs, quest);
    const second = generateInvestigationEquipment(gs, quest);
    expect(second).toEqual(first);
    expect(first.generated?.baseId).toBeTruthy();
    expect(first.generated?.threat).toBe(quest.investigation?.threat);
  });

  it('rolls a distinct reward for each contract on the same board', () => {
    const gs = postClearState();
    const board = syncInvestigationQuests(gs);
    const rewards = board.map((quest) => generateInvestigationEquipment(gs, quest));
    const rewardSignatures = rewards.map((reward) =>
      JSON.stringify({
        baseId: reward.generated?.baseId,
        affixes: reward.generated?.affixes,
      }),
    );

    expect(new Set(rewards.map((reward) => reward.id)).size).toBe(board.length);
    expect(new Set(rewardSignatures).size).toBe(board.length);
  });

  it.each([
    [8, 2],
    [9, 3],
    [10, 4],
  ])('gives R%s equipment %s affixes', (rank, count) => {
    const gs = postClearState();
    const [baseQuest] = syncInvestigationQuests(gs);
    const quest = {
      ...baseQuest,
      investigation: { ...baseQuest.investigation!, rewardRank: rank },
    };
    const loot = generateInvestigationEquipment(gs, quest);

    expect(loot.rarity).toBe(rank);
    expect(loot.generated?.affixes).toHaveLength(count);
  });

  it('restores an equipped investigation item and its rolled stats', () => {
    const gs = postClearState();
    gs.jobId = 'aramikagura';
    const [quest] = syncInvestigationQuests(gs);
    const target = quest.objectives[0];
    expect(acceptQuest(gs, quest.id)).toBe(true);
    gs.questProgress[quest.id] = { [target.enemyId]: target.count };
    expect(turnInQuest(gs, quest.id)).toBe(true);

    const lootId = gs.lastInvestigationLootId!;
    const loot = getEquipment(lootId)!;
    expect(gs.canEquip(lootId)).toBe(true);
    gs.equip(loot.slot, lootId);
    const before = { ...gs.derived };
    const save = gs.toSave(1);

    const loaded = new GameState();
    loaded.loadFrom(save);
    expect(loaded.equipment[loot.slot]).toBe(lootId);
    expect(loaded.generatedEquipment[lootId]).toEqual(loot);
    expect(getEquipment(lootId)?.generated?.affixes).toEqual(loot.generated?.affixes);
    expect(loaded.derived).toEqual(before);
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
