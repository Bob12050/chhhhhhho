import dropsJson from '@/data/defs/drops.json';
import type { Rng } from '@/core/rng';

/**
 * Drop tables (data-driven, seedable). Each entry rolls independently by
 * `dropRate`; `bossFirstGuaranteed` forces the drop on a boss's first kill.
 * Rolling is a pure function of the table + an Rng, so it is unit-testable.
 */
export interface DropEntry {
  itemId: string;
  dropRate: number; // 0..1 independent chance
  min: number;
  max: number;
  bossFirstGuaranteed?: boolean;
}

export interface DropTable {
  id: string;
  entries: DropEntry[];
}

export interface DropResult {
  itemId: string;
  qty: number;
}

interface DropsFile {
  tables: DropTable[];
}

const tables = new Map<string, DropTable>();
for (const t of (dropsJson as DropsFile).tables) tables.set(t.id, t);

export function getDropTable(id: string): DropTable | undefined {
  return tables.get(id);
}

export function allDropTables(): DropTable[] {
  return [...tables.values()];
}

/**
 * Roll a table into concrete drops. `firstKill` enables guaranteed entries;
 * `dropBonus` multiplies every entry's chance (0.15 = +15%, from LUK / charm
 * accessories), capped at 100% per entry.
 */
export function rollDrops(
  table: DropTable,
  rng: Rng,
  opts: { firstKill?: boolean; dropBonus?: number } = {},
): DropResult[] {
  const out: DropResult[] = [];
  const mult = 1 + Math.max(0, opts.dropBonus ?? 0);
  for (const e of table.entries) {
    const guaranteed = !!e.bossFirstGuaranteed && !!opts.firstKill;
    if (!guaranteed && !rng.chance(Math.min(1, e.dropRate * mult))) continue;
    const qty = rng.intRange(e.min, e.max);
    if (qty > 0) out.push({ itemId: e.itemId, qty });
  }
  return out;
}
