import { mitigateDamage, MITIGATION_K } from '@/combat/mitigation';
import { allRecipes } from '@/crafting/recipes';
import { Rng } from '@/core/rng';
import { allEquipment, getEquipment, itemDisplayName, type EquipmentDef } from '@/data/items';
import { allEnemyDefs, getEnemyDef, type EnemyDef } from '@/enemies/enemy-defs';
import { EQUIP_SLOTS } from '@/equipment/slots';
import { getDropTable, type DropEntry } from '@/loot/drop-table';
import { VETERAN_MODS, concurrentSpawnCount } from '@/quests/hunt-logic';
import { allQuests, getQuest, type QuestDef } from '@/quests/quest-defs';
import { computeDerived, ZERO_BASE, type BaseStats, type DerivedStats, type StatModifiers } from '@/stats/stats';

export const DEFAULT_BALANCE_RUNS = 300;
export const BALANCE_RUN_OPTIONS = [100, 300, 1000] as const;

const BASE_ATTACK_MS = 360;
const HIT_EVERY_MS = 2500;
const DEFAULT_UPTIME = 0.35;

export type BalanceVerdict = 'comfortable' | 'tense' | 'potion' | 'wall';

export interface HuntSimulationOptions {
  questId: string;
  runs?: number;
  seed?: number;
  playerLevel?: number;
  enemyHpScale?: number;
  enemyDamageScale?: number;
  dropScale?: number;
}

export interface HuntDropResult {
  itemId: string;
  name: string;
  total: number;
  averagePerRun: number;
  runsWithDrop: number;
  noDropRate: number;
  runsPerItem: number | null;
}

export interface HuntSimulationResult {
  questId: string;
  questName: string;
  rank: number;
  playerLevel: number;
  veteran: boolean;
  targetName: string;
  runs: number;
  clears: number;
  clearRate: number;
  averageTtkSec: number;
  medianTtkSec: number;
  p90TtkSec: number;
  averageDamageTaken: number;
  danger: number;
  hitsToDie: number;
  verdict: BalanceVerdict;
  player: {
    maxHp: number;
    physAtk: number;
    defense: number;
    effectiveDps: number;
    dropBonus: number;
    gearNames: string[];
  };
  encounter: {
    enemyCount: number;
    baseTotalHp: number;
    adjustedTotalHp: number;
    baseMaxContactDamage: number;
    adjustedMaxContactDamage: number;
  };
  rewards: {
    totalGold: number;
    totalExp: number;
    averageGoldPerRun: number;
    averageExpPerRun: number;
  };
  drops: HuntDropResult[];
  target: {
    ttkSec: number;
    hitsToDie: number;
    suggestedHpScale: number;
    suggestedDamageScale: number;
  };
  notes: string[];
}

interface EncounterWave {
  enemy: EnemyDef;
  count: number;
  hp: number;
  hitDamage: number;
  pressure: number;
}

interface DropAccumulator {
  total: number;
  runsWithDrop: number;
}

const craftable = new Set(allRecipes().map((recipe) => recipe.resultItemId));
const droppable = new Set<string>();
for (const enemy of allEnemyDefs()) {
  const table = enemy.dropTableId ? getDropTable(enemy.dropTableId) : undefined;
  for (const entry of table?.entries ?? []) {
    if (getEquipment(entry.itemId)) droppable.add(entry.itemId);
  }
}

function isObtainable(equipment: EquipmentDef): boolean {
  return craftable.has(equipment.id) || droppable.has(equipment.id);
}

function gearScore(equipment: EquipmentDef): number {
  const d = equipment.derived ?? {};
  return (
    (d.physAtk ?? 0) * 1.6 +
    (d.def ?? 0) * 2 +
    (d.maxHp ?? 0) * 0.45 +
    (d.magDef ?? 0) +
    (d.evasion ?? 0) * 0.5 +
    (d.critRate ?? 0) * 40 +
    (d.atkSpeed ?? 0) * 3
  );
}

