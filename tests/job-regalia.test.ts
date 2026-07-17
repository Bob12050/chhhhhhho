import { describe, expect, it } from 'vitest';
import { allEquipment, getEquipment } from '@/data/items';
import { huntSimulationQuests } from '@/balance/hunt-simulator';
import { equippedJobRegaliaAppearance } from '@/equipment/job-regalia-appearance';
import { allJobs } from '@/jobs/job-defs';
import {
  JOB_REGALIA,
  jobRegaliaItemId,
  jobRegaliaQuestId,
} from '@/jobs/job-regalia';
import { GameState } from '@/player/game-state';
import { allQuests, getQuest } from '@/quests/quest-defs';
import { acceptQuest, availableQuests, recordKill, turnInQuest } from '@/quests/quests';

describe('job regalia', () => {
  it('provides one exact-job outfit and one one-time trial for every authored job look', () => {
    const appearanceJobs = allJobs().filter((job) => job.appearance);
    expect(JOB_REGALIA).toHaveLength(appearanceJobs.length);

    for (const job of appearanceJobs) {
      const itemId = jobRegaliaItemId(job.id);
      const questId = jobRegaliaQuestId(job.id);
      const item = getEquipment(itemId);
      const quest = getQuest(questId);

      expect(item?.slot, itemId).toBe('torso');
      expect(item?.appearance, itemId).toBe(job.appearance);
      expect(item?.jobRequirements, itemId).toEqual([job.id]);
      expect(item?.sellPrice, itemId).toBe(0);
      expect(quest?.repeatable, questId).not.toBe(true);
      expect(quest?.require?.jobId, questId).toBe(job.id);
      expect(quest?.require?.minLevel, questId).toBe(item?.levelRequirement);
      expect(quest?.huntMap, questId).toBeTruthy();
      expect(quest?.rewards.items, questId).toEqual({ [itemId]: 1 });
    }

    expect(new Set(allEquipment().map((item) => item.id)).size).toBe(allEquipment().length);
    expect(new Set(allQuests().map((quest) => quest.id)).size).toBe(allQuests().length);
    expect(huntSimulationQuests().every((quest) => !quest.require?.jobId)).toBe(true);
  });

  it('offers and progresses a class trial only while its exact job is active', () => {
    const gs = new GameState();
    const questId = jobRegaliaQuestId('fighter');
    const itemId = jobRegaliaItemId('fighter');

    gs.level = 99;
    gs.jobId = 'mage';
    expect(availableQuests(gs).some((quest) => quest.id === questId)).toBe(false);
    expect(acceptQuest(gs, questId)).toBe(false);

    gs.jobId = 'fighter';
    expect(availableQuests(gs).some((quest) => quest.id === questId)).toBe(true);
    expect(acceptQuest(gs, questId)).toBe(true);

    gs.jobId = 'mage';
    recordKill(gs, 'boss_stone');
    expect(gs.questProgress[questId].boss_stone).toBeUndefined();

    gs.jobId = 'fighter';
    recordKill(gs, 'boss_stone');
    expect(turnInQuest(gs, questId)).toBe(true);
    expect(gs.equipmentOwned).toContain(itemId);
    expect(gs.completedQuests).toContain(questId);
    expect(availableQuests(gs).some((quest) => quest.id === questId)).toBe(false);
  });

  it('blocks another job and automatically removes regalia when changing jobs', () => {
    const gs = new GameState();
    const itemId = jobRegaliaItemId('fighter');
    gs.jobId = 'fighter';
    gs.level = 20;
    gs.jobLevels.adventurer = 20;
    gs.addEquipment(itemId);

    expect(gs.canEquip(itemId)).toBe(true);
    gs.equip('torso', itemId);
    expect(gs.equipment.torso).toBe(itemId);
    expect(equippedJobRegaliaAppearance(gs.equipment)).toBe('fighter');

    expect(gs.changeJob('mage')).toBe(true);
    expect(gs.equipment.torso).toBeNull();
    expect(gs.canEquip(itemId)).toBe(false);
    expect(gs.equipBlock(itemId)).toBe('job');
  });

  it('keeps a mismatched regalia owned but unequipped when loading a save', () => {
    const source = new GameState();
    const itemId = jobRegaliaItemId('fighter');
    source.jobId = 'fighter';
    source.addEquipment(itemId);
    source.equip('torso', itemId);
    const save = source.toSave(0);
    save.player.jobId = 'mage';

    const loaded = new GameState();
    loaded.loadFrom(save);

    expect(loaded.equipmentOwned).toContain(itemId);
    expect(loaded.equipment.torso).toBeNull();
  });
});
