# PHASE1_PLAN.md — 縦切り試作の実装計画

`docs/ROADMAP.md` の Phase 1 を、**実機で逐次検証できる小さなマイルストーン (M)** に分解した作業計画。
各 M は「単独でビルド・実機確認できる垂直スライス」を原則とし、終わるごとに
`typecheck / validate-data / test / build` を通して `main` へ公開する。

> 規約: データはハードコードしない（`src/data/defs/*.json`）。疎結合は型付き `EventBus`。
> 派生値は `computeDerived` 1か所。巨大クラス禁止。ペーパードールはプレイヤーのみ。
> （詳細は `CLAUDE.md` / `TECH_DESIGN.md`）

## 最終ゴール（Phase 1 完了条件・ROADMAP 準拠）

18ステップ通し: 新規開始 → フィールド → 撃破 → 素材 → Lvup → STR割振 → スキル習得 →
帰town → 製作 → 装備 → 能力値&見た目変化 → ペット同行 → ダンジョン → ボス撃破 →
転職 → セーブ → 再起動ロード → 全状態維持。これがエラーなく通れば完了。

各 M の「実機完了条件」を積み上げると、この通しが自然に成立する順序にしてある。

---

## 既存資産（Phase 0 で完成済み・流用する）

- シーン: `Boot / Town / UI / Equipment`、`PaperDollAnimator`、`computeDerived`、
  `GameState`、`SaveManager`(3スロット/バックアップ/migrate)、`EventBus`、`VirtualStick`/`TouchButton`、
  入力 `InputState`、敵FSM `Enemy`、`DamageNumbers`、プレースホルダー生成、PWA/向きガード。
- データ: `items.json`（素材3 / 装備6）。

---

## マイルストーン一覧（推奨順）

| M | 名称 | 主目的 | 依存 |
|---|------|--------|------|
| M1 | タイトル / セーブ選択 / 基盤 | 「新規開始」と「再起動ロード」の入口、シーン整理 | — |
| M2 | マップ枠組み | 町/フィールド/ダンジョン/ボス部屋をデータ駆動・遷移 | M1 |
| M3 | インベントリ + アイテム実体 + 消耗品 | 所持一覧・個数・消耗品使用、ゴールド導入 | M1 |
| M4 | ドロップテーブル | seedable RNG 抽選、敵/ボス確定初回ドロップ | M3 |
| M5 | 製作（クラフト） | レシピ6・素材/ゴールド消費・製作NPC | M3 |
| M6 | 育成UI（割り振り） | STR等の割振UI（ロジックは既存） | M1 |
| M7 | スキル系 | アクティブ2+パッシブ1、習得UI、効果合成 | M2,M6 |
| M8 | 職業 / 転職 | 初期職+1次職、転職条件評価 | M6,M7 |
| M9 | 敵コンテンツ + ボス | 通常敵3+ボス1、ボス部屋、撃破フラグ | M2,M4 |
| M10 | ペット | ペット1・同行（追従）・ペットアイテム | M2,M3 |
| M11 | NPC会話 | データ駆動の簡易会話 | M2 |
| M12 | デバッグメニュー + 通し統合 | リリース無効化、18ステップ統合確認、移行 | 全て |

各 M はおおむね独立して公開可能。途中で実機が不安定になったら次へ進まない（フェーズ規約）。

---

## M1 — タイトル / セーブ選択 / 基盤整理

- **新規シーン**: `Title`（新規/つづきから）、`SaveSelect`（3スロット概要 = `saveManager.summaries()`）。
  `Boot` は「テクスチャ生成 → Title へ」に変更（現状の slot0 自動開始を廃止）。
- **GameState 拡張**: `gold:number`（M3/M5 で使用）を追加し、`SaveDataV1` に `player.gold` を追加、
  `migrate()` に既定 0 を補完。`SAVE_VERSION` は据え置き可（後方互換マージで吸収）。
- **EventBus**: `game:new`, `game:load`, `game:return-to-title`。
- **新規依存なし**。
- **実機完了条件**: タイトル→新規→ゲーム、タイトル→つづき→ロード、ゲーム→タイトル復帰ができる。
  PWA更新の適用はタイトルでのみ実行（`applyPendingUpdate`）。

## M2 — マップ枠組み（データ駆動 + 遷移）

- **データ**: `maps/*.json`（`{ id, name, size{w,h}, tileset, spawns[], portals[], enemySpawns[], npcs[], stations[] }`）。
  Phase 0 の Town レイアウトを `town.json` 化。`field.json` / `dungeon.json` / `boss_room.json` を追加。
- **モジュール**: `src/maps/`（map定義ロード + バリデート）、汎用 `WorldScene`（現 `TownScene` を一般化）、
  `Preload`（マップ単位アセット）、`BossRoom`（演出用に分離可）。
