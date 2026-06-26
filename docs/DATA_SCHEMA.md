# DATA_SCHEMA.md

全データは不変の文字列IDを持つ。表示名を参照に使わない。形式は JSON（`src/data/defs/`）。`tools/validate-data.ts` が整合を検証する。

## レア度 R1〜R10（`src/data/rarity.ts`）

レア度は**数値 R1〜R10**（モンハン式ラダー）。色帯名・色・hex は rank から**導出**（アイテムには保存しない）ので不整合が起きない。

| rank | 帯 | 色 |  | rank | 帯 | 色 |
|---|---|---|---|---|---|---|
| 1–2 | コモン | 白 | | 7 | エピック | 紫 |
| 3–4 | アンコモン | 緑 | | 8 | レジェンド | 金 |
| 5–6 | レア | 青 | | 9 | ミシック | 赤 |
| | | | | 10 | ディヴァイン | 虹 |

**進行対応（設計）**: R1=冒険者 / R2–3=1次職 / R4–6=2次職 / R7–8=3次職 / R8–10=4次職(クリア後)。詳細は `CONTENT_MAP.md`。

## アイテム `items.json`

### material
```jsonc
{ "id": "slime_jelly", "name": "表示名", "rarity": 3, "sellPrice": 3, "description": "..." }
// rarity は R1〜R10 の整数（省略時 1）。
```

### equipment
```jsonc
{
  "id": "iron_sword",            // 不変ID
  "name": "鉄の剣",
  "slot": "main_hand",           // EquipSlot のいずれか
  "rarity": 3,                   // R1〜R10 の整数（色/帯名は導出）
  "visualId": "sword_iron",      // VISUAL_IDS のいずれか（複数装備で共有可・絵は後差し）
  "weaponTags": ["sword"],       // main_hand のみ。12タグから（職業の使用可タグと突合）
  "classRestrictions": ["warrior"], // 防具/装飾のみ・任意。空/未定義=共通装備（誰でも可）
  "element": "none",
  "levelRequirement": 6,
  "derived": { "physAtk": 10, "accuracy": 3 }, // DerivedStats の加算（キーは検証）
  "sellPrice": 25,
  "description": "..."
}
```

EquipSlot: `head, torso, hands, waist, feet, back, main_hand, accessory_1, accessory_2`（`src/equipment/slots.ts`）。
WeaponTag(12): `sword, axe, spear, katana, staff, wand, mace, dagger, whip, shuriken, bow, shield`。
ClassFamily(5): `warrior, mage, cleric, thief, tamer`。武器は weaponTags、防具/装飾は classRestrictions で職業制限（`src/equipment/restrictions.ts`）。
DerivedStats キー: `maxHp, maxMp, physAtk, magAtk, def, magDef, accuracy, evasion, critRate, atkSpeed, moveSpeed`。
> `jobRequirements` は旧フィールド（未使用）。職業制限は weaponTags / classRestrictions を使う。

## アイテム分類（全体）

`material / consumable / equipment / quest / pet_item`。インベントリは素材・消耗品をスタック、装備は個別管理。`ItemDefinition` と `ItemInstance` を分離（ランダムオプションは Phase 1 では未実装）。

## レア素材クラフト（Phase 2）

本作の核は「**素材を集めて作る**」。ハクスラ的な“当たり”の興奮は、完成装備の直ドロップではなく **超絶レア泥素材** で表現する。完成装備を入手する正規ルートは常にクラフト。

- **素材レアリティ**: `material` 定義に任意の `rarity`（**R1〜R10 の整数**）を追加。未指定は R1。色・枠で表示し、ドロップ演出を差別化。
- **超絶レア泥素材**: 通常敵/ボスから**極低確率**（例 0.5〜2%、ボス確定枠とは別）でドロップする `legendary` 素材。これ自体は装備ではない。
- **レア素材レシピ**: それらを一定数集めると作れる**特別装備**（`rare`/`epic`）を `recipes.json` に追加。完成装備のランダム性能は持たない（性能は固定、希少性は“素材集め”側にある）。
- **完成装備の直ドロップは増やさない**: 通常敵は素材＋ゴールド中心。ボス初回確定の1個（`bossFirstGuaranteed`）のみ既存どおり許容。
- **見た目**: レア装備もレアリティで画像を変えない（`visualId`/visual_family 維持）。枠色・光沢など演出で差別化。

