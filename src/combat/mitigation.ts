/**
 * Incoming-damage mitigation (pure, Vitest-covered). Diminishing-returns
 * curve: reduction = def / (def + K). K=90 means 90 defense halves damage,
 * so armor matters early without ever reaching immunity. Physical hits use
 * def; magical projectiles use magDef. Damage never drops below 1.
 */
export const MITIGATION_K = 90;

export function mitigateDamage(amount: number, defense: number): number {
  const d = Math.max(0, defense);
  return Math.max(1, Math.round(amount * (MITIGATION_K / (MITIGATION_K + d))));
}
