import { describe, it, expect } from 'vitest';
import { GameState } from '@/player/game-state';
import { createDefaultSave, migrate } from '@/save/schema';
import { craft } from '@/crafting/crafting';
import { getRecipe } from '@/crafting/recipes';

/**
 * Headless 18-step walkthrough (the data/progression backbone). The scene-only
 * steps (movement, hitting enemies, map transitions) are covered on device;
 * here we drive the systems directly and assert everything survives a reload.
 */
describe('Phase 1 walkthrough (headless)', () => {
  it('progresses through the loop and persists across reload', () => {
    const gs = new GameState();
    gs.loadFrom(createDefaultSave(0)); // new game

    // Level up (defeat enemies) -> stat + skill points.
    gs.gainExp(100000);
    expect(gs.level).toBeGreaterThanOrEqual(3);
    expect(gs.statPoints).toBeGreaterThan(0);
    expect(gs.skillPoints).toBeGreaterThan(0);

    // Allocate STR.
    const str0 = gs.base.STR;
    gs.allocateStat('STR', 1);
    expect(gs.base.STR).toBe(str0 + 1);

    // Learn a skill.
    expect(gs.learnSkill('toughness')).toBe(true);

    // Gather materials + craft.
    gs.addMaterial('herb', 5);
    gs.addMaterial('slime_jelly', 5);
    expect(craft(gs, getRecipe('craft_potion_hp_l')!)).toBe(true);
    expect(gs.consumables['potion_hp_l']).toBeGreaterThan(0);

    // Equip from owned (starter cloth_vest) -> visual + stats change flag.
    gs.equip('torso', 'cloth_vest');
    expect(gs.equipment.torso).toBe('cloth_vest');
    expect(gs.flags['equipped_any']).toBe(true);

    // Pet companion.
    gs.obtainPetItem('pet_egg_slime');
    expect(gs.activePetId).toBe('slime_pet');

    // Defeat boss (flag) -> enables job change requirement chain.
    gs.flags['boss_treant_defeated'] = true;

    // Change job.
    expect(gs.changeJob('warrior')).toBe(true);
    expect(gs.jobId).toBe('warrior');

    // Save -> reload.
    const reloaded = new GameState();
    reloaded.loadFrom(migrate(JSON.parse(JSON.stringify(gs.toSave(0))), 0));

    // All state preserved.
    expect(reloaded.level).toBe(gs.level);
    expect(reloaded.base.STR).toBe(gs.base.STR);
    expect(reloaded.skills.toughness).toBe(1);
    expect(reloaded.consumables['potion_hp_l']).toBe(gs.consumables['potion_hp_l']);
    expect(reloaded.equipment.torso).toBe('cloth_vest');
    expect(reloaded.activePetId).toBe('slime_pet');
    expect(reloaded.jobId).toBe('warrior');
    expect(reloaded.flags['boss_treant_defeated']).toBe(true);
    expect(reloaded.derived.physAtk).toBe(gs.derived.physAtk);
  });
});
