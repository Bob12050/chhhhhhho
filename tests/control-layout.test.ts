import { describe, expect, it } from 'vitest';
import { buildControlLayout } from '@/input/control-layout';

describe('mobile control layout', () => {
  it('mirrors the combat cluster and stick for left-handed play', () => {
    const rightHanded = buildControlLayout(360, 720, 20, { left: 0, right: 0 }, 1, false);
    const leftHanded = buildControlLayout(360, 720, 20, { left: 0, right: 0 }, 1, true);

    expect(rightHanded.attack.x + leftHanded.attack.x).toBe(360);
    expect(rightHanded.skill1.x + leftHanded.skill1.x).toBe(360);
    expect(rightHanded.potion.x + leftHanded.potion.x).toBe(360);
    expect(rightHanded.stickZone.x).toBe(0);
    expect(leftHanded.stickZone.x).toBe(180);
    expect(rightHanded.stickStandby.x + leftHanded.stickStandby.x).toBe(360);
  });

  it('keeps larger controls inside the phone playfield', () => {
    const layout = buildControlLayout(360, 640, 20, { left: 0, right: 0 }, 1.12, false);
    for (const point of [layout.attack, layout.skill1, layout.skill2, layout.dodge, layout.potion]) {
      expect(point.x).toBeGreaterThanOrEqual(24);
      expect(point.x).toBeLessThanOrEqual(336);
      expect(point.y).toBeGreaterThanOrEqual(24);
      expect(point.y).toBeLessThanOrEqual(616);
    }
  });
});
