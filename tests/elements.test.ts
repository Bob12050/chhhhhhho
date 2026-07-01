import { describe, it, expect } from 'vitest';
import {
  ELEMENTS,
  ELEMENT_LABEL,
  ELEMENT_COLOR,
  STATUS_LABEL,
  STATUS_CATEGORY,
  STATUS_COLOR,
  elementMultiplier,
  statusFromElement,
  isElement,
  type Element,
  type StatusType,
} from '@/combat/elements';
import { allEnemyDefs } from '@/enemies/enemy-defs';
import { allSkills } from '@/skills/skill-defs';
import { allEquipment } from '@/data/items';

describe('elementMultiplier', () => {
  it('weakness → ×1.5, resist → ×0.5, neither → ×1', () => {
    expect(elementMultiplier('fire', 'fire', undefined)).toBe(1.5);
    expect(elementMultiplier('fire', undefined, 'fire')).toBe(0.5);
    expect(elementMultiplier('fire', 'ice', 'dark')).toBe(1);
    expect(elementMultiplier('fire', null, null)).toBe(1);
  });

  it('non-elemental (none) attacks are never scaled', () => {
    expect(elementMultiplier('none', 'fire', 'ice')).toBe(1);
    // Even if a target somehow lists 'none' as weakness, a none attack stays neutral.
    expect(elementMultiplier('none', 'none', undefined)).toBe(1);
  });
});

describe('statusFromElement', () => {
  it('maps status-bearing elements and returns null otherwise', () => {
    expect(statusFromElement('fire')).toBe('burn');
    expect(statusFromElement('ice')).toBe('freeze');
    expect(statusFromElement('thunder')).toBe('paralyze');
    expect(statusFromElement('poison')).toBe('poison');
    expect(statusFromElement('holy')).toBeNull();
    expect(statusFromElement('dark')).toBeNull();
    expect(statusFromElement('none')).toBeNull();
  });
});

describe('lookup tables are total', () => {
  it('every element has a label and color', () => {
    for (const el of ELEMENTS) {
      expect(ELEMENT_LABEL[el], el).toBeTruthy();
      expect(typeof ELEMENT_COLOR[el], el).toBe('number');
    }
  });

  it('every status has label/category/color', () => {
    const statuses: StatusType[] = ['burn', 'poison', 'freeze', 'paralyze'];
    for (const s of statuses) {
      expect(STATUS_LABEL[s], s).toBeTruthy();
      expect(['dot', 'stun']).toContain(STATUS_CATEGORY[s]);
      expect(typeof STATUS_COLOR[s], s).toBe('number');
    }
  });

  it('isElement guards correctly', () => {
    expect(isElement('fire')).toBe(true);
    expect(isElement('none')).toBe(true);
    expect(isElement('plasma')).toBe(false);
    expect(isElement(42)).toBe(false);
    expect(isElement(undefined)).toBe(false);
  });
});

describe('data references only valid elements', () => {
  const valid = new Set<string>(ELEMENTS);

  it('enemy weakness/resist are known elements and not "none"', () => {
    for (const e of allEnemyDefs()) {
      if (e.weakness !== undefined) {
        expect(valid.has(e.weakness), `${e.id} weakness`).toBe(true);
        expect(e.weakness, `${e.id} weakness`).not.toBe('none');
      }
      if (e.resist !== undefined) {
        expect(valid.has(e.resist), `${e.id} resist`).toBe(true);
        expect(e.resist, `${e.id} resist`).not.toBe('none');
      }
    }
  });

  it('at least one boss carries a weakness (so elements matter in hunts)', () => {
    const weakBosses = allEnemyDefs().filter((e) => e.isBoss && e.weakness);
    expect(weakBosses.length).toBeGreaterThanOrEqual(3);
  });

  it('skill elements are valid and only on active skills', () => {
    for (const s of allSkills()) {
      const el = (s as { element?: string }).element;
      if (el !== undefined) {
        expect(valid.has(el), `${s.id} element`).toBe(true);
        expect(s.type, `${s.id}`).toBe('active');
      }
    }
  });

  it('weapon elements are valid; armour never carries an offensive element', () => {
    for (const e of allEquipment()) {
      const el = e.element as Element | undefined;
      if (el !== undefined) {
        expect(valid.has(el), `${e.id} element`).toBe(true);
        if (el !== 'none') expect(e.slot, `${e.id}`).toBe('main_hand');
      }
    }
  });

  it('ships at least one weapon per status-bearing element', () => {
    const weaponEls = new Set(
      allEquipment()
        .filter((e) => e.slot === 'main_hand' && e.element && e.element !== 'none')
        .map((e) => e.element),
    );
    for (const el of ['fire', 'ice', 'thunder', 'poison'] as const) {
      expect(weaponEls.has(el), `weapon with ${el}`).toBe(true);
    }
  });
});
