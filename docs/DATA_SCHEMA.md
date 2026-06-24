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

## レア素材クラフト（Phase 2）

本作の核は「**素材を集めて作る**」。ハクスラ的な“当たり”の興奮は、完成装備の直ドロップではなく **超絶レア泥素材** で表現する。完成装備を入手する正規ルートは常にクラフト。

- **素材レアリティ**: `material` 定義に任意の `rarity`（`common / uncommon / rare / epic / legendary`）を追加。未指定は `common`。色・枠で表示し、ドロップ演出を差別化。
- **超絶レア泥素材**: 通常敵/ボスから**極低確率**（例 0.5〜2%、ボス確定枠とは別）でドロップする `legendary` 素材。これ自体は装備ではない。
- **レア素材レシピ**: それらを一定数集めると作れる**特別装備**（`rare`/`epic`）を `recipes.json` に追加。完成装備のランダム性能は持たない（性能は固定、希少性は“素材集め”側にある）。
- **完成装備の直ドロップは増やさない**: 通常敵は素材＋ゴールド中心。ボス初回確定の1個（`bossFirstGuaranteed`）のみ既存どおり許容。
- **見た目**: レア装備もレアリティで画像を変えない（`visualId`/visual_family 維持）。枠色・光沢など演出で差別化。

> 真のランダム泥ハクスラ（ItemInstance＋アフィックス＋マジックファインド）は **クリア後コンテンツ**（下記）。Phase 2 では“素材レアリティ＋レア素材クラフト”に留め、世界観の核を保つ。

## ハクスラ（ランダム品・レアリティ）設計 — クリア後（エンドゲーム）

ジャンルの中核となる戦利品の深み。**性能はランダム、見た目は visual_family で共有**（`GAME_DESIGN.md` 層5/9）。本編クリア後に解放するエンドゲーム周回向けで、本編中はレア素材クラフト（上記）が主役。

- **レアリティ**: `common / magic / rare / epic / legendary`。レアリティで付与オプション数が決まる（例: common 0 / magic 1〜2 / rare 3 / epic 4 / legendary 4+特殊）。色で表示。
- **アフィックス（オプション）プール** `affixes.json`: `{ id, name, stat(派生キー), min, max, slots?[](付与可能スロット), tierWeight? }`。例: `+N 物理攻撃` / `+N 最大HP` / `+N% 会心`。`stat` は `DerivedStats` のキー（検証）。
- **ItemInstance**: `{ uid, defId, rarity, affixes: [{stat, value}] }`。実効値 = `定義.derived` ＋ アフィックス合算。`computeDerived` に各装備インスタンスの合算を渡す。
- **ドロップ生成**: 装備ドロップ時に①レアリティ抽選（LUK=マジックファインドで上振れ）②スロット対応プールからアフィックス抽選（seedable RNG, テスト可能）。
- **保存**: `equipmentOwned` を `ItemInstance[]`（uid付き）へ。`equipment[slot]` は uid 参照。`migrate` で既存の id 配列を common インスタンスへ変換。
- **UI**: レアリティ色・接頭/接尾名・ロール値表示、装備中との比較（増減）、不要品の売却/分解。
- **製作との関係**: 製作は基本 common を産出（将来、確定オプション枠や強化を追加可能）。
- **見た目**: レアリティで画像は変えない（`visualId`/visual_family を維持）。光沢や枠色などの差別化は演出で。

### 投入を分けるサブステップ（リスク低減）
1. **インスタンス化リファクタ**（見た目の変化なし）: 所持装備を id 配列→ItemInstance 化、uid 参照、`computeDerived` をインスタンス対応に、migrate 追加。
2. **レアリティ＋アフィックス**: プールデータ＋ドロップ時ロール、インベントリ表示。
3. **マジックファインド/比較/分解**: LUK 連動、比較UI、売却・分解で素材還元。

## ドロップテーブル `drops.json`

`{ id, entries: [{ itemId, dropRate(0..1, 各エントリ独立判定), min, max, bossFirstGuaranteed? }] }`。
敵定義の `dropTableId` から参照。抽選は seedable RNG（`core/rng.ts`）の純関数 `rollDrops(table, rng, {firstKill})` でテスト可能。`bossFirstGuaranteed` はボス初回撃破時に確定。

## 製作レシピ（Phase 1）

`{ recipe_id, result_item_id, result_quantity, required_materials, required_gold, required_station, unlock_conditions }`。

## 職業（Phase 1）

`{ id, display_name, tier(0-4), parent_job_ids[], description, unlock_conditions[], stat_growth, base_stat_modifiers, equippable_weapon_tags[], skill_tree_id, icon_path }`。転職条件は `{type: level|job|quest|boss|material|skill, ...}` の配列。

## スキル（Phase 1）

`{ id, type(active|passive), skill_tree_id, requires[], required_job, required_tier, max_level, cooldown, mp_cost, power_mult, scaling_stat, element, status[], aoe, knockback, cast_time, cancelable, effects: EffectDefinition[] }`。

## ポーズアトラス

`pose-atlas.ts` 参照。シート寸法は frame 寸法（96×96）× 行数（方向×アニメ）で決まり、検証される。

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
