# REMAKE_KIT.md — このゲームを1から作り直すための完全キット

現行版（chhhhhhho）の開発で確定した仕様・学び・ハマりどころを全部まとめた「リメイク開始パック」。
新しいリポジトリ／新しいAIセッションに **§1 のマスタープロンプトを貼るだけ**で開発を開始できる。
§2 以降は参照資料（新リポジトリの docs/ にコピー推奨）。

---

## §1. マスタープロンプト（そのまま貼る）

```
モバイル縦画面専用のPWAアクションRPGを新規リポジトリで開発してください。

## コンセプト
- チョコットランド風（職業・ペット・かわいいドット絵・低い操作難度）を土台に、
  モンスターハンター風の「狩猟クエスト→ボス素材収集→専用武器クラフト」ループを核にする。
- エンドゲームはMH4Gギルドクエスト風のランダム性能装備ハクスラ（後期実装だが型は初日に設計）。
- 既存作品の名称・キャラ・素材・固有デザインは模倣しない。すべてオリジナル。

## 技術スタック（正確に固定すること）
- Phaser 4.2.0 / TypeScript 6.x（strict、any禁止）/ Vite 8 / Vitest 4 / vite-plugin-pwa 1
- セーブは IndexedDB（Service Workerキャッシュに入れない）
- 依存は package.json に正確なバージョンで固定し package-lock.json をコミット。CDN直読み禁止。
- Phaser API は推測で使わず node_modules/phaser/types/phaser.d.ts を確認してから使う。

## 画面・ドット絵の不変仕様（一度決めたら変更しない）
- 論理解像度: 幅360固定、高さは端末比率に追従して640〜800にクランプ。整数倍率＋レターボックス。
- pixelArt: true / roundPixels: true / antialias: false。描画座標は整数に丸める。
  自由回転・非整数拡縮・ぼかし禁止。
- タイル 32×32。キャラフレーム 96×96、足元基準点 (48,84)。
- キャラのポーズアトラス: 1枚 384×1728px ＝ 横4列×縦18行。
  行の並び: down[idle2,walk4,attack4,cast4,hurt2,death4] → up同順 → left同順。
  right は left の setFlipX(true)。frameIndex = 行番号*4 + フレーム番号。
  アニメ定義: idle 2f/3fps loop, walk 4f/8fps loop, attack 4f/14fps,
  cast 4f/10fps, hurt 2f/8fps, death 4f/8fps。

## アーキテクチャの絶対ルール
1. データをハードコードしない。アイテム/装備/レシピ/職業/スキル/敵/ドロップ/クエスト/マップ/
   ペット/SE/ボス行動 は src/data/defs/*.json に定義。全データに不変の文字列ID。
2. 派生ステータス計算は src/stats/stats.ts の computeDerived 1か所のみ。
3. 巨大クラス禁止。責務ごとにモジュール分割し、疎結合連携は型付きEventBus
   （イベント名とペイロードを interface で定義）のみで行う。
4. プレイヤーの見た目は「職業固定」方式。装備は性能のみ変える（見た目に反映しない）。
   職業defに appearance フィールド→テクスチャキー。PNGが無い職はデフォルト素体にフォールバック。
5. 敵・NPC・ペットは完成済み単一スプライト（レイヤー合成しない）。
6. アセットは「プロシージャル・プレースホルダー→PNGを public/assets に置くだけで自動上書き」
   方式にする（Boot が実PNGを先に読み、生成器は不足キーだけ埋める）。
7. ゲームロジック（stats/save/drops/leveling/equipment/elements/クエスト進行）は Phaser/DOM
   非依存の純TSに保ち、Vitestでヘッドレステストする。Phaser依存はシーン/アクター層に閉じ込める。
8. 変更のたびに必ず: npm run typecheck / npm run validate-data / npm run test / npm run build。
   validate-data は tools/ に自作（ID重複・参照切れ・範囲外値・素材入手可能性を検証し非0で落ちる）。

## モバイル/PWA
- 縦画面専用。横画面ではポーズ＋警告オーバーレイ。
- safe-area インセット尊重。ホームインジケーターに操作ボタンを重ねない。
- 仮想スティック＋攻撃/スキル2/調べるボタン。input.activePointers: 4 以上（マルチタッチ必須）。
- タブ/PWA非表示で一時停止＋自動保存。新バージョンは戦闘中に適用せずタイトル復帰時に適用。
- 画面内通常敵は最大12体。ダメージ数字/投射物/ドロップはオブジェクトプール。
- UIフォントは日本語ドットフォント（DotGothic16をpyftsubsetでサブセット化→woff2自己ホスト、
  ゲーム起動前に document.fonts.load で待つ。タイムアウト1.5sでフォールバック起動）。
- 効果音はWebAudioプログラム合成（音源ファイル不要）。SE定義は純データ＋再生エンジン分離。
  初回タップでunlock、非表示でsuspend、同一SEレート制限、タイトルにON/OFF（localStorage）。

## ゲームシステム仕様
- ステータス: base(STR/VIT/INT/DEX/LUK)＋レベル＋職業補正＋装備＋パッシブ → computeDerived で
  maxHp/maxMp/physAtk/magAtk/def/magDef/accuracy/evasion/critRate/atkSpeed/moveSpeed。
- 職業: 1次職5系統（戦士/魔法/僧侶/盗賊/テイマー）→4次職までのツリー（計21職目安）。
  マルチジョブ育成・転職。武器タグ制限（12種: sword/axe/spear/katana/staff/wand/mace/dagger/
  whip/shuriken/bow/shield）と防具の系統制限、レア度→職業tierゲート。
- スキル: 系統別ツリー（前提技・必要Lv・系統ロック・職位minTierロック）。
  ★スキル効果は初日からデータ駆動の効果型で設計する:
  damage / heal / buff(持続) / projectile / summon を effect フィールドで表現（実装は段階的でよい）。
- 属性・状態異常（初日から使う）: 火/氷/雷/毒/聖/闇＋無。敵に弱点(×1.5)/耐性(×0.5)。
  属性ヒットで状態異常（火傷/毒=DoT 500ms刻み、凍結/麻痺=行動停止。発生率28%、弱点時1.5倍）。
  武器に element、スキルは skill.element 優先→無ければ武器属性。ダメージ数字を属性色に。
- クエスト: 「通常」と「大型狩猟」の2枠＋★ランク1〜7（ランクごとに星の色を変える）。
  大型狩猟=受注→専用アリーナへ出発→ボス討伐→反復可（素材周回）。ボスごとに専用アリーナ。
- ボス: 看板ボス12体、Lv6〜80に分散。各ボスに固有素材→専用装備レシピ。
  ★初日からボス行動パターンをデータ駆動にする: 予告円→範囲攻撃、突進、弾幕、取り巻き召喚、
  HP50%で怒りモード。体当たりだけのボスにしない（前作最大の反省点）。
- 装備: 9スロット（頭/胴/手/腰/足/背/武器/装飾1/装飾2）。装飾は指輪（攻撃系）と護符（防御系）
  の2ライン。レア度R1〜R10（色帯導出）。
- クラフト: 直接生産＋強化（下位装備消費）。全レシピ素材が入手可能かをテストで常時検証。
- ドロップ: データ駆動テーブル＋seedable RNG＋ボス初回確定ドロップ＋レア演出。
- 進行: 1職を4次職まで約20時間。テストで総EXP÷想定時給が20h帯に収まることを検証。
- エンドゲーム（後期）: ItemInstance（ランダム性能の装備個体）をセーブスキーマに初日から
  用意しておく（後付けが最大の改修になるため）。

## 開発順序
Phase 0: 基盤縦切り（起動→町→フィールド→敵1体→ドロップ→装備→セーブ→PWA）＋SE＋検証ツール。
Phase 1: コアループ（職業5・スキル・クラフト・クエスト・ボス1体を行動パターン付きで）。
Phase 2: 拡張（ボス12・ランク・属性の実データ・装飾・ペット・2次職〜）。
Phase 3: エンドゲーム（調査クエスト・ランダム装備・分解・強化）。
各フェーズ完了条件を docs/ROADMAP.md に書き、フェーズ外の大規模機能を勝手に足さない。

まず Phase 0 の実装計画を示してから着手してください。
```

