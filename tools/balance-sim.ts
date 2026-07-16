/**
 * Headless balance simulator (`npm run balance-sim [runs]`). Reuses the real
 * game logic (stats / drops / leveling / quests / recipes — all Phaser-free)
 * to answer: is each boss beatable at its quest's minLevel, how many hunt
 * runs does a rare material or egg take, how many hunts to craft each boss
 * series item, and how long the leveling road is.
 *
 * Combat model (documented assumptions, everything else is real data):
 *  - Player DPS  = physAtk × (1 + crit×0.6) × swings/sec (BASE 360ms / 攻速)
 *  - Skills/pets/elements are NOT modeled → real players do a bit better.
 *  - Boss avg hit = contactDamage (damageMult ≈ 1.0 across attack pools),
 *    mitigated by 防御 (mitigateDamage), taken once per HIT_EVERY_MS —
 *    the 700ms invuln plus dodging means ~1 hit landing every 2.5s.
 *  - Gear = best OBTAINABLE piece per slot at that level (recipe or drop),
 *    sword main-hand; stat points split VIT/STR evenly.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeDerived, ZERO_BASE, type BaseStats, type StatModifiers } from '../src/stats/stats';
import { mitigateDamage } from '../src/combat/mitigation';
import { allEquipment, getEquipment, type EquipmentDef } from '../src/data/items';
import { allEnemyDefs, getEnemyDef, type EnemyDef } from '../src/enemies/enemy-defs';
import { allQuests, type QuestDef } from '../src/quests/quest-defs';
import { allRecipes } from '../src/crafting/recipes';
import { getDropTable, rollDrops } from '../src/loot/drop-table';
import { totalExpForLevel } from '../src/stats/leveling';
import { VETERAN_MODS } from '../src/quests/hunt-logic';
import { Rng } from '../src/core/rng';

const RUNS = Number(process.argv[2] ?? 300);
const HIT_EVERY_MS = 2500; // how often a boss hit actually lands on a dodging player
const BASE_ATTACK_MS = 360;
/** Fraction of theoretical DPS a real player lands (repositioning, dodges, whiffs). */
const UPTIME = 0.35;
/** Tuning targets per rank: how long a hunt should take / hits to die. */
const targetTtkSec = (rank: number): number => 15 + rank * 8; // ★1=23s … ★7=71s
const targetHitsToDie = (rank: number): number => Math.max(6, 14 - rank); // ★1=13 … ★7=7

const lines: string[] = [];
const out = (s = ''): void => {
  lines.push(s);
  console.log(s);
};

// ---------- gear + stat policy ----------
const craftable = new Set(allRecipes().map((r) => r.resultItemId));
const droppable = new Set<string>();
for (const e of allEnemyDefs()) {
  const t = e.dropTableId ? getDropTable(e.dropTableId) : undefined;
  for (const en of t?.entries ?? []) if (getEquipment(en.itemId)) droppable.add(en.itemId);
}
const obtainable = (e: EquipmentDef): boolean => craftable.has(e.id) || droppable.has(e.id);

function gearScore(e: EquipmentDef): number {
  const d = e.derived ?? {};
  if (e.slot === 'main_hand') return (d.physAtk ?? 0) + (d.critRate ?? 0) * 40 + (d.atkSpeed ?? 0) * 3;
  return (d.def ?? 0) * 2 + (d.maxHp ?? 0) * 0.5 + (d.magDef ?? 0) + (d.evasion ?? 0) * 0.5;
}

function bestGear(level: number): EquipmentDef[] {
  const slots = ['main_hand', 'head', 'torso', 'back', 'hands', 'feet', 'waist', 'accessory_1'];
  const picks: EquipmentDef[] = [];
  for (const slot of slots) {
    const pool = allEquipment().filter(
      (e) =>
        e.slot === slot &&
        (e.levelRequirement ?? 1) <= level &&
        obtainable(e) &&
        (slot !== 'main_hand' || (e.weaponTags ?? []).includes('sword')),
    );
    pool.sort((a, b) => gearScore(b) - gearScore(a));
    if (pool[0]) picks.push(pool[0]);
  }
  return picks;
}

function buildPlayer(level: number): { derived: ReturnType<typeof computeDerived>; gear: EquipmentDef[] } {
  const points = (level - 1) * 3;
  const base: BaseStats = {
    ...ZERO_BASE,
    STR: 5 + Math.ceil(points / 2),
    VIT: 5 + Math.floor(points / 2),
    INT: 5,
    DEX: 5,
    LUK: 5,
  };
  const gear = bestGear(level);
  const mods: StatModifiers[] = gear.map((g) => ({ derived: g.derived ?? {} }));
  return { derived: computeDerived(base, mods), gear };
}

