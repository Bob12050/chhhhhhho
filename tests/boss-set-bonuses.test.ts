import { describe, expect, it } from 'vitest';
import {
  activeBossSetCombat,
  activeBossSetStates,
  allBossSetBonuses,
} from '@/equipment/boss-set-bonuses';
import { getEquipment } from '@/data/items';
import { GameState } from '@/player/game-state';
import { computeDerived } from '@/stats/stats';
import { getJob } from '@/jobs/job-defs';

function equipSkoll(gs: GameState, pieces: number): void {
  const ids = ['skoll_blade', 'skoll_greaves', 'skoll_coil', 'skoll_helm'];
  const slots = ['main_hand', 'feet', 'waist', 'head'] as const;
  for (let index = 0; index < pieces; index++) {
    gs.equipment[slots[index]] = ids[index];
    if (!gs.equipmentOwned.includes(ids[index])) gs.equipmentOwned.push(ids[index]);
  }
  gs.recompute(false);
}

describe('boss equipment set bonuses', () => {
  it('defines one four-piece set for every boss rare-material family', () => {
    const sets = allBossSetBonuses();
    expect(sets).toHaveLength(17);
    expect(new Set(sets.map((set) => set.rareMaterialId)).size).toBe(17);
    for (const set of sets) {
      expect(set.maxPieces).toBe(4);
      expect(set.bonuses.map((bonus) => bonus.pieces).sort()).toEqual([2, 4]);
    }
  });

  it('activates the two-piece tier without leaking the four-piece tier', () => {
    const base = new GameState();
    equipSkoll(base, 2);
    const job = getJob(base.jobId)!;
    const equipmentOnly = computeDerived(
      base.base,
      [
        { base: job.baseStatModifiers },
        { derived: job.derivedModifiers },
        ...['skoll_blade', 'skoll_greaves'].map((id) => ({
          derived: getEquipment(id)!.derived,
        })),
      ],
    );

    expect(base.derived.atkSpeed).toBeCloseTo(equipmentOnly.atkSpeed + 0.15);
    expect(base.derived.critRate).toBeCloseTo(equipmentOnly.critRate + 0.05);
    expect(activeBossSetCombat(base.equipment).onHit).toHaveLength(0);
    const state = activeBossSetStates(base.equipment).find((entry) => entry.set.id === 'skoll');
    expect(state?.count).toBe(2);
    expect(state?.activeBonuses.map((bonus) => bonus.pieces)).toEqual([2]);
  });

  it('activates both tiers and exposes the Skoll thunder follow-up', () => {
    const gs = new GameState();
    equipSkoll(gs, 4);

    const combat = activeBossSetCombat(gs.equipment);
    expect(combat.onHit).toEqual([
      expect.objectContaining({
        setId: 'skoll',
        chance: 0.28,
        power: 0.55,
        element: 'thunder',
      }),
    ]);
    const equipmentOnly = computeDerived(
      gs.base,
      ['skoll_blade', 'skoll_greaves', 'skoll_coil', 'skoll_helm'].map((id) => ({
        derived: getEquipment(id)!.derived,
      })),
    );
    expect(gs.derived.moveSpeed).toBe(equipmentOnly.moveSpeed + 4);
    const state = activeBossSetStates(gs.equipment).find((entry) => entry.set.id === 'skoll');
    expect(state?.count).toBe(4);
    expect(state?.activeBonuses.map((bonus) => bonus.pieces)).toEqual([2, 4]);
  });

  it('counts only the equipped alternative weapon in a set', () => {
    const gs = new GameState();
    gs.equipment.main_hand = 'garo_shield';
    gs.equipment.torso = 'garo_plate';
    gs.equipment.head = 'garo_helm';
    gs.equipment.feet = 'garo_greaves';
    gs.recompute(false);

    const state = activeBossSetStates(gs.equipment).find((entry) => entry.set.id === 'garo');
    expect(state?.count).toBe(4);
    expect(activeBossSetCombat(gs.equipment).damageReduction).toBeCloseTo(0.15);
  });

  it('restores set effects from equipped ids after save and load', () => {
    const source = new GameState();
    equipSkoll(source, 4);
    const loaded = new GameState();
    loaded.loadFrom(source.toSave(0));

    expect(loaded.equipment.head).toBe('skoll_helm');
    expect(activeBossSetStates(loaded.equipment).find((entry) => entry.set.id === 'skoll')?.count).toBe(4);
    expect(activeBossSetCombat(loaded.equipment).onHit[0]?.element).toBe('thunder');
  });
});
