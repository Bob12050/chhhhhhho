import { describe, expect, it } from 'vitest';
import {
  INVESTIGATION_CONDITIONS,
  getInvestigationCondition,
} from '@/endgame/investigation-conditions';

describe('investigation condition definitions', () => {
  it('defines three distinct, player-readable combat rules', () => {
    expect(INVESTIGATION_CONDITIONS).toHaveLength(3);
    expect(new Set(INVESTIGATION_CONDITIONS.map((condition) => condition.id)).size).toBe(3);
    expect(new Set(INVESTIGATION_CONDITIONS.map((condition) => condition.mechanic)).size).toBe(3);

    for (const condition of INVESTIGATION_CONDITIONS) {
      expect(condition.label.length).toBeGreaterThan(3);
      expect(condition.boardHint.length).toBeGreaterThan(6);
      expect(condition.combatHint.length).toBeGreaterThan(condition.boardHint.length);
      expect(getInvestigationCondition(condition.id)).toBe(condition);
    }
  });

  it('keeps each mechanic telegraphed and meaningfully different', () => {
    const regeneration = getInvestigationCondition('regeneration');
    const frenzy = getInvestigationCondition('frenzy');
    const resonance = getInvestigationCondition('resonance');

    expect(regeneration.mechanic).toBe('regeneration');
    if (regeneration.mechanic === 'regeneration') {
      expect(regeneration.intervalMs).toBeGreaterThanOrEqual(6_000);
      expect(regeneration.healRate).toBeGreaterThan(0);
    }
    expect(frenzy.mechanic).toBe('frenzy');
    if (frenzy.mechanic === 'frenzy') {
      expect(frenzy.triggerHpRate).toBe(0.5);
      expect(frenzy.cadenceMult).toBeGreaterThan(1);
    }
    expect(resonance.mechanic).toBe('resonance');
    if (resonance.mechanic === 'resonance') {
      expect(resonance.telegraphMs).toBeGreaterThanOrEqual(1_000);
      expect(resonance.intervalMs).toBeGreaterThan(resonance.telegraphMs * 4);
      expect(resonance.radius).toBeGreaterThanOrEqual(80);
    }
  });
});