---

## §2. 現行リポジトリから流用できる資産

リメイクでもそのままコピーして使えるもの（作り直し不要）:

| 資産 | 場所 | 備考 |
|---|---|---|
| 職業スプライト6枚 | `public/assets/char/*.png` | 素体＋戦士/魔法/僧侶/盗賊/テイマー。384×1728仕様そのまま |
| 日本語ドットフォント | `public/assets/fonts/dotgothic16-subset.woff2` | 45KB。ただし新規テキストの文字が欠けたら再サブセット |
| 全ゲームデータ | `src/data/defs/*.json` | 装備149/レシピ258/敵22/クエスト34/スキル38/職業21/マップ19/ドロップ21表 |
| SE定義 | `src/audio/sfx-defs.ts` | 12種のシンセパッチ。エンジンごと流用可 |
| 属性ロジック | `src/combat/elements.ts` | 純TS。そのまま移植可 |
| 検証ツール | `tools/validate-data.ts` | スキーマに合わせて調整 |
| 設計文書 | `docs/*.md` | GAME_DESIGN / DATA_SCHEMA / ART_SPEC / ROADMAP ほか |

データJSONを流用すれば「コンテンツ量ゼロからのやり直し」を避けられる。
構造を変えたい部分だけ移行スクリプトを書くのが最短。