// ---------- quest → boss mapping ----------
const huntQuests = allQuests().filter((q) => q.huntMap);
function bossOf(q: QuestDef): EnemyDef | undefined {
  for (let i = q.objectives.length - 1; i >= 0; i--) {
    const e = getEnemyDef(q.objectives[i].enemyId);
    if (e?.isBoss) return e;
  }
  return undefined;
}

// ---------- 1) boss difficulty at minLevel ----------
out('# バランス検証レポート');
out();
out(`シミュレーション回数: 各狩猟 ${RUNS} 周 / 乱数シード固定`);
out();
out('## 1. ボス難易度（クエスト最低レベル・入手可能な最良装備・剣・スキル/ペットなし）');
out();
out('危険度 = 討伐所要時間 ÷ 生存可能時間。0.6未満=快適 / 0.6〜1.0=緊張感 / 1.0超=ポーション前提 / 2.0超=壁');
out();
out('| クエスト | ボス | Lv | 討伐秒 | 被弾何発で死 | 危険度 | 判定 |');
out('|---|---|---|---|---|---|---|');
interface Row { danger: number; label: string }
const dangers: Row[] = [];
for (const q of huntQuests.sort((a, b) => (a.rank ?? 1) - (b.rank ?? 1) || (a.require?.minLevel ?? 1) - (b.require?.minLevel ?? 1))) {
  const boss = bossOf(q);
  if (!boss) continue;
  const lv = q.require?.minLevel ?? 1;
  const { derived } = buildPlayer(lv);
  const hpMult = q.veteran ? VETERAN_MODS.hpMult : 1;
  const dmgMult = q.veteran ? VETERAN_MODS.dmgMult : 1;
  const swingsPerSec = 1000 / (BASE_ATTACK_MS / derived.atkSpeed);
  const dps = derived.physAtk * (1 + derived.critRate * 0.6) * swingsPerSec * UPTIME;
  const ttk = (boss.maxHp * hpMult) / dps;
  const hit = mitigateDamage(Math.round(boss.contactDamage * dmgMult), derived.def);
  const hitsToDie = Math.ceil(derived.maxHp / hit);
  const surviveSec = (hitsToDie * HIT_EVERY_MS) / 1000;
  const danger = ttk / surviveSec;
  const verdict = danger > 2 ? '⚠️壁' : danger > 1 ? 'ポーション前提' : danger > 0.6 ? '緊張感' : '快適';
  dangers.push({ danger, label: `${q.name}（Lv${lv}）` });
  out(`| ${q.name} | ${boss.name} | ${lv} | ${ttk.toFixed(0)}s | ${hitsToDie}発 | ${danger.toFixed(2)} | ${verdict} |`);
}
out();

// ---------- 2) 300-run loot economics per boss quest ----------
out(`## 2. ドロップ経済（各狩猟を ${RUNS} 周した集計）`);
out();
out('| クエスト | 金/周 | 経験値/周 | レア素材（何周に1個） | たまご（何周に1個） |');
out('|---|---|---|---|---|');
const matIncome = new Map<string, Map<string, number>>(); // questId -> itemId -> qty over RUNS
for (const q of huntQuests) {
  const rng = new Rng(0xc0ffee ^ q.id.length ^ q.id.charCodeAt(0));
  const dropBonus = q.veteran ? VETERAN_MODS.dropBonusAdd : 0;
  const rewardMult = q.veteran ? VETERAN_MODS.rewardMult : 1;
  const got = new Map<string, number>();
  let gold = 0;
  let exp = 0;
  for (let i = 0; i < RUNS; i++) {
    for (const o of q.objectives) {
      const e = getEnemyDef(o.enemyId);
      if (!e) continue;
      for (let k = 0; k < o.count; k++) {
        const t = e.dropTableId ? getDropTable(e.dropTableId) : undefined;
        if (t) {
          for (const d of rollDrops(t, rng, { firstKill: false, dropBonus })) {
            got.set(d.itemId, (got.get(d.itemId) ?? 0) + d.qty);
          }
        }
        gold += Math.round((e.goldReward ?? 0) * rewardMult);
        exp += Math.round(e.expReward * rewardMult);
      }
    }
    gold += q.rewards.gold ?? 0;
    exp += q.rewards.exp ?? 0;
    for (const [id, n] of Object.entries(q.rewards.items ?? {})) got.set(id, (got.get(id) ?? 0) + n);
  }
  matIncome.set(q.id, got);
  const rare: string[] = [];
  const eggs: string[] = [];
  for (const [id, n] of got) {
    const per = RUNS / n;
    if (id.startsWith('pet_egg')) eggs.push(`${id.replace('pet_egg_', '')}:${per.toFixed(0)}周`);
    else if (per >= 6) rare.push(`${id}:${per.toFixed(0)}周`);
  }
  out(`| ${q.name} | ${(gold / RUNS).toFixed(0)}G | ${(exp / RUNS).toFixed(0)} | ${rare.join(' ') || '-'} | ${eggs.join(' ') || '-'} |`);
}
out();

