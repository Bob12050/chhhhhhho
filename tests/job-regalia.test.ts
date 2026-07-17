import { describe, expect, it } from 'vitest';
import { allEquipment, getEquipment } from '@/data/items';
import { huntSimulationQuests } from '@/balance/hunt-simulator';
import { equippedJobRegaliaProgress } from '@/equipment/job-regalia-appearance';
import { allJobs } from '@/jobs/job-defs';
import {
  JOB_REGALIA,
  jobRegaliaItemId,
  jobRegaliaItemIds,
  jobRegaliaQuestId,
} from '@/jobs/job-regalia';
import { GameState } from '@/player/game-state';
import { allQuests, getQuest } from '@/quests/quest-defs';
import { acceptQuest, availableQuests, recordKill, turnInQuest } from '@/quests/quests';

describe('job regalia', () => {
  it('provides a three-piece exact-job set and one trial for every authored job look', () => {
    const appearanceJobs = allJobs().filter((job) => job.appearance);
    expect(JOB_REGALIA).toHaveLength(appearanceJobs.length);

    for (const job of appearanceJobs) {
      const ids = jobRegaliaItemIds(job.id);
      const questId = jobRegaliaQuestId(job.id);
      const pieces = {
        head: getEquipment(ids.head),
        torso: getEquipment(ids.torso),
        weapon: getEquipment(ids.weapon),
      };
      const quest = getQuest(questId);
      const record = JOB_REGALIA.find((entry) => entry.jobId === job.id)!;

      expect(pieces.head?.slot, ids.head).toBe('head');
      expect(pieces.torso?.slot, ids.torso).toBe('torso');
      expect(pieces.weapon?.slot, ids.weapon).toBe('main_hand');
      for (const [part, item] of Object.entries(pieces)) {
        expect(item?.appearance, `${job.id}:${part}`).toBe(job.appearance);
        expect(item?.jobRequirements, `${job.id}:${part}`).toEqual([job.id]);
        expect(item?.sellPrice, `${job.id}:${part}`).toBe(0);
      }
      expect(job.equippableWeaponTags).toContain(pieces.weapon?.weaponTags?.[0]);
      for (const [key, total] of Object.entries(record.derived)) {
        const sum = Object.values(pieces).reduce(
          (value, item) => value + ((item?.derived as Record<string, number> | undefined)?.[key] ?? 0),
          0,
        );
        expect(sum, `${job.id}:${key}`).toBeCloseTo(total, 6);
      }
      expect(quest?.repeatable, questId).not.toBe(true);
      expect(quest?.require?.jobId, questId).toBe(job.id);
      expect(quest?.require?.minLevel, questId).toBe(pieces.torso?.levelRequirement);
      expect(quest?.huntMap, questId).toBeTruthy();
      expect(quest?.rewards.items, questId).toEqual({
        [ids.head]: 1,
        [ids.torso]: 1,
        [ids.weapon]: 1,
      });
    }

    expect(allEquipment().filter((item) => item.id.startsWith('job_regalia_'))).toHaveLength(60);
    expect(new Set(allEquipment().map((item) => item.id)).size).toBe(allEquipment().length);
    expect(new Set(allQuests().map((quest) => quest.id)).size).toBe(allQuests().length);
    expect(huntSimulationQuests().every((quest) => !quest.require?.jobId)).toBe(true);
  });

  it('offers and progresses a class trial only while its exact job is active', () => {
    const gs = new GameState();
    const questId = jobRegaliaQuestId('fighter');
    const ids = jobRegaliaItemIds('fighter');

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
    expect(gs.equipmentOwned).toEqual(expect.arrayContaining(Object.values(ids)));
    expect(gs.completedQuests).toContain(questId);
    expect(availableQuests(gs).some((quest) => quest.id === questId)).toBe(false);
  });

  it('tracks set completeness and removes all pieces on job change', () => {
    const gs = new GameState();
    const ids = jobRegaliaItemIds('fighter');
    gs.jobId = 'fighter';
    gs.level = 20;
    gs.jobLevels.adventurer = 20;
    for (const id of Object.values(ids)) gs.addEquipment(id);

    expect(gs.canEquip(ids.torso)).toBe(true);
    gs.equip('head', ids.head);
    gs.equip('torso', ids.torso);
    expect(equippedJobRegaliaProgress(gs.equipment)).toMatchObject({ count: 2, complete: false });
    gs.equip('main_hand', ids.weapon);
    expect(equippedJobRegaliaProgress(gs.equipment)).toEqual({
      appearance: 'fighter',
      count: 3,
      complete: true,
    });

    expect(gs.changeJob('mage')).toBe(true);
    expect(gs.equipment.head).toBeNull();
    expect(gs.equipment.torso).toBeNull();
    expect(gs.equipment.main_hand).toBeNull();
    expect(gs.canEquip(ids.torso)).toBe(false);
    expect(gs.equipBlock(ids.torso)).toBe('job');
  });

  it('keeps a mismatched regalia owned but unequipped when loading a save', () => {
    const source = new GameState();
    const ids = jobRegaliaItemIds('fighter');
    source.jobId = 'fighter';
    for (const id of Object.values(ids)) source.addEquipment(id);
    source.equip('head', ids.head);
    source.equip('torso', ids.torso);
    source.equip('main_hand', ids.weapon);
    const save = source.toSave(0);
    save.player.jobId = 'mage';

    const loaded = new GameState();
    loaded.loadFrom(save);

    expect(loaded.equipmentOwned).toEqual(expect.arrayContaining(Object.values(ids)));
    expect(loaded.equipment.head).toBeNull();
    expect(loaded.equipment.torso).toBeNull();
    expect(loaded.equipment.main_hand).toBeNull();
  });

  it('backfills the two new pieces for saves that already cleared the old trial', () => {
    const ids = jobRegaliaItemIds('fighter');
    const source = new GameState();
    source.jobId = 'fighter';
    source.addEquipment(jobRegaliaItemId('fighter'));
    source.completedQuests.push(jobRegaliaQuestId('fighter'));

    const loaded = new GameState();
    loaded.loadFrom(source.toSave(0));

    expect(loaded.equipmentOwned).toEqual(expect.arrayContaining(Object.values(ids)));
  });
});