---

## §3. PixelLab 用プロンプト（キャラ絵の再生成）

### 手順（前作で確立した流れ）
1. PixelLab でキャラを生成（下記プロンプト）。参考画像があれば「この画像の雰囲気に似せる」形式が最も安定。
2. **Rotations（8方向）** と **Animations: Breathing Idle / Walking / Lead Jab** をエクスポート。
3. zip を渡す → 変換スクリプトで 96×96 へ **NEAREST縮小＋足元 y≈84 に整列**し、
   384×1728 のポーズアトラスに合成（south→down行、north→up行、west→left行。right は実行時反転）。
   ※PixelLab の出力サイズは 96〜144px とエクスポートごとにバラつくので毎回位置合わせが要る。

### 素体（ベース）プロンプト例
```
chibi pixel art RPG character, bald hero with simple face, plain beige undershirt
and short pants, barefoot, cute proportions (large head, small body),
clean 1px outline, flat cel shading, transparent background, game sprite
```

### 職業見た目プロンプトの型
```
chibi pixel art RPG character, {職業の説明}, cute proportions (large head, small body),
clean 1px outline, flat cel shading, transparent background, game sprite
```
- 戦士: sturdy warrior with small iron sword and round shield, red tunic, leather boots
- 魔法使い: little mage with pointed blue hat and wooden staff, star pattern robe
- 僧侶: gentle priest with white and gold vestments, small mace, calm face
- 盗賊: nimble thief with dark green hood and twin daggers, light leather armor
- テイマー: friendly beast tamer with fluffy scarf, whip at belt, animal-motif satchel

### 敵の固有絵（リメイクで最初からやると画面が締まる）
同じ型で「enemy sprite, {敵の説明}, side view friendly-cute but slightly menacing」。
まず看板ボス12体分だけでも固有絵にする。通常敵はプロシージャル色替えでも成立する。

---

## §4. 前作で踏んだ地雷（必読・時間を溶かした順）

1. **Phaser 4 の白フラッシュ**: `setTintFill(color)` は存在しない（引数なし）。
   正解は `sprite.setTint(color).setTintMode(Phaser.TintModes.FILL)`。
2. **flipX＋サブピクセル座標＝モバイルGPUでフレームが半分欠ける**。
   物理ボディ（小数座標）と描画スプライト（整数スナップ）を分離し、描画側だけ Math.round する。
3. **日本語の wordWrap が効かない**: Phaser のデフォルトはスペース折返し。
   `wordWrap: { width, useAdvancedWrap: true }` が必須。
