import shopsJson from '@/data/defs/shops.json';

/**
 * Shop definitions (data-driven). A shop sells consumables / hunt-prep items for
 * gold — NOT weapons or armour (those are crafted at the 鍛冶屋). The 道具屋
 * (`general`) is the pre-hunt prep facility. Prices are in gold; item ids must
 * exist in items.json (validated by tools/validate-data).
 */
export interface ShopStockEntry {
  itemId: string;
  price: number;
}

export interface ShopDef {
  id: string;
  name: string;
  blurb?: string;
  stock: ShopStockEntry[];
}

const data = shopsJson as { shops: ShopDef[] };

export function getShop(id: string): ShopDef | undefined {
  return data.shops.find((s) => s.id === id);
}
