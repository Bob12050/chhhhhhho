# DATA_SCHEMA.md

全データは不変の文字列IDを持つ。表示名を参照に使わない。形式は JSON（`src/data/defs/`）。`tools/validate-data.ts` が整合を検証する。

## アイテム `items.json`

### material
```jsonc
{ "id": "slime_jelly", "name": "表示名", "sellPrice": 3, "description": "..." }
```

### equipment
```jsonc
{
  "id": "iron_sword",            // 不変ID
  "name": "鉄の剣",
  "slot": "main_hand",           // EquipSlot のいずれか
  "rarity": "common",
  "visualId": "sword_iron",      // VISUAL_IDS のいずれか（複数装備で共有可）
  "weaponTags": ["sword"],
  "element": "none",
  "levelRequirement": 2,
  "jobRequirements": [],          // 省略可
  "derived": { "physAtk": 9 },   // DerivedStats の加算（キーは検証される）
  "sellPrice": 18,
  "description": "..."
}
```

EquipSlot: `head, torso, hands, waist, feet, back, main_hand, accessory_1, accessory_2`（`src/equipment/slots.ts`）。
DerivedStats キー: `maxHp, maxMp, physAtk, magAtk, def, magDef, accuracy, evasion, critRate, atkSpeed, moveSpeed`。

## アイテム分類（全体）

`material / consumable / equipment / quest / pet_item`。インベントリは素材・消耗品をスタック、装備は個別管理。`ItemDefinition` と `ItemInstance` を分離（ランダムオプションは Phase 1 では未実装）。

## ドロップテーブル（Phase 1 で投入）

`{ item_id, weight | drop_rate, min_quantity, max_quantity, 条件付き, ボス初回確定 }`。抽選は seedable RNG（`core/rng.ts`）でテスト可能。

## 製作レシピ（Phase 1）

`{ recipe_id, result_item_id, result_quantity, required_materials, required_gold, required_station, unlock_conditions }`。

## 職業（Phase 1）

`{ id, display_name, tier(0-4), parent_job_ids[], description, unlock_conditions[], stat_growth, base_stat_modifiers, equippable_weapon_tags[], skill_tree_id, icon_path }`。転職条件は `{type: level|job|quest|boss|material|skill, ...}` の配列。

## スキル（Phase 1）

`{ id, type(active|passive), skill_tree_id, requires[], required_job, required_tier, max_level, cooldown, mp_cost, power_mult, scaling_stat, element, status[], aoe, knockback, cast_time, cancelable, effects: EffectDefinition[] }`。

## ポーズアトラス

`pose-atlas.ts` 参照。シート寸法は frame 寸法（64×96）× 行数（方向×アニメ）で決まり、検証される。

## セーブ `SaveDataV1`（`src/save/schema.ts`）

```jsonc
{
  "version": 1, "slot": 0, "savedAt": 0, "mapId": "town",
  "player": { "x","y","level","exp","statPoints",
              "base": {"STR","VIT","INT","DEX","LUK"}, "hp","mp" },
  "equipment": { "<slot>": "<itemId|null>" },
  "inventory": { "materials": { "<itemId>": qty } },
  "flags": { "<flag>": true },
  "settings": { "sfx": true, "bgm": true }
}
```
未知ID・削除済みID・部分破損は読み込み時に安全に既定値へフォールバックする。Phase 1 で jobs/skills/pets/quests を同スキーマに拡張し、`migrate()` に段階変換を追加する。