4. **マルチタッチ既定1本**: スティック押しながらボタンが無反応になる。`input.activePointers: 4`。
5. **フォントはゲーム起動前にロード**: Phaser はテキストをcanvasに焼くので後からフォントが来ても
   反映されない。`document.fonts.load` を待ってから `new Phaser.Game`（タイムアウト付き）。
6. **ジオメトリマスクが不安定**（このビルド構成では効かないことがある）。
   スクロールUIは「不透明のヘッダー/フッターバーで覆う」方式が確実。
7. **PWAの古いキャッシュ**: 「直したのに直ってない」の大半はこれ。更新はタイトル復帰時に適用、
   検証時はハードリロード。「全方向対応してない」バグの正体も旧アセットのキャッシュだった。
8. **PixelLab出力はサイズ不定**（96/120/128/132/144px混在）。毎回 NEAREST 縮小＋足元整列が必要。
9. **データ数のテストは総数一致で書くと増築のたびに壊れる**。「〜以上」や性質検証
   （全レシピ素材が入手可能、等）で書く方が保守しやすい。総数一致は意図的な棚卸しにだけ使う。
10. **GitHub Pages はサブパス配信**: アセットURLは必ず `import.meta.env.BASE_URL` を前置。

---

## §5. 前作の設計反省（リメイクで最初から直すべきこと）

1. **ボスが体当たりしかしない**（最大の反省）。行動パターン（予告→範囲攻撃/突進/弾/召喚/怒り）を
   ボスdefのデータとして初日に設計する。図形描画で作れるので絵は不要。
2. **スキルが全部「前方ダメージ」**。effect型（damage/heal/buff/projectile）をスキーマに初日から
   持たせる。実装は後回しでもデータの形だけ先に決める。
3. **element フィールドを長期間未使用のまま放置した**。属性は Phase 1 から使う。
4. **ItemInstance（ランダム個体装備）を後回しにするとセーブスキーマ改修が最大の工事になる**。
   セーブに instances 配列だけ最初から確保しておく。
5. **SEが無い期間が長く「安っぽい」印象の主因になった**。WebAudio合成SEはPhase 0で入れる。
6. **装飾スロットを空のままUIに出していた**。スロットを出すならアイテムも同時に用意する。
7. **ペーパードール（装備見た目合成）は作ったが職業固定見た目に移行して破棄した**。
   リメイクでは最初から職業固定（装備=性能のみ）でよい。工数が大幅に浮く。

---

## §6. 検証体制（前作で機能したのでそのまま推奨)

- `npm run typecheck` — strict TS
- `npm run validate-data` — 自作バリデータ: ID重複/参照切れ（visualId・ドロップ→アイテム・
  レシピ→素材・クエスト→敵/マップ・スキル前提の循環）/範囲外値（rank1-7, rarity R1-10,
  element/weakness/resist）を検証
- `npm run test` — 純ロジックのVitest（stats/drops/save/progression/supply/walkthrough）
  - walkthrough.test: 序盤の導線を18ステップでシミュレートする通しテスト
  - supply.test: 全レシピ素材が「ドロップ or 他レシピ産出」で入手可能か
  - progression.test: 転職までの総EXPが想定プレイ時間に収まるか
- `npm run build` — tsc＋vite build＋PWA生成
- 実機相当の確認: Playwright headless Chromium（--use-gl=swiftshader）で起動→
  page.evaluate から EventBus を叩いてスモーク

---

## §7. 現行版の最終状態（リメイクの比較基準）

2026-07 時点: 装備149（武器77/防具48/ボス専用12/装飾12）、レシピ258、敵22（看板ボス12）、
クエスト34（2枠＋★1-7）、職業21、スキル38、マップ19（アリーナ12）、ペット1、
属性・状態異常、SE12種、テスト26ファイル118件。未実装: BGM、ボス行動パターン、
スキル個別効果、エンドゲーム（調査装備）、2次職以降の見た目、敵の固有絵。
詳細は docs/STATUS.md。
