/**
 * Incoming-damage mitigation (pure, Vitest-covered). Diminishing-returns
 * curve: reduction = def / (def + K). K=900 leaves room for the full R1-R10
 * armour curve without letting late-game defence approach immunity. Physical hits use
 * def; magical projectiles use magDef. Damage never drops below 1.
 */
export const MITIGATION_K = 900;

export function mitigateDamage(amount: number, defense: number): number {
  const d = Math.max(0, defense);
  return Math.max(1, Math.round(amount * (MITIGATION_K / (MITIGATION_K + d))));
}
