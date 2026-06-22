# Pixel Action RPG (working title)

モバイルファースト・縦画面専用の 2D ドット絵セミオートアクションRPG。完全オリジナル作品（既存作品の素材・固有デザインは使用しない）。Web ネイティブ技術で実装し、PWA としてオフライン動作する。

> 注: 当初の指示には Godot 向けの記述もあったが、`<技術構成>` 以降の指定により **Web ネイティブ（TypeScript + Phaser）** を採用している。詳細は `docs/TECH_DESIGN.md`。

## 技術スタック（バージョン固定）

| 種別 | 採用 |
|---|---|
| 言語 | TypeScript 6.0.3（型付き） |
| ゲームエンジン | Phaser 4.2.0 |
| ビルド | Vite 8.0.16 |
| PWA | vite-plugin-pwa 1.3.0 |
| テスト | Vitest 4.1.9 |
| 保存 | IndexedDB（自作の薄いラッパー） |

`package-lock.json` をコミット対象とし、CDN からのライブラリ読み込みは行わない。

## 対象環境

- スマートフォン専用に近いモバイルファースト／**縦画面専用**
- iPhone Safari / Android Chrome、各 PWA（ホーム画面へ追加）
- 完全シングルプレイヤー・オフライン対応
- メイン操作はマルチタッチ（キーボード/マウスは開発確認用）

## セットアップ

```bash
npm install          # 依存をインストール（lock 固定）
npm run dev          # 開発サーバ（http://localhost:5173）
npm run build        # 型チェック + 本番ビルド（PWA 生成）
npm run preview      # 本番ビルドのプレビュー（PWA/SW の確認はこちら）
npm run test         # Vitest（ロジックのヘッドレステスト）
npm run validate-data  # データ検証（CI/起動前チェック）
npm run typecheck    # tsc --noEmit
```

ツール:

```bash
npx tsx tools/gen-icons.ts   # PWA アイコン（プレースホルダー）を再生成
```

## 現在の状態: Phase 0（実機検証用の縦切り）

実装済み:

- 縦画面スケーリング（論理幅360固定 / 高さ可変 / 整数ズーム + レターボックス）
- ドット絵設定（Nearest / roundPixels / アンチエイリアス無効）
- 横画面警告・safe-area 対応・スクロール/ズーム抑止
- 仕様準拠のプレースホルダー画像をコード生成（64×96 フレーム / 基準点(32,84)）
- プレイヤー移動・仮想スティック・マルチタッチボタン
- 通常攻撃 + スキルボタン1（前方範囲）
- 敵（スライム）の有限状態機械 / 接触ダメージ / ノックバック
- 素材ドロップと取得・経験値
- ペーパードール（頭/胴/武器レイヤー）+ 装備変更画面（即時反映）
- IndexedDB セーブ/ロード（バージョン・マイグレーション・バックアップ）
- 可視性変化・装備変更・定期での自動保存
- PWA（standalone / portrait-primary / オフライン / 更新通知）

詳細な進行は `docs/ROADMAP.md` を参照。Phase 0 が実機で安定するまで Phase 1 のコンテンツ拡張は行わない。

## ディレクトリ

```
src/
  config/      解像度・レイヤー定数（単一の真実）
  core/        EventBus / RNG / ライフサイクル / PWA / safe-area
  assets/gen/  プレースホルダー画像のコード生成
  paperdoll/   PaperDollAnimator + ポーズアトラス
  stats/       StatCalculator（派生値計算を集約）/ レベリング
  player/      Player / GameState（中央モデル）
  enemies/     敵 FSM
  combat/      ダメージ数字（プール）
  inventory/ equipment/ crafting/ pets/ skills/ jobs/  （順次拡張）
  data/        JSON 定義 + 型ロード
  save/        IndexedDB / スキーマ / マイグレーション
  input/       仮想スティック / タッチボタン / 入力状態
  scenes/      Phaser シーン群
tools/         データ検証・アイコン生成
tests/         Vitest
docs/          設計ドキュメント
```

## 操作（開発時キーボード）

WASD/方向キー=移動、J=通常攻撃、K=スキル1、E=調べる（装備屋）、Esc=閉じる。
