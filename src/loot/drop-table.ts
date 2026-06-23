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

/** Roll a table into concrete drops. `firstKill` enables guaranteed entries. */
export function rollDrops(
  table: DropTable,
  rng: Rng,
  opts: { firstKill?: boolean } = {},
): DropResult[] {
  const out: DropResult[] = [];
  for (const e of table.entries) {
    const guaranteed = !!e.bossFirstGuaranteed && !!opts.firstKill;
    if (!guaranteed && !rng.chance(e.dropRate)) continue;
    const qty = rng.intRange(e.min, e.max);
    if (qty > 0) out.push({ itemId: e.itemId, qty });
  }
  return out;
}
