import { mitigateDamage, MITIGATION_K } from '@/combat/mitigation';
import { allRecipes } from '@/crafting/recipes';
import { getBossRareExchangeForDropTable } from '@/crafting/boss-rare-exchange';
import { Rng } from '@/core/rng';
import { allEquipment, itemDisplayName, type EquipmentDef } from '@/data/items';
import { getEnemyDef, type EnemyDef } from '@/enemies/enemy-defs';
import { EQUIP_SLOTS } from '@/equipment/slots';
import { getDropTable, type DropEntry } from '@/loot/drop-table';
import {
  VETERAN_MODS,
  concurrentSpawnCount,
  huntStatModifiers,
} from '@/quests/hunt-logic';
import { allQuests, getQuest, type QuestDef } from '@/quests/quest-defs';
import { computeDerived, ZERO_BASE, type BaseStats, type DerivedStats, type StatModifiers } from '@/stats/stats';

export const DEFAULT_BALANCE_RUNS = 300;
export const BALANCE_RUN_OPTIONS = [100, 300, 1000] as const;

const BASE_ATTACK_MS = 360;
const HIT_EVERY_MS = 2500;
const DEFAULT_UPTIME = 0.35;

export type BalanceVerdict = 'comfortable' | 'tense' | 'potion' | 'wall';
export type HuntEncounterKind = 'mob' | 'boss' | 'prelude' | 'multiBoss';

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
    gearIds: string[];
    gearNames: string[];
  };
  encounter: {
    kind: HuntEncounterKind;
    enemyCount: number;
    bossCount: number;
    mobCount: number;
    transitionSec: number;
    averageCombatTtkSec: number;
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

export type HuntDiagnosticStatus = 'good' | 'watch' | 'adjust' | 'critical';

export interface HuntDiagnostic {
  result: HuntSimulationResult;
  status: HuntDiagnosticStatus;
  score: number;
  ttkRatio: number;
  rarestRunsPerItem: number | null;
  issue: string;
}

export interface HuntBatchSimulationResult {
  runsPerQuest: number;
  totalAttempts: number;
  entries: HuntDiagnostic[];
  counts: Record<HuntDiagnosticStatus, number>;
}

export interface HuntBatchSimulationOptions {
  runs?: number;
  seed?: number;
}

interface EncounterWave {
  enemy: EnemyDef;
  count: number;
  hp: number;
  hitDamage: number;
  pressure: number;
}

interface EncounterProfile {
  kind: HuntEncounterKind;
  bossCount: number;
  mobCount: number;
  transitionSec: number;
}

interface DropAccumulator {
  total: number;
  runsWithDrop: number;
}

const recipes = allRecipes();
const recipeResults = new Set(recipes.map((recipe) => recipe.resultItemId));
const sourceLevelByItem = new Map<string, number>();
const quests = allQuests();
const questLevelById = new Map(
  quests.map((quest) => [quest.id, quest.require?.minLevel ?? 1]),
);

// A quest cannot provide materials before its prerequisite is itself reachable.
for (let pass = 0; pass < quests.length; pass++) {
  let changed = false;
  for (const quest of quests) {
    const prerequisite = quest.require?.questDone
      ? questLevelById.get(quest.require.questDone)
      : undefined;
    if (prerequisite === undefined) continue;
    const current = questLevelById.get(quest.id) ?? 1;
    const next = Math.max(current, prerequisite);
    if (next === current) continue;
    questLevelById.set(quest.id, next);
    changed = true;
  }
  if (!changed) break;
}

function recordItemSource(itemId: string, level: number): void {
  const current = sourceLevelByItem.get(itemId);
  if (current === undefined || level < current) sourceLevelByItem.set(itemId, level);
}

for (const quest of quests) {
  const sourceLevel = questLevelById.get(quest.id) ?? 1;
  for (const itemId of Object.keys(quest.rewards.items ?? {})) {
    recordItemSource(itemId, sourceLevel);
  }
  for (const objective of quest.objectives) {
    const enemy = getEnemyDef(objective.enemyId);
    const table = enemy?.dropTableId ? getDropTable(enemy.dropTableId) : undefined;
    for (const entry of table?.entries ?? []) {
      if (entry.dropRate > 0 || entry.bossFirstGuaranteed) {
        recordItemSource(entry.itemId, sourceLevel);
      }
    }
  }
}

// Resolve crafting chains. Unknown raw materials are treated as starter-world
// resources; known boss materials retain the earliest quest level that yields them.
for (let pass = 0; pass <= recipes.length; pass++) {
  let changed = false;
  for (const recipe of recipes) {
    const ingredients = [
      ...Object.keys(recipe.materials),
      ...(recipe.consumeEquipment ?? []),
    ];
    let sourceLevel = 1;
    let resolved = true;
    for (const itemId of ingredients) {
      const knownLevel = sourceLevelByItem.get(itemId);
      if (knownLevel !== undefined) {
        sourceLevel = Math.max(sourceLevel, knownLevel);
      } else if (recipeResults.has(itemId)) {
        resolved = false;
        break;
      }
    }
    if (!resolved) continue;
    const current = sourceLevelByItem.get(recipe.resultItemId);
    if (current !== undefined && current <= sourceLevel) continue;
    sourceLevelByItem.set(recipe.resultItemId, sourceLevel);
    changed = true;
  }
  if (!changed) break;
}

function isObtainableAtLevel(equipment: EquipmentDef, level: number): boolean {
  const sourceLevel = sourceLevelByItem.get(equipment.id);
  return sourceLevel !== undefined && sourceLevel <= level;
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
        isObtainableAtLevel(entry, level) &&
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

function encounterProfile(waves: readonly EncounterWave[]): EncounterProfile {
  const bossCount = waves.reduce(
    (sum, wave) => sum + (wave.enemy.isBoss ? wave.count : 0),
    0,
  );
  const mobCount = waves.reduce(
    (sum, wave) => sum + (wave.enemy.isBoss ? 0 : wave.count),
    0,
  );
  const kind: HuntEncounterKind = bossCount === 0
    ? 'mob'
    : bossCount > 1
      ? 'multiBoss'
      : mobCount > 0
        ? 'prelude'
        : 'boss';
  const objectiveTransitions = Math.max(0, waves.length - 1) * 0.9;
  const packRefills = waves.reduce((seconds, wave) => {
    if (wave.enemy.isBoss) return seconds;
    const batchSize = concurrentSpawnCount(wave.count, false);
    return seconds + Math.max(0, Math.ceil(wave.count / batchSize) - 1) * 0.45;
  }, 0);
  return { kind, bossCount, mobCount, transitionSec: objectiveTransitions + packRefills };
}

function encounterTargetTtk(rank: number, profile: EncounterProfile): number {
  if (profile.kind === 'mob') {
    return Math.round(4 + rank + profile.mobCount * 0.5 + profile.transitionSec);
  }
  const bossTarget = rankTargetTtk(rank);
  const mobPrelude = Math.min(10, profile.mobCount * 0.75);
  if (profile.kind === 'multiBoss') {
    return Math.round(
      bossTarget * (1 + Math.max(0, profile.bossCount - 1) * 0.4) +
      mobPrelude +
      profile.transitionSec,
    );
  }
  if (profile.kind === 'prelude') {
    return Math.round(bossTarget + mobPrelude + profile.transitionSec);
  }
  return bossTarget;
}

function ttkTolerance(kind: HuntEncounterKind): { min: number; max: number } {
  return kind === 'mob' ? { min: 0.5, max: 1.6 } : { min: 0.65, max: 1.35 };
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

function diagnosticFor(result: HuntSimulationResult): HuntDiagnostic {
  const ttkRatio = result.averageTtkSec / Math.max(0.01, result.target.ttkSec);
  const tolerance = ttkTolerance(result.encounter.kind);
  const rarestRunsPerItem = result.drops.reduce<number | null>((rarest, drop) => {
    if (drop.runsPerItem === null) return rarest;
    return rarest === null ? drop.runsPerItem : Math.max(rarest, drop.runsPerItem);
  }, null);
  let score = 0;
  if (result.verdict === 'wall') score += 80;
  else if (result.verdict === 'potion') score += 45;
  else if (result.verdict === 'tense') score += 10;
  if (result.clearRate < 0.75) score += Math.round((0.75 - result.clearRate) * 90);
  if (ttkRatio > tolerance.max || ttkRatio < tolerance.min) {
    score += Math.min(70, Math.round(Math.abs(Math.log(ttkRatio)) * 32));
  }
  if (rarestRunsPerItem !== null) {
    score += Math.min(30, Math.max(0, Math.round((rarestRunsPerItem - 30) / 2)));
  }

  const status: HuntDiagnosticStatus = score >= 80
    ? 'critical'
    : score >= 40
      ? 'adjust'
      : score >= 20
        ? 'watch'
        : 'good';
  let issue = '基準内';
  if (result.clearRate < 0.5) issue = `クリア率が低い (${Math.round(result.clearRate * 100)}%)`;
  else if (result.danger > 2) issue = `生存困難 (危険度${result.danger.toFixed(2)})`;
  else if (ttkRatio > tolerance.max) issue = `討伐が長い (目標の${Math.round(ttkRatio * 100)}%)`;
  else if (ttkRatio < tolerance.min) issue = `討伐が短い (目標の${Math.round(ttkRatio * 100)}%)`;
  else if (rarestRunsPerItem !== null && rarestRunsPerItem > 30) {
    issue = `レアが渋い (最長${Math.round(rarestRunsPerItem)}周)`;
  } else if (result.clearRate < 0.75) issue = `クリアが不安定 (${Math.round(result.clearRate * 100)}%)`;
  else if (result.danger > 0.6) issue = `被弾余裕を確認 (危険度${result.danger.toFixed(2)})`;

  return { result, status, score, ttkRatio, rarestRunsPerItem, issue };
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
  const modifiers = huntStatModifiers(quest);
  const waves: EncounterWave[] = [];
  for (const objective of quest.objectives) {
    const enemy = getEnemyDef(objective.enemyId);
    if (!enemy) continue;
    const concurrent = concurrentSpawnCount(objective.count, !!enemy.isBoss);
    waves.push({
      enemy,
      count: objective.count,
      hp: enemy.maxHp * objective.count * modifiers.hpMult * hpScale,
      hitDamage: mitigateDamage(
        Math.round(enemy.contactDamage * modifiers.dmgMult * damageScale),
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
  const profile = encounterProfile(waves);
  const combatModifiers = huntStatModifiers(quest);

  const candidates = new Map<string, DropAccumulator>();
  for (const wave of waves) {
    const table = wave.enemy.dropTableId ? getDropTable(wave.enemy.dropTableId) : undefined;
    for (const entry of table?.entries ?? []) {
      if (entry.dropRate > 0 && !candidates.has(entry.itemId)) {
        candidates.set(entry.itemId, { total: 0, runsWithDrop: 0 });
      }
    }
    const proofExchange = wave.enemy.isBoss && wave.enemy.dropTableId
      ? getBossRareExchangeForDropTable(wave.enemy.dropTableId)
      : undefined;
    if (proofExchange && !candidates.has(proofExchange.proofItemId)) {
      candidates.set(proofExchange.proofItemId, { total: 0, runsWithDrop: 0 });
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
  let totalCombatTtk = 0;
  let totalGold = 0;
  let totalExp = 0;

  for (let run = 0; run < runs; run++) {
    const runDps = effectiveDps * (0.84 + combatRng.next() * 0.32);
    let runTtk = profile.transitionSec;
    let runCombatTtk = 0;
    let runDamage = 0;
    for (const wave of waves) {
      const waveTtk = wave.hp / Math.max(0.01, runDps);
      runTtk += waveTtk;
      runCombatTtk += waveTtk;
      const expectedHits = (waveTtk * 1000 * wave.pressure) / HIT_EVERY_MS;
      let landedHits = Math.floor(expectedHits);
      if (combatRng.chance(expectedHits - landedHits)) landedHits++;
      const damageVariance = 0.88 + combatRng.next() * 0.24;
      runDamage += landedHits * Math.max(1, Math.round(wave.hitDamage * damageVariance));
    }
    ttkSamples.push(runTtk);
    totalCombatTtk += runCombatTtk;
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
        const proofExchange = enemy.isBoss && enemy.dropTableId
          ? getBossRareExchangeForDropTable(enemy.dropTableId)
          : undefined;
        if (proofExchange) addRunDrop(runDrops, proofExchange.proofItemId, 1);
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
  const baseTotalHp = waves.reduce((sum, wave) => sum + wave.enemy.maxHp * wave.count, 0);
  const baseMaxContactDamage = Math.max(...waves.map((wave) => wave.enemy.contactDamage));
  const adjustedMaxContactDamage = baseMaxContactDamage * combatModifiers.dmgMult * enemyDamageScale;
  const strongestHit = mitigateDamage(Math.round(adjustedMaxContactDamage), derived.def);
  const targetTtk = encounterTargetTtk(rank, profile);
  const targetHits = rankTargetHits(rank);
  const targetAdjustedHp = effectiveDps * Math.max(1, targetTtk - profile.transitionSec);
  const targetMitigatedHit = derived.maxHp / targetHits;
  const targetAdjustedContact = targetMitigatedHit * ((MITIGATION_K + derived.def) / MITIGATION_K);
  const suggestedHpScale = targetAdjustedHp / Math.max(1, baseTotalHp * combatModifiers.hpMult);
  const suggestedDamageScale = targetAdjustedContact / Math.max(
    1,
    baseMaxContactDamage * combatModifiers.dmgMult,
  );
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
  const tolerance = ttkTolerance(profile.kind);
  if (clearRate < 0.75) notes.push('最低Lvでは生存が不安定');
  if (averageTtkSec > targetTtk * tolerance.max) notes.push('目標より討伐時間が長い');
  if (averageTtkSec < targetTtk * tolerance.min) notes.push('目標より討伐時間が短い');
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
      gearIds: gear.map((entry) => entry.id),
      gearNames: gear.map((entry) => entry.name),
    },
    encounter: {
      kind: profile.kind,
      enemyCount: waves.reduce((sum, wave) => sum + wave.count, 0),
      bossCount: profile.bossCount,
      mobCount: profile.mobCount,
      transitionSec: profile.transitionSec,
      averageCombatTtkSec: totalCombatTtk / runs,
      baseTotalHp,
      adjustedTotalHp: baseTotalHp * combatModifiers.hpMult * enemyHpScale,
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

export function simulateHuntBatch(
  options: HuntBatchSimulationOptions = {},
): HuntBatchSimulationResult {
  const quests = huntSimulationQuests();
  const entries = quests.map((quest, index) => {
    const seed = options.seed === undefined
      ? undefined
      : (options.seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
    return diagnosticFor(simulateHunt({ questId: quest.id, runs: options.runs, seed }));
  });
  entries.sort(
    (a, b) =>
      b.score - a.score ||
      a.result.rank - b.result.rank ||
      a.result.playerLevel - b.result.playerLevel ||
      a.result.questName.localeCompare(b.result.questName, 'ja'),
  );
  const counts: Record<HuntDiagnosticStatus, number> = {
    good: 0,
    watch: 0,
    adjust: 0,
    critical: 0,
  };
  for (const entry of entries) counts[entry.status]++;
  const runsPerQuest = entries[0]?.result.runs ?? Math.round(
    clampNumber(options.runs, DEFAULT_BALANCE_RUNS, 1, 10_000),
  );
  return {
    runsPerQuest,
    totalAttempts: runsPerQuest * entries.length,
    entries,
    counts,
  };
}