- **ポータル遷移**: 接触で別マップへ。遷移時オートセーブ（`mapId`/座標）。
- **EventBus**: `map:enter`, `map:exit`, `portal:used`。
- **検証**: portal の遷移先 mapId 存在、spawn ID 整合を `validate-data` に追加。
- **実機完了条件**: 町↔フィールド↔ダンジョン↔ボス部屋を行き来でき、各々で敵/NPCが出る。

## M3 — インベントリ + アイテム実体 + 消耗品 + ゴールド

- **モデル分離**: `ItemDefinition`(不変) と `ItemInstance`(実体: id, qty, 将来オプション枠)。
  `inventory/`（所持の追加/消費/スタック、装備は個別）。素材はスタック、消耗品はスタック、装備は個別保持。
- **データ**: 消耗品2種（例: 回復ポーション/MPポーション）を `items.json` に `consumable` として追加
  （`{ id, name, type:"consumable", effect:{heal|mp|...}, sellPrice, description }`）。
- **UI**: `Inventory` オーバーレイ（素材/消耗品/装備のタブ、個数表示、消耗品「つかう」、装備「そうび」）。
  Equipment 画面はインベントリ起点に統合（所持から選んで装備）。
- **セーブ拡張**: `inventory.consumables`, `inventory.equipmentOwned[]`, `player.gold`。`migrate()` 補完。
- **EventBus**: `inventory:changed`(既存), `item:used`, `gold:changed`。
- **実機完了条件**: 拾った素材が一覧と個数に反映、消耗品でHP/MP回復、所持装備から装備変更できる。

## M4 — ドロップテーブル（seedable RNG）

- **データ**: `drops/*.json`（`{ table_id, entries:[{ item_id, weight|drop_rate, min, max, condition?, bossFirstGuaranteed? }] }`）。
  敵定義に `dropTableId` を付与。
- **ロジック**: `core/rng.ts`（既存）で抽選 → Vitest でヘッドレステスト（分布/確定初回）。
- **置換**: 現在ハードコードの `slime_jelly` ドロップをテーブル駆動へ。
- **検証**: drop_rate 範囲、item_id 存在、weight 正数を `validate-data` で。
- **実機完了条件**: 敵を倒すとテーブル通りに素材が落ち、ボス初回は確定ドロップ。

## M5 — 製作（クラフト）

- **データ**: `recipes/*.json`（`{ recipe_id, result_item_id, result_quantity, required_materials{}, required_gold, required_station, unlock_conditions[] }`）レシピ6。
- **モジュール**: `crafting/`（材料/ゴールド充足判定 = 既存 `consumeMaterials` 拡張、作成）。製作NPC/作業台（map の `stations`）。
- **UI**: `Crafting` オーバーレイ（作れるレシピ一覧、不足材料の表示、作成）。
- **EventBus**: `craft:made`, `inventory:changed`。製作後オートセーブ。
- **検証**: result_item_id / required_materials の id 存在、循環なし。
- **実機完了条件**: 町の作業台でレシピから装備/消耗品を作成 → インベントリに追加される。

## M6 — 育成UI（ステータス割り振り）

- 既存 `gameState.allocateStat` / `gainExp` / `expToNext` を流用。
- **UI**: `Status` オーバーレイ（base/derived 表示、未割当ポイントを STR/VIT/INT/DEX/LUK に割振）。
- **EventBus**: `player:stats-recomputed`(既存), `player:level-up`(既存) を UI が購読。
- **実機完了条件**: 撃破でLvup→ポイント獲得→STR割振→`physAtk` 等が即時変化（戦闘にも反映）。

## M7 — スキル系（アクティブ2 + パッシブ1）

- **データ**: `skills/*.json`（DATA_SCHEMA のスキル構造）。`effects: EffectDefinition[]` を共通合成し、
  特殊挙動のみ専用クラス。スキルツリー `skill_tree_id` + `requires[]`。
- **モジュール**: `skills/`（定義ロード、効果適用器、クールダウン/MP管理）。`combat/` と連携。
- **UI**: スキルバー（UIScene に S1/S2 等）、`SkillLearn` オーバーレイ（前提/必要職/tier で習得）。
- **置換**: Phase 0 のハードコード `useSkill1` を skill 定義駆動へ。
- **セーブ拡張**: `player.skills{ id: level }`, スキルスロット割当。
- **検証**: requires/required_job の循環・存在を `validate-data` で有効化。
- **実機完了条件**: スキル習得→スロット装着→発動（MP/CD/効果/見た目）。パッシブが派生値に反映。

## M8 — 職業 / 転職

- **データ**: `jobs/*.json`（DATA_SCHEMA の職業構造）。初期職 + 1次職1。
  転職条件は `{type: level|job|quest|boss|material|skill, ...}` の配列を**評価器**で判定。
