# TECH_DESIGN.md

## 0. エンジン選定の経緯

当初の指示には Godot 4.x / 型付き GDScript の記述があったが、後続の `<技術構成>` 節で「**Godot ではなく Web ネイティブ技術（TypeScript / Phaser 4.x / Vite / vite-plugin-pwa / IndexedDB / Vitest）**」と明示された。後者を最終決定として採用する。あわせて対象は **モバイル縦画面 PWA**、操作は**マルチタッチ主体**となる（PC/パッドは開発確認用）。

## 1. アーキテクチャ

レイヤード + データ駆動。Phaser の `Scene` は描画・入力・ループ管理に限定し、ゲームロジックは**エンジン非依存の純 TS** に置く（Vitest でヘッドレステスト可能）。

```
core/ (EventBus, RNG, lifecycle, pwa, safe-area)
data/ (JSON 定義 + 型ロード)        ← 単一の真実
config/ (解像度・レイヤー定数)
stats/ (computeDerived: 派生値を1か所集約)
player/ (Player[表示] / GameState[モデル])
enemies/ combat/ skills/ jobs/ inventory/ equipment/ crafting/ pets/
paperdoll/ (PaperDollAnimator + ポーズアトラス)
maps/ save/ input/ audio/ debug/ scenes/ ui/
```

- 疎結合は**型付き EventBus**（`src/core/event-bus.ts`）。イベントキーと payload を型で縛り、文字列イベント名の乱用を避ける。
- Autoload 相当のグローバルは最小限（`gameState`, `saveManager`, `bus`）。巨大クラス禁止。

## 2. データ形式と採用理由

**JSON（`src/data/defs/*.json`）+ TS 型 + 自作バリデータ** を採用。

理由:
- Web/Phaser には Godot Resource 相当がない。**Vite が静的にバンドル・PWA で precache しやすい JSON** が最適。
- `resolveJsonModule` で型付きインポートでき、`tsc` と `tools/validate-data.ts` の二段で整合を担保。
- `ItemDefinition`（不変定義）と将来の `ItemInstance`（実体）を分離し、ランダムオプション拡張に備える（Phase 1 では未実装）。
- 全データに**不変の文字列ID**。表示名は参照に使わない。

検証項目（`validate-data`）: ID 重複 / 参照先欠落（visualId・slot）/ 無効な装備スロット / 無効な派生ステータスキー / ドロップ率異常 / ポーズアトラスのシート寸法整合。職業・スキルの循環参照、レシピ結果欠落は Phase 1 で対象データ追加とともに有効化。

## 3. 主要シーンツリー（Phaser）

- `Boot`（テクスチャ生成 + セーブ読込）→ `Town`（ワールド）/ `UI`（常駐オーバーレイ）/ `Equipment`（装備変更オーバーレイ）。
- Phase 1 で `Title` / `SaveSelect` / `Preload`（マップ単位ロード）/ `BossRoom` / `Overlay`（各メニュー）/ `Debug` を追加。

## 4. ペーパードール描画方式

`PaperDollAnimator`（`src/paperdoll/`）が**単一の論理クロック**で現在の anim/dir/frame を保持し、全レイヤー Sprite に同期する。レイヤーごとの独立タイマーは作らない。

- 描画グループ14種を**向きごとの並び順テーブル**（`config/layers.ts`）で前後入れ替え（武器・手・背中の前後関係を正面/背面/横で切替）。
- 全レイヤーが同一ポーズアトラス（`paperdoll/pose-atlas.ts`）を共有 → 1つのフレームインデックスを全レイヤーへ適用。
- right は left の水平反転。基準点 x=32 が枠中心なので、各レイヤーを origin (0.5, 0.875) で反転しても整合が崩れない。
- プレイヤーのみに適用（性能要件）。メニューのプレビューも同じ Animator を再利用予定。

## 5. ステータス再計算方式

`computeDerived(base, modifiers[])`（純関数）に集約。順序: 基礎値（割振り込み）→ 職業/パッシブ → 装備の加算 → 派生式 → 派生加算 → クランプ。`GameState.recompute()` が装備から `StatModifiers[]` を組み、HP/MP は割合維持。UI も戦闘も `gameState.derived` を読むため値が食い違わない。

## 6. 職業とスキルのデータ構造（Phase 1 で投入）

- `JobDefinition`: id / display_name / tier / parent_job_ids / unlock_conditions / stat_growth / base_stat_modifiers / equippable_weapon_tags / skill_tree_id / icon_path。tier 0〜4 の分岐に対応。
- 転職条件はデータ駆動（`{type, ...}` の配列を評価器で判定）。
- `SkillDefinition`: 前提/必要職/tier/CD/MPコスト/威力倍率/参照ステータス/属性/状態異常/範囲/ノックバック/発動時間/キャンセル可否 + `effects: EffectDefinition[]`。共通 Effect を合成し、特殊挙動のみ専用クラス。

## 7. セーブ形式

IndexedDB（`src/save/`）。`SAVE_VERSION` + `migrate()` でマイグレーション、書込み前に**バックアップ**、破損時はバックアップへフォールバック。JSON 入出力可。複数タブ同時更新は Web Locks で抑止。SW キャッシュには載せない。自動保存: 装備変更/製作/転職/マップ遷移/ボス撃破/可視性 hidden/定期。

## 8. ドット絵・スケーリング

論理幅360固定、論理高さは端末比で 640〜800 にクランプ（`config/resolution.ts`）。`pixelArt`/`roundPixels`/`antialias:false`。整数ズーム + レターボックスで 1 ドットを常に正方形に保つ。最終画像が無い間はコード生成プレースホルダー（規格準拠）。

## 9. リスクと対策

- Phaser 4 API 差異 → 型定義を確認してから使用。
- iOS Safari（PWA/IndexedDB/safe-area/オーディオ） → 早期実機検証（Phase 0）。
- 縦画面の整数性 → 整数ズーム + 余白。
- タッチ誤爆 → 入力レイヤーで指IDを一元管理しキャンセル処理。
- 性能 → 敵上限・プール・画面外AI間引き・プレイヤー以外はレイヤー非適用。
- スコープ膨張 → フェーズ規約（CLAUDE.md / ROADMAP.md）。

## 10. プラグイン方針

外部プラグインへ安易に依存しない。現状の追加依存は `tsx`（ツール実行）のみ。採用時は理由を本書に記録する。
