import type { InvestigationConditionId } from '@/quests/quest-defs';

interface InvestigationConditionBase {
  id: InvestigationConditionId;
  label: string;
  boardHint: string;
  combatHint: string;
  hpRate: number;
  damageRate: number;
}

export type InvestigationConditionDef =
  | InvestigationConditionBase & {
      mechanic: 'regeneration';
      intervalMs: number;
      healRate: number;
    }
  | InvestigationConditionBase & {
      mechanic: 'frenzy';
      triggerHpRate: number;
      cadenceMult: number;
      moveSpeedMult: number;
    }
  | InvestigationConditionBase & {
      mechanic: 'resonance';
      initialDelayMs: number;
      intervalMs: number;
      telegraphMs: number;
      radius: number;
      damageMult: number;
      simulatedHitRate: number;
    };

export const INVESTIGATION_CONDITIONS: readonly InvestigationConditionDef[] = [
  {
    id: 'regeneration',
    label: '生命反応増大',
    boardHint: '8秒ごとにHP2%回復',
    combatHint: '8秒ごとに最大HPの2%を回復',
    mechanic: 'regeneration',
    hpRate: 0.94,
    damageRate: 1,
    intervalMs: 8_000,
    healRate: 0.02,
  },
  {
    id: 'frenzy',
    label: '攻撃性増大',
    boardHint: 'HP50%以下で攻撃加速',
    combatHint: 'HP50%以下で攻撃間隔と移動速度が上昇',
    mechanic: 'frenzy',
    hpRate: 1,
    damageRate: 0.96,
    triggerHpRate: 0.5,
    cadenceMult: 1.22,
    moveSpeedMult: 1.4,
  },
  {
    id: 'resonance',
    label: '深層共鳴',
    boardHint: '9秒ごとに共鳴波',
    combatHint: '9秒ごとにボス中心の共鳴波が発生',
    mechanic: 'resonance',
    hpRate: 1,
    damageRate: 1,
    initialDelayMs: 6_500,
    intervalMs: 9_000,
    telegraphMs: 1_300,
    radius: 96,
    damageMult: 0.8,
    simulatedHitRate: 0.35,
  },
] as const;

const CONDITIONS_BY_ID = new Map(
  INVESTIGATION_CONDITIONS.map((condition) => [condition.id, condition]),
);

export function getInvestigationCondition(
  id: InvestigationConditionId,
): InvestigationConditionDef {
  return CONDITIONS_BY_ID.get(id) ?? INVESTIGATION_CONDITIONS[0];
}
