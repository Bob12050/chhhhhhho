export interface JobTierColors {
  text: string;
  accent: number;
  border: number;
}

const JOB_TIER_COLORS: readonly JobTierColors[] = [
  { text: '#ffffff', accent: 0xffffff, border: 0xd7deea },
  { text: '#63c7ff', accent: 0x38aef0, border: 0x3f91d4 },
  { text: '#df75ff', accent: 0xd05cff, border: 0xb94fdf },
  { text: '#b28cff', accent: 0x7545c8, border: 0x6940ad },
  { text: '#ff747d', accent: 0xf0444f, border: 0xc93a46 },
];

export function jobTierColors(tier: number): JobTierColors {
  const index = Math.max(0, Math.min(JOB_TIER_COLORS.length - 1, Math.trunc(tier)));
  return JOB_TIER_COLORS[index];
}
