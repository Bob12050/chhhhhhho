import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { allQuests, getQuest } from '@/quests/quest-defs';
import { acceptQuest, availableQuests, recordKill, turnInQuest } from '@/quests/quests';

const MAIN = allQuests()
  .filter((q) => q.type === 'main')
  .map((q) => q.id)
  .sort();

describe('main story line', () => {
  it('has 14 chapters, all non-repeatable with a hunt arena', () => {
    expect(MAIN).toHaveLength(14);
    for (const id of MAIN) {
      const q = getQuest(id)!;
      expect(q.repeatable, id).toBeFalsy();
      expect(q.huntMap, id).toBeTruthy();
    }
  });

  it('chapters unlock strictly in order and finish with the ending flag', () => {
    const gs = new GameState();
    gs.level = 99;
    const chain = [
      'main_01_stirring', 'main_02_guardian', 'main_03_warning', 'main_04_twinflame',
      'main_05_dragon', 'main_10_venom', 'main_11_earthfang', 'main_06_queen',
      'main_12_quicksand', 'main_07_knight', 'main_13_furnace', 'main_08_abyss',
      'main_14_sacred', 'main_09_finale',
    ];
    for (let i = 0; i < chain.length; i++) {
      const avail = availableQuests(gs).filter((q) => q.type === 'main').map((q) => q.id);
      // Only the current chapter is offered — later ones stay locked.
      expect(avail).toEqual([chain[i]]);
      expect(acceptQuest(gs, chain[i])).toBe(true);
      const q = getQuest(chain[i])!;
      for (const o of q.objectives) for (let k = 0; k < o.count; k++) recordKill(gs, o.enemyId);
      expect(turnInQuest(gs, chain[i])).toBe(true);
    }
    expect(gs.flags['main_story_complete']).toBe(true);
    // 勇者の証 granted by the finale.
    expect(gs.equipmentOwned).toContain('hero_emblem');
    // Story quests never re-offer.
    expect(availableQuests(gs).filter((q) => q.type === 'main')).toHaveLength(0);
  });
});