function bestSwordGear(level: number): EquipmentDef[] {
  const equipment = allEquipment();
  const picks: EquipmentDef[] = [];
  for (const slot of EQUIP_SLOTS) {
    const pool = equipment.filter(
      (entry) =>
        entry.slot === slot &&
        entry.levelRequirement <= level &&
        isObtainable(entry) &&
        (slot !== 'main_hand' || (entry.weaponTags ?? []).includes('sword')),
    );
    pool.sort((a, b) => gearScore(b) - gearScore(a));
    if (pool[0]) picks.push(pool[0]);
  }
  return picks;
}

function buildBenchmarkPlayer(level: number): { derived: DerivedStats; gear: EquipmentDef[] } {
  const points = Math.max(0, level - 1) * 3;
  const base: BaseStats = {
    ...ZERO_BASE,
    STR: 5 + Math.ceil(points / 2),
    VIT: 5 + Math.floor(points / 2),
    INT: 5,
    DEX: 5,
    LUK: 5,
  };
  const gear = bestSwordGear(level);
  const modifiers: StatModifiers[] = gear.map((entry) => ({ derived: entry.derived }));
  return { derived: computeDerived(base, modifiers), gear };
}

function clampNumber(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((sorted.length - 1) * p)] ?? 0;
}

function rankTargetTtk(rank: number): number {
  return 15 + rank * 8;
}

function rankTargetHits(rank: number): number {
  return Math.max(6, 14 - rank);
}

function verdictFor(clearRate: number, danger: number): BalanceVerdict {
  if (clearRate < 0.25 || danger > 2) return 'wall';
  if (clearRate < 0.75 || danger > 1) return 'potion';
  if (danger > 0.6) return 'tense';
  return 'comfortable';
}

function rollScaledDrop(entry: DropEntry, rng: Rng, chanceScale: number): number {
  // Always consume both rolls so multiplier comparisons remain reproducible.
  const chanceRoll = rng.next();
  const quantityRoll = rng.next();
  if (chanceRoll >= Math.min(1, Math.max(0, entry.dropRate * chanceScale))) return 0;
  return entry.min + Math.floor(quantityRoll * (entry.max - entry.min + 1));
}

function addRunDrop(runDrops: Map<string, number>, itemId: string, quantity: number): void {
  if (quantity <= 0) return;
  runDrops.set(itemId, (runDrops.get(itemId) ?? 0) + quantity);
}

function encounterWaves(
  quest: QuestDef,
  defense: number,
  hpScale: number,
  damageScale: number,
): EncounterWave[] {
  const veteranHp = quest.veteran ? VETERAN_MODS.hpMult : 1;
  const veteranDamage = quest.veteran ? VETERAN_MODS.dmgMult : 1;
  const waves: EncounterWave[] = [];
  for (const objective of quest.objectives) {
    const enemy = getEnemyDef(objective.enemyId);
    if (!enemy) continue;
    const concurrent = concurrentSpawnCount(objective.count, !!enemy.isBoss);
    waves.push({
      enemy,
      count: objective.count,
      hp: enemy.maxHp * objective.count * veteranHp * hpScale,
      hitDamage: mitigateDamage(
        Math.round(enemy.contactDamage * veteranDamage * damageScale),
        defense,
      ),
      // Packs attack more often than a solo target, but not perfectly in sync.
      pressure: enemy.isBoss ? 1 : 0.65 + concurrent * 0.35,
    });
  }
  return waves;
}

export function huntSimulationQuests(): QuestDef[] {
  return allQuests()
    .filter((quest) => !!quest.huntMap && quest.type !== 'main')
    .sort(
      (a, b) =>
        (a.rank ?? 1) - (b.rank ?? 1) ||
        (a.require?.minLevel ?? 1) - (b.require?.minLevel ?? 1) ||
        a.name.localeCompare(b.name, 'ja'),
    );
}