- **モジュール**: `jobs/`（定義ロード、条件評価、`base_stat_modifiers`/`stat_growth` を `computeDerived` の modifier に供給）。
  `equippable_weapon_tags` を装備可否に反映。
- **UI**: 転職NPC + `JobChange` オーバーレイ。
- **セーブ拡張**: `player.jobId`, `player.unlockedJobs[]`。
- **実機完了条件**: 条件を満たすと1次職へ転職 → ステータス成長/装備可否/スキル前提が変わる。

## M9 — 敵コンテンツ + ボス

- **データ**: 敵定義 `enemies/*.json`（現在 `Enemy` に直書きの数値を JSON 化、`dropTableId` 含む）。通常敵3 + ボス1。
- **ボス**: `boss_room` に配置、HPバー、簡易パターン（複数 state）、撃破で `flags.boss_*` を立てオートセーブ。
- **モジュール**: `enemies/` に定義ロードを追加（FSM 本体は流用）。画面上限/プール厳守。
- **実機完了条件**: フィールドに通常敵3種、ダンジョン奥のボス部屋でボス戦→撃破→フラグ保存。

## M10 — ペット（1体・同行）

- **データ**: `pets/*.json`（`{ id, name, sprite, follow, passive_modifiers?, skill? }`）+ `pet_item`。
- **モジュール**: `pets/`（単一スプライト追従。**ペーパードール非適用**＝完成スプライト）。
- **セーブ拡張**: `player.activePetId`, 所持ペット。
- **実機完了条件**: ペットアイテムで入手→同行（プレイヤー追従）→マップ遷移しても付いてくる。

## M11 — NPC会話（簡易）

- **データ**: `dialogue/*.json`（`{ id, lines[], choices?, conditions?, onEnd? }`）。map の `npcs[]` に `dialogueId`。
- **UI**: 会話ウィンドウ（送り/選択）。
- **実機完了条件**: NPC に話しかけると会話、必要なら分岐/フラグ更新。

## M12 — デバッグメニュー + 通し統合

- `debug/`: `Debug` オーバーレイ（ワープ/付与/Lv変更/フラグ操作）。**リリースビルドで無効化**（`import.meta.env.PROD` ガード）。
- セーブ migrate に Phase 1 フィールド（gold/skills/jobId/pets/flags/consumables/equipmentOwned）の段階補完を確定。
- **18ステップ通し**を実機（iOS/Android）で確認。`tools/validate-data` の Phase 1 検証（職業/スキル循環・レシピ結果欠落）を全面有効化。
- ヘッドレステスト拡充: drops 分布 / craft 充足 / 転職条件評価 / skill 効果合成 / migrate ラウンドトリップ。

---

## 横断的に守る検証

毎 M 後: `npm run typecheck && npm run validate-data && npm run test && npm run build`。
ロジック（drops/craft/jobs/skills/inventory/migrate）は **Phaser/DOM 非依存**に保ち Vitest で実行。
新データ種別を足すたび `validate-data` に整合チェックを追加（ID重複/参照欠落/数値範囲/循環）。

## 事前に決めたい点（着手前に確認）

1. **アート**: 〔決定〕Phase 1 は**プレースホルダー継続**。最終ドット絵は機能実装後に**一括投入**する。
   置き換え条件 = 64×96 / 基準点(32,84) / pose-atlas 行順（idle,walk,attack,cast,hurt,death × down,up,left）/
   装備は `visualId` 割当のみ。これを守れば**コード変更なしで差し替え**可能（ロジックとアートを分離）。
2. **ゴールド経済**: 入手源（売却/ドロップ/クエスト）の最小設計。M3 で `gold` を導入する前提。
3. **マップ規模**: フィールド/ダンジョンのおおよその広さ・敵数（モバイル上限12体厳守）。
4. **スキル/職業の具体**: 初期職と1次職の方向性（例: 戦士系/魔法系）と、アクティブ2+パッシブ1の効果イメージ。

これらは M1〜M2 を進めながら、該当 M の直前に確定すれば手戻りは小さい。

## 後回しにする調整（M12 の仕上げパスで Claude から必ず確認する）

機能としては成立済み。終盤に、アート投入・数値バランスと一緒にまとめて詰める。
**Claude は M12 着手時にこの一覧をユーザーに確認すること。**

- マップの雰囲気・レベルデザイン（地面/障害物/広さ/敵配置）— すべて `maps/*.json` の編集で可能。
- 「1マップ1ボス」化など進行構造の見直し（各マップ `enemies` にボス追加で対応可）。
- ドロップ率 / ゴールド入手量 / レシピコスト。
- ステータス式・経験値・敵の強さ・スキル威力/MP/CD。
- UI 配置・色・文字サイズ・操作感。
- 最終ドット絵の一括投入（規格は決定済み: 64×96 / 基準点(32,84) / pose-atlas 行順 / visualId 割当）。