> 真のランダム泥ハクスラ（ItemInstance＋アフィックス＋マジックファインド）は **クリア後コンテンツ**（下記）。Phase 2 では“素材レアリティ＋レア素材クラフト”に留め、世界観の核を保つ。

## ハクスラ（ランダム品）設計 — クリア後（エンドゲーム）

> **最新仕様**: クリア後ランダム装備は `item_system_spec v0.1`（調査クエスト＝ギルクエ風／R9・R10 の調査装備／品質帯 C〜SS／分解）に置き換え。レア度は R1〜R10、ランダム性能は**調査限定の武器・防具のみ**（アクセは対象外）。以下の旧記述（common/magic/rare… のアフィックス案）は概念メモとして残すが、レア度は R-rank に読み替える。

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

## 製作レシピ `recipes.json`

`{ id, resultItemId, resultQty, materials: {itemId: qty}, gold, station?, consumeEquipment?: string[] }`。

- **直接生産**: `materials` ＋ `gold`（重い素材）。
- **強化（R2+）**: `consumeEquipment`（前ランクの装備を消費）＋軽い素材。完成品IDは直接生産と同一でよい（spec §2.2）。
- `consumeEquipment` の各IDは実在の装備でなければならない（検証）。`craft()` が所持を判定し、装備中なら自動で外して消費する。

## 職業（マルチジョブ制 / データ構造は先行・内容は段階的）

実ファイルは `src/data/defs/jobs.json`。1職 = `{ id, name, tier(0-4), parentJobIds[], description, family?, unlockConditions[], baseStatModifiers?, derivedModifiers?, equippableWeaponTags[], skillTreeId? }`。

`family`（ClassFamily: warrior/mage/cleric/thief/tamer）は防具/装飾の `classRestrictions` 判定に使う。冒険者(tier0)は family を持たず、共通装備のみ装備可。`equippableWeaponTags` は武器制限（12タグ）。

**マルチジョブ制**: 各職業が独立したレベルを持ち、転職で切り替えながら複数職を育てる。各職のレベルはセーブの `player.jobLevels` / `player.jobExp`（jobId→数値）に保持。アクティブ職のレベル/経験値は `player.level` / `player.exp` をミラーする（`GameState.changeJob` で入れ替え、`gainExp` で同期）。

**転職条件 `unlockConditions[]`**（全条件 AND）。各要素は判別共用体:
- `{ type: "jobLevel", jobId, level }` … 指定職が `level` 以上（例: サムライ = fighter 50 かつ thief 30）
- `{ type: "charLevel", level }` … アクティブ職レベルが `level` 以上
- `{ type: "skill", skillId }` … スキル習得済み
- `{ type: "flag", flag }` … セーブフラグ成立
- `{ type: "quest", questId }` … クエスト踏破（4次職の高難度クエストは内容未定。暫定で `flags["quest_<id>"]` で代用）

**ツリー**: tier0 冒険者 → 1次職(ファイター/メイジ/プリースト/シーフ/ペットライザー, 冒険者Lv20) → 2次職(サムライ/ソーサラー/ホーリーナイト/ニンジャ/レンジャー) → 3次職(ソードカイザー/グランマギアー/シルドセイバー/アベンジスタ/デュアルスター, 各2次職Lv70) → 4次職(アラミカグラ/アルヴライド/ニルバディオ/ノクスティア/オルタリエ, 各3次職Lv80＋高難度クエスト)。`baseStatModifiers`/`derivedModifiers`/`equippableWeaponTags` は暫定値で、バランス調整は後フェーズ。

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
