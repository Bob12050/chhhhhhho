import { describe, expect, it } from 'vitest';
import { buildJobTreeVerticalLayout } from '@/jobs/job-tree-layout';

describe('job tree vertical layout', () => {
  it('keeps the fifth job row above the footer on the shortest supported screen', () => {
    const viewBottom = 640 - 64;
    const layout = buildJobTreeVerticalLayout(viewBottom);
    const fifthCardBottom = layout.firstRowY + layout.rowGap * 4 + layout.cardHeight / 2;

    expect(fifthCardBottom + 4).toBeLessThanOrEqual(viewBottom);
    expect(layout.rowGap - layout.cardHeight).toBeGreaterThanOrEqual(6);
  });

  it('retains full-size cards when a taller screen has room', () => {
    const layout = buildJobTreeVerticalLayout(800 - 64);

    expect(layout.cardHeight).toBe(74);
    expect(layout.rowGap).toBe(92);
  });
});
