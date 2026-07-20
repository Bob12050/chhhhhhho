import { describe, expect, it } from 'vitest';
import { jobTierColors } from '@/ui/job-tier-colors';

describe('job tier plate colors', () => {
  it('uses the requested progression colors from adventurer through fourth jobs', () => {
    expect([0, 1, 2, 3, 4].map((tier) => jobTierColors(tier).text)).toEqual([
      '#ffffff',
      '#63c7ff',
      '#df75ff',
      '#b28cff',
      '#ff747d',
    ]);
  });

  it('keeps unexpected tiers inside the supported palette', () => {
    expect(jobTierColors(-1)).toEqual(jobTierColors(0));
    expect(jobTierColors(99)).toEqual(jobTierColors(4));
  });
});