// ---------- 3) crafting economics: hunts needed per boss-series item ----------
out('## 3. クラフト経済（ボス装備1点に必要な周回数の期待値）');
out();
out('| 装備 | 必要素材 | 最適クエストでの期待周回数 |');
out('|---|---|---|');
const bossSeriesPrefixes = ['lord_', 'guardian_', 'nox_', 'zephys_', 'vurm_', 'fenrir_', 'skoll_', 'king_jelly', 'golden_', 'royal_robe', 'varga_', 'spora_', 'garo_', 'hydra_', 'glacies_', 'sandgoa_', 'mordo_', 'magia_', 'abyss_sce', 'abyss_ring', 'crimson_man'];
for (const r of allRecipes()) {
  const eq = getEquipment(r.resultItemId);
  if (!eq || !bossSeriesPrefixes.some((p) => r.resultItemId.startsWith(p))) continue;
  let worst = 0;
  const needs: string[] = [];
  for (const [mat, qty] of Object.entries(r.materials)) {
    // Best per-run yield of this material across all hunt quests.
    let bestPerRun = 0;
    for (const [, got] of matIncome) {
      const per = (got.get(mat) ?? 0) / RUNS;
      if (per > bestPerRun) bestPerRun = per;
    }
    if (bestPerRun <= 0) {
      needs.push(`${mat}×${qty}(狩猟外)`);
      continue;
    }
    const runs = qty / bestPerRun;
    worst = Math.max(worst, runs);
    needs.push(`${mat}×${qty}`);
  }
  out(`| ${eq.name} | ${needs.join(' ')} | ${worst < 1 ? '1周' : `${Math.ceil(worst)}周`} |`);
}
out();

// ---------- 4) progression pacing ----------
out('## 4. 進行ペース（ランク解放レベルまでの必要経験値と目安）');
out();
out('| 目標 | 必要経験値(累計) | 帯の敵1体の経験値 | 討伐数の目安 |');
out('|---|---|---|---|');
const milestones: [string, number, string][] = [
  ['★2 (Lv13)', 13, 'green_wolf'],
  ['★3 (Lv20)', 20, 'cave_bat'],
  ['★4 (Lv32)', 32, 'rock_lizard'],
  ['★5 (Lv50)', 50, 'flame_hound'],
  ['★6 (Lv64)', 64, 'frost_wisp'],
  ['★7 (Lv80)', 80, 'shadow_knight'],
];
let prevExp = 0;
for (const [label, lv, ref] of milestones) {
  const total = totalExpForLevel(lv);
  const delta = total - prevExp;
  const e = getEnemyDef(ref)!;
  out(`| ${label} | +${delta.toLocaleString()} | ${e.name} ${e.expReward} | 約${Math.ceil(delta / e.expReward).toLocaleString()}体 |`);
  prevExp = total;
}
out();

// ---------- 4b) main-story clear-time estimate ----------
// Model: the player levels by repeating the best exp/min hunt available at
// their level (travel+fight+turn-in ≈ 1.5 + 0.5×rank minutes), grinding field
// mobs before any hunt unlocks, plus ~4 min per story boss. This is the FAST
// route — casual play runs longer. Target: 25〜35 hours (tune the cubic term
// in src/stats/leveling.ts expToNext).
{
  const FIELD_EXP_PER_MIN = 8 * 25;
  const questExp = (q: QuestDef): number => {
    let e = q.rewards.exp ?? 0;
    const mult = q.veteran ? VETERAN_MODS.rewardMult : 1;
    for (const o of q.objectives) e += (getEnemyDef(o.enemyId)?.expReward ?? 0) * o.count * mult;
    return e;
  };
  const runMin = (q: QuestDef): number => 1.5 + 0.5 * (q.rank ?? 1);
  const grindable = huntQuests.filter((q) => q.type !== 'main');
  const gates = allQuests()
    .filter((q) => q.type === 'main')
    .map((q) => q.require?.minLevel ?? 1)
    .sort((a, b) => a - b);
  let cur = 1;
  let mins = 0;
  out('## 4b. メインストーリー想定クリア時間（最速ルート換算）');
  out();
  out('| 区間 | 時間 |');
  out('|---|---|');
  for (const g of gates) {
    const need = totalExpForLevel(g) - totalExpForLevel(cur);
    let seg = 0;
    if (need > 0) {
      const avail = grindable.filter((q) => (q.require?.minLevel ?? 1) <= cur);
      const eff = Math.max(FIELD_EXP_PER_MIN, ...avail.map((q) => questExp(q) / runMin(q)));
      seg = need / eff;
    }
    if (seg / 60 >= 0.1) out(`| Lv${cur}→${g} | ${(seg / 60).toFixed(1)}h |`);
    mins += seg + 4;
    cur = g;
  }
  const hours = mins / 60;
  const verdict = hours < 25 ? ' ⚠️短すぎ（目標25〜35h）' : hours > 35 ? ' ⚠️長すぎ（目標25〜35h）' : '（目標25〜35h内 ✓）';
  out(`| **合計** | **${hours.toFixed(1)}h**${verdict} |`);
  out();
}