export function simulateHunt(options: HuntSimulationOptions): HuntSimulationResult {
  const quest = getQuest(options.questId);
  if (!quest?.huntMap) throw new Error(`Unknown hunt quest: ${options.questId}`);

  const runs = Math.round(clampNumber(options.runs, DEFAULT_BALANCE_RUNS, 1, 10_000));
  const playerLevel = Math.round(
    clampNumber(options.playerLevel, quest.require?.minLevel ?? 1, 1, 99),
  );
  const enemyHpScale = clampNumber(options.enemyHpScale, 1, 0.1, 5);
  const enemyDamageScale = clampNumber(options.enemyDamageScale, 1, 0.1, 5);
  const dropScale = clampNumber(options.dropScale, 1, 0, 5);
  const rank = quest.rank ?? 1;
  const seed = options.seed ?? (0xc0ffee ^ hashId(quest.id));
  const combatRng = new Rng(seed ^ 0x51f15e);
  const dropRng = new Rng(seed ^ 0xd09f00d);
  const { derived, gear } = buildBenchmarkPlayer(playerLevel);
  const swingsPerSec = 1000 / (BASE_ATTACK_MS / derived.atkSpeed);
  const theoreticalDps = derived.physAtk * (1 + derived.critRate * 0.6) * swingsPerSec;
  const effectiveDps = theoreticalDps * DEFAULT_UPTIME;
  const waves = encounterWaves(quest, derived.def, enemyHpScale, enemyDamageScale);

  if (waves.length === 0) throw new Error(`Hunt quest has no valid targets: ${quest.id}`);

  const candidates = new Map<string, DropAccumulator>();
  for (const wave of waves) {
    const table = wave.enemy.dropTableId ? getDropTable(wave.enemy.dropTableId) : undefined;
    for (const entry of table?.entries ?? []) {
      if (entry.dropRate > 0 && !candidates.has(entry.itemId)) {
        candidates.set(entry.itemId, { total: 0, runsWithDrop: 0 });
      }
    }
  }
  for (const itemId of Object.keys(quest.rewards.items ?? {})) {
    if (!candidates.has(itemId)) candidates.set(itemId, { total: 0, runsWithDrop: 0 });
  }

  const veteranDropBonus = quest.veteran ? VETERAN_MODS.dropBonusAdd : 0;
  const chanceScale = (1 + derived.dropRate + veteranDropBonus) * dropScale;
  const rewardMult = quest.veteran ? VETERAN_MODS.rewardMult : 1;
  const goldMult = 1 + derived.goldRate;
  const ttkSamples: number[] = [];
  let clears = 0;
  let totalDamageTaken = 0;
  let totalGold = 0;
  let totalExp = 0;

  for (let run = 0; run < runs; run++) {
    const runDps = effectiveDps * (0.84 + combatRng.next() * 0.32);
    let runTtk = 0;
    let runDamage = 0;
    for (const wave of waves) {
      const waveTtk = wave.hp / Math.max(0.01, runDps);
      runTtk += waveTtk;
      const expectedHits = (waveTtk * 1000 * wave.pressure) / HIT_EVERY_MS;
      let landedHits = Math.floor(expectedHits);
      if (combatRng.chance(expectedHits - landedHits)) landedHits++;
      const damageVariance = 0.88 + combatRng.next() * 0.24;
      runDamage += landedHits * Math.max(1, Math.round(wave.hitDamage * damageVariance));
    }
    ttkSamples.push(runTtk);
    totalDamageTaken += runDamage;
    if (runDamage >= derived.maxHp) continue;

    clears++;
    const runDrops = new Map<string, number>();
    for (const objective of quest.objectives) {
      const enemy = getEnemyDef(objective.enemyId);
      if (!enemy) continue;
      for (let kill = 0; kill < objective.count; kill++) {
        const table = enemy.dropTableId ? getDropTable(enemy.dropTableId) : undefined;
        for (const entry of table?.entries ?? []) {
          addRunDrop(runDrops, entry.itemId, rollScaledDrop(entry, dropRng, chanceScale));
        }
        totalGold += Math.round((enemy.goldReward ?? 0) * rewardMult * goldMult);
        totalExp += Math.round(enemy.expReward * rewardMult);
      }
    }
    totalGold += Math.round((quest.rewards.gold ?? 0) * goldMult);
    totalExp += quest.rewards.exp ?? 0;
    for (const [itemId, quantity] of Object.entries(quest.rewards.items ?? {})) {
      addRunDrop(runDrops, itemId, quantity);
    }
    for (const [itemId, quantity] of runDrops) {
      const accumulator = candidates.get(itemId) ?? { total: 0, runsWithDrop: 0 };
      accumulator.total += quantity;
      accumulator.runsWithDrop++;
      candidates.set(itemId, accumulator);
    }
  }

  const averageTtkSec = ttkSamples.reduce((sum, value) => sum + value, 0) / runs;
  const averageDamageTaken = totalDamageTaken / runs;
  const danger = averageDamageTaken / derived.maxHp;
  const veteranHp = quest.veteran ? VETERAN_MODS.hpMult : 1;
  const veteranDamage = quest.veteran ? VETERAN_MODS.dmgMult : 1;
  const baseTotalHp = waves.reduce((sum, wave) => sum + wave.enemy.maxHp * wave.count, 0);
  const baseMaxContactDamage = Math.max(...waves.map((wave) => wave.enemy.contactDamage));
  const adjustedMaxContactDamage = baseMaxContactDamage * veteranDamage * enemyDamageScale;
  const strongestHit = mitigateDamage(Math.round(adjustedMaxContactDamage), derived.def);
  const targetTtk = rankTargetTtk(rank);
  const targetHits = rankTargetHits(rank);
  const targetAdjustedHp = effectiveDps * targetTtk;
  const targetMitigatedHit = derived.maxHp / targetHits;
  const targetAdjustedContact = targetMitigatedHit * ((MITIGATION_K + derived.def) / MITIGATION_K);
  const suggestedHpScale = targetAdjustedHp / Math.max(1, baseTotalHp * veteranHp);
  const suggestedDamageScale = targetAdjustedContact / Math.max(1, baseMaxContactDamage * veteranDamage);
  const clearRate = clears / runs;

  const drops: HuntDropResult[] = [...candidates.entries()]
    .map(([itemId, value]) => ({
      itemId,
      name: itemDisplayName(itemId),
      total: value.total,
      averagePerRun: value.total / runs,
      runsWithDrop: value.runsWithDrop,
      noDropRate: 1 - value.runsWithDrop / runs,
      runsPerItem: value.total > 0 ? runs / value.total : null,
    }))
    .sort((a, b) => {
      if (a.runsPerItem === null) return -1;
      if (b.runsPerItem === null) return 1;
      return b.runsPerItem - a.runsPerItem || a.name.localeCompare(b.name, 'ja');
    });

  const notes: string[] = [];
  if (clearRate < 0.75) notes.push('最低Lvでは生存が不安定');
  if (averageTtkSec > targetTtk * 1.35) notes.push('目標より討伐時間が長い');
  if (averageTtkSec < targetTtk * 0.65) notes.push('目標より討伐時間が短い');
  if (drops.some((drop) => drop.runsPerItem !== null && drop.runsPerItem > 30)) {
    notes.push('30周超のレアドロップあり');
  }
  if (notes.length === 0) notes.push('大きな外れ値なし');

  return {
    questId: quest.id,
    questName: quest.name,
    rank,
    playerLevel,
    veteran: !!quest.veteran,
    targetName: waves.map((wave) => wave.enemy.name).join(' → '),
    runs,
    clears,
    clearRate,
    averageTtkSec,
    medianTtkSec: percentile(ttkSamples, 0.5),
    p90TtkSec: percentile(ttkSamples, 0.9),
    averageDamageTaken,
    danger,
    hitsToDie: Math.ceil(derived.maxHp / strongestHit),
    verdict: verdictFor(clearRate, danger),
    player: {
      maxHp: derived.maxHp,
      physAtk: derived.physAtk,
      defense: derived.def,
      effectiveDps,
      dropBonus: derived.dropRate,
      gearNames: gear.map((entry) => entry.name),
    },
    encounter: {
      enemyCount: waves.reduce((sum, wave) => sum + wave.count, 0),
      baseTotalHp,
      adjustedTotalHp: baseTotalHp * veteranHp * enemyHpScale,
      baseMaxContactDamage,
      adjustedMaxContactDamage,
    },
    rewards: {
      totalGold,
      totalExp,
      averageGoldPerRun: totalGold / runs,
      averageExpPerRun: totalExp / runs,
    },
    drops,
    target: {
      ttkSec: targetTtk,
      hitsToDie: targetHits,
      suggestedHpScale,
      suggestedDamageScale,
    },
    notes,
  };
}
