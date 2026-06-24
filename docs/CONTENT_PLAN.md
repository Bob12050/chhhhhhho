# CONTENT_PLAN.md — コンテンツ増量計画（目標 約50倍）

本作は**データ駆動**（`src/data/defs/*.json`）なので、コードを触らず JSON を足すだけで増量できる。
**1カテゴリ・1項目ずつ**「追加 → 検証 → 実機確認」を回すのが原則。一気に入れない。

> 不変ルールは `CLAUDE.md` が優先。特に **データをハードコードしない / 見た目寸法を変えない / 既存作品を模倣しない / フェーズ順を守る**。

## 黄金ループ（毎回これだけ）

1. 該当 JSON に**不変の文字列ID**付きで1件追加（表示名をIDに使わない）
2. `npm run validate-data` … ID重複・参照 missing・不正値を自動検出
3. `npm run typecheck && npm run test && npm run build`
4. `?debug=1` で実機確認（DBGでワープ/付与して時短）
5. 1件OKを確認してから次へ。バランス値（ドロップ率/必要数/性能）は後で一括調整可

## 現状 → 目標（約50倍の目安）

| カテゴリ | ファイル | 現在 | 目標(約50x) | 依存 |
|---|---|---|---|---|
| マップ | `defs/maps/*.json` | 4 | 80〜120 | 敵/NPC/ポータル |
| 敵 | `defs/enemies.json` | 6 | 120〜200 | スプライト/ドロップ表 |
| ドロップ表 | `defs/drops.json` | 6 | 敵数に追従 | 素材/装備 |
| 素材 | `items.json.materials` | 9 | 150〜300 | rarity |
| 装備 | `items.json.equipment` | 10 | 300〜500 | visualId |
| レシピ | `defs/recipes.json` | 11 | 300〜500 | 素材/装備 |
| 消耗品 | `items.json.consumables` | 4 | 50〜100 | — |
| スキル | `defs/skills.json` | 3 | 80〜150 | 職業 |
| 職業 | `defs/jobs.json` | 2 | 30〜60 | スキル(前提) |
| ペット | `defs/pets.json` | 1 | 50〜100 | スプライト/進化 |
| ペットアイテム | `items.json.petItems` | 1 | ペット数に追従 | pets |
| 会話 | `defs/dialogue.json` | 2 | 100〜200 | マップNPC |
| 見た目ID | `data/visual-ids.ts` + アセット | 6 | 必要分 | **新規アート** |

> 数字は目安。総量で「今の約50倍」を狙う。装備・レシピ・敵・マップが量の主軸。

## 推奨順序（土台→受け皿→中身）

1. **マップ＆敵** … コンテンツの器。敵が増えると経験値/ドロップの受け皿になる
2. **素材** … 敵に紐づけてドロップ追加（rarityを付ける）
3. **装備＆レシピ** … 素材の消費先。レア素材→特別装備の流れを各帯で用意
4. **スキル＆職業** … tier2〜4。前提スキルで分岐を作る
5. **ペット** … 進化/性格/合成（最大10体）
6. **NPC会話・クエスト** … マップに意味を与える

## カテゴリ別テンプレ

### 素材（`items.json` > `materials`）
```json
{ "id": "<unique_id>", "name": "表示名", "rarity": "common|uncommon|rare|epic|legendary", "sellPrice": 0, "description": "" }
```
- `rarity` 省略=common。色/演出は `src/data/rarity.ts` が一元管理（画像は変えない）

### 敵（`enemies.json`）＋ドロップ（`drops.json`）
- 敵に `dropTableId` を付け、`drops.json` に対応表を作る
- ドロップは**素材中心**（完成装備の直ドロップは増やさない。ボス初回確定のみ可＝`bossFirstGuaranteed`）
- `dropRate` は 0..1 の独立判定。レア素材は極低（例 0.01〜0.05）
- スプライト未制作の敵は当面 `tint` で色替え（`enemies.json` の `tint`）。固有絵は後でパイプライン投入

### 装備（`items.json` > `equipment`）＋レシピ（`recipes.json`）
```json
{ "id":"", "name":"", "slot":"head|torso|main_hand", "rarity":"", "visualId":"<既存ID>",
  "levelRequirement":1, "derived":{ "physAtk":0 }, "sellPrice":0, "description":"" }
```
- `visualId` は `data/visual-ids.ts` の登録IDのみ。**色違い量産は既存IDを流用**（rarityで差別化、画像は変えない）
- `derived` のキーは `DerivedStats` のもの（検証あり）
- 特別装備はレア素材レシピで（性能固定。希少性は素材集め側）

### スキル（`skills.json`）／職業（`jobs.json`）
- スキル `requires` で前提ツリー（循環は検証で弾く）
- 職業 `unlock.requiresJob/requiresSkill`、`baseStatModifiers`/`derivedModifiers`（キー検証あり）

### ペット（`pets.json`）＋ペットアイテム（`items.json` > `petItems`）
- `petItems[].petId` は実在ペットIDを参照（検証あり）
- 進化/合成/性格は Phase 2 以降のデータ構造に従う

### マップ（`defs/maps/*.json`）
- 新規ファイルは `tools/validate-data.ts` の `files` 配列と `src/maps/map-def.ts` の import 群に追加する（現在 `town/field/dungeon/boss_room`）
- **移動は一覧から（ファストトラベル）。新マップはポータル不要**で、`travel` を付ければHUDの「地」ボタンの一覧に並ぶ：
  `"travel": { "order": <昇順>, "note": "一覧の補足", "unlockFlag": "<任意>", "hidden": false }`
  - `order` は一覧内で重複不可（検証あり）。`unlockFlag` 未指定＝最初から開放。`hidden:true` で一覧非表示
- `portals` は任意（歩いて繋ぎたい場合のみ）。`portals.to/toSpawn`、`enemies.type`、`npcs.dialogueId` は実在参照（検証あり）

### 会話（`dialogue.json`）
- `npcs.dialogueId` から参照。マップNPCとセットで増やす

## スケール時の注意（50倍で効く）

- **新規アート**：装備/敵/ペットを“見た目も”増やすなら `public/assets/` に PNG 投入（差し込みパイプライン）＋ `visual-ids.ts` 登録。色違いだけなら不要
- **モバイル上限**：画面内通常敵は最大12体程度（`CLAUDE.md`）。マップ設計で守る
- **バランス**：量を入れてから、ドロップ率・必要数・性能・経験値曲線を一括調整
- **セーブ互換**：新規データ追加は既存セーブと互換（IDが増えるだけ）。既存IDの**意味は変えない**
- **検証は常に緑**：どのカテゴリも追加後に黄金ループの4コマンドを通す

## 進捗メモ（随時更新）

- [ ] マップ＆敵
- [ ] 素材
- [ ] 装備＆レシピ
- [ ] スキル＆職業
- [ ] ペット
- [ ] NPC会話・クエスト
- [ ] 新規アート投入
- [ ] 全体バランス調整