// ---------- 5) volume ----------
out('## 5. ボリューム統計');
out();
const qs = allQuests();
const byRank = new Map<number, number>();
for (const q of qs.filter((x) => x.huntMap)) byRank.set(q.rank ?? 1, (byRank.get(q.rank ?? 1) ?? 0) + 1);
out(`- クエスト総数: ${qs.length}（大型狩猟 ${qs.filter((x) => x.huntMap).length}: ${[...byRank.entries()].sort((a, b) => a[0] - b[0]).map(([r, n]) => `★${r}×${n}`).join(' ')}）`);
out(`- 敵: ${allEnemyDefs().length}体（ボス ${allEnemyDefs().filter((e) => e.isBoss).length}体）`);
out(`- 装備: ${allEquipment().length}点 / レシピ: ${allRecipes().length}本`);
const eqOrphans = allEquipment().filter((e) => !obtainable(e)).length;
out(`- 入手手段のない装備: ${eqOrphans}点${eqOrphans ? ' ⚠️（クエスト報酬のみの可能性あり — 要確認）' : ''}`);
out();

// ---------- 6) flags ----------
out('## 6. 自動検出した要注意ポイント');
out();
const walls = dangers.filter((d) => d.danger > 2);
const trivial = dangers.filter((d) => d.danger < 0.15);
if (walls.length) out(`- ⚠️ 危険度2.0超（壁）: ${walls.map((w) => w.label).join('、')}`);
if (trivial.length) out(`- 😴 危険度0.15未満（作業）: ${trivial.map((w) => w.label).join('、')}`);
if (!walls.length && !trivial.length) out('- 大きな外れ値なし');

// ---------- 7) tuning suggestions (boss HP / contact damage) ----------
// For each boss, take its LOWEST-minLevel hunt quest as the reference fight
// and back-solve the HP/damage that hit the rank's target TTK and hits-to-die.
const MITIGATION_K = 90;
const suggestions: Record<string, { maxHp: number; contactDamage: number; rank: number; lv: number }> = {};
for (const q of huntQuests) {
  if (q.veteran) continue;
  const boss = bossOf(q);
  if (!boss) continue;
  const lv = q.require?.minLevel ?? 1;
  const prev = suggestions[boss.id];
  if (prev && prev.lv <= lv) continue;
  const rank = q.rank ?? 1;
  const { derived } = buildPlayer(lv);
  const swingsPerSec = 1000 / (BASE_ATTACK_MS / derived.atkSpeed);
  const dps = derived.physAtk * (1 + derived.critRate * 0.6) * swingsPerSec * UPTIME;
  const wantHp = Math.round((dps * targetTtkSec(rank)) / 10) * 10;
  const mitigatedHit = derived.maxHp / targetHitsToDie(rank);
  const wantContact = Math.max(
    boss.contactDamage,
    Math.round(mitigatedHit * ((MITIGATION_K + derived.def) / MITIGATION_K)),
  );
  suggestions[boss.id] = { maxHp: wantHp, contactDamage: wantContact, rank, lv };
}
out();
out('## 7. チューニング提案（目標: ★1=23秒/被弾13発 → ★7=71秒/被弾7発）');
out();
out('| ボス | 現HP → 提案 | 現攻撃 → 提案 |');
out('|---|---|---|');
for (const [id, s] of Object.entries(suggestions)) {
  const e = getEnemyDef(id)!;
  const hpFlag = Math.abs(s.maxHp - e.maxHp) / e.maxHp > 0.3 ? ' ⚠️' : '';
  const dmFlag = Math.abs(s.contactDamage - e.contactDamage) / e.contactDamage > 0.3 ? ' ⚠️' : '';
  out(`| ${e.name} | ${e.maxHp} → ${s.maxHp}${hpFlag} | ${e.contactDamage} → ${s.contactDamage}${dmFlag} |`);
}

const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  join(here, 'tuning-suggestions.json'),
  JSON.stringify(suggestions, null, 2) + '\n',
);
const reportPath = join(here, '..', 'docs', 'BALANCE_REPORT.md');
writeFileSync(reportPath, lines.join('\n') + '\n');
console.log(`\n(report written to docs/BALANCE_REPORT.md, suggestions to tools/tuning-suggestions.json)`);
