# VISUAL_GUIDE.md — ビジュアル設計書（UI / アートガイド）

最終更新: 2026-07-03。「安っぽさ」を排し、ドット絵の世界＋現代的UIで統一するための一次資料。
**ここに書いた数値・方針は、UI/アートを触る前に必ず参照する。** 迷ったら
`src/ui/theme.ts`・`src/assets/gen/textures.ts`・`src/maps/map-builder.ts` が実装上の真実。

---

## 0. 基本方針（3行）

1. **世界はドット絵のまま**（96×96キャラ / 32×32タイル / ニアレスト / 整数座標 / 回転・自由スケール・ぼかし無し）。
2. **UI（HUD・メニュー）はドット絵に縛られない** → 端末ネイティブの丸ゴシック＋角丸ソフトパネル。
3. **役割は一目で分かる形にする**（NPC描き分け・施設の庇/看板・接地影・光源統一）。

CLAUDE.md の不変ルール（フレーム寸法・pixelArt設定・データ駆動・CDN禁止）が上位。本書はその中の「見た目の作り方」を定める。

---

## 1. フォント（`src/ui/theme.ts`）

| 定数 | 用途 | 値 |
|---|---|---|
| `FONT` | HUD・メニュー本文（既定） | `'Hiragino Maru Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic','YuGothic',system-ui,sans-serif` |
| `FONT_PIXEL` | タイトル/ロゴのみ | `'DotGothic16',system-ui,sans-serif` |

- **原則**: 新規UIテキストは `FONT` を使う。ドット文字（`FONT_PIXEL`）はタイトル画面だけ。
- CDN禁止のため Web フォントは足さない。端末ネイティブ書体に乗る（iOS=Hiragino、Android=Noto）。
- Phaser はテキストをcanvasに焼くので、フォント確定後にシーン生成すること（`main.ts` で `document.fonts.load` 済み）。

---

## 2. カラーパレット（`UI` in theme.ts）

**塗り（number）**: `overlay 0x0e0f1a` / `panel 0x10121c` / `divider 0x333a5a`
**文字（string）**: `white #ffffff` / `sub #9aa0b5` / `gold #ffd86b` / `good #9fe3a0` / `bad #e58a8a` / `link #9fd0ff` / `accent #c8b6ff`

用途ルール:
- **金 `#f5c542 / #ffd86b`** = 通貨・確定アクション・アクティブ強調（使いすぎない。細い金ヘアラインは“レトロ”に見えるので線ではなくアクセントで）。
- **緑 `good`** = 可能/成功/装備可。**赤 `bad`** = 不足/危険。**青系 `link`** = タップ可能。
- パネル本体は濃紺グラデ（`#333c5c → #1c2238`）。

---

## 3. 共通UI部品（すべて `theme.ts`。新規UIは必ずこれを使う）

### 3.1 `ninePanel(scene, cx, cy, w, h, opts?)`
- 9スライスの角丸パネル。テクスチャ `TEX.uiFrame`（48×48・角スライス `UI_FRAME_SLICE=16`）から描画。
- **ドロップシャドウ自動付与**（同フレームを `+4y`・`0x000000`・α0.28 で背後に）。パネルdestroy時に影も消える。
- `opts.active===false` で淡色ティント `0x8890a8`（空き/無効カード）。
- テクスチャ欠落時のみ矩形（`0x141726` α0.94 ＋ストローク）にフォールバック。
- **`public/assets/ui/frame.png`（48×48・角約16px）を置けば全パネル一括差し替え**。

### 3.2 `pillButton(scene, x, y, label, onTap, opts?)`
- 角丸ボタン（Container を返す）。`opts = { color, bg, size }`。既定 `bg '#2a3050'`。
- 構成: 影(α0.25)＋本体＋上部つや(α0.1)＋境界(白α0.16)。押下で `scale 0.96` フィードバック。
- **スクロール一覧内で使う場合**、onTap 側で `if (this.dragged) return;` を必ず入れる（ボタン自体はドラッグ判定を持たない）。

### 3.3 `tabChip(scene, cx, cy, width, label, onTap) → { root, setActive(bool) }`
- 角丸タブ。高さ30、角丸 上9/下4。
- アクティブ: 明色 `0x37406a`＋**金の下線 `0xf5c542`**＋文字白。非アクティブ: `0x191d30` α0.8＋文字 `#a7adc2`。
- `root.setDepth(3)` して使う。切替時は各タブの `setActive(id===current)`。

### 3.4 `rowBand(scene, y, height, index)`
- 一覧の行ごとの角丸カード（交互色 `0x222741 / 0x1a1e33` α0.92、角丸8、境界 白α0.05）。全幅ベタ帯は使わない。

### 3.5 `addPanelChrome(scene, viewTop, viewBottom)`
- スクロールメニューの上下カバー（depth 0/2）＋淡い白ディバイダ（depth 3、α0.1/0.08）。金ヘアラインは廃止。
- スクロール一覧は depth1、ヘッダ/フッタUIは depth≥3。

### 3.6 `addSceneBackdrop(scene, dim=0.72)`
- フロント画面（タイトル/セーブ選択）用。草tileSprite＋濃紺グラデ48バンド＋周辺ビネット（depth -100〜-98）。

---

## 4. HUD 配置（`src/scenes/ui-scene.ts`、depth 1000〜）

基準 `hudX = insets.left + 8`。safe-area を尊重（下端ボタンをホームインジケータに重ねない）。

| 要素 | 位置(y = insets.top+…) | 仕様 |
|---|---|---|
| HPバー | +4 | 幅152×高16、角丸6、track `0x0e1220` α0.92、fill橙 `0xef8a3c`、scaleX で増減 |
| MPバー | +24 | 同上、fill青 `0x3aa0e0` |
| Lv/職業箱 | +44 | 角丸6の暗箱＋文字 |
| EXPバー | +64 | 同上、fill金 `0xf5c542` |
| 所持金 | +86 | 金貨(円)＋数値 |
| クエストカード | +106 | 176×42 角丸、左に金アクセントバー、目標名＋進捗 |

**右下操作**（`baseX = w - insets.right - 44`, `baseY = h - bottomPad - 44`）:
攻撃32r（最優先）／スキルS1 28r・S2 26r／回避。**右上**: バッグ・マップ 22r（`w - insets.right - 24`）。

> TODO（未実装・受入基準）: **町(安全地帯)では攻撃以外の戦闘ボタンを淡色化**して情報量を下げる。

---

## 5. 光源ルール（全ワールド共通）

- **太陽は左上（top-left）**。ハイライトは上/左、シェードは下/右、**接地影は右下へ**落とす。
- 建物: 左壁に微ハイライト（白α0.06・5px）、右壁にシェード（黒α0.14・5px）、屋根トップに稜線ハイライト。
- 例外を作らない（キャラの塗りも上を明るく）。

---

## 6. 接地影（“浮き”を消す。必須）

すべての立ちオブジェクトに楕円の接地影を付ける。depth はオブジェクト直下。

| 対象 | 楕円 | α | 位置 |
|---|---|---|---|
| プレイヤー/NPC | 22×8 | 0.22 | 足元 |
| 木 | 26×9 | 0.2 | `py+14`、depth `round(py)-1` |
| 建物 | `w*0.96`×16 | 0.18 | `(cx+4, y+h+3)`、depth `y+h-1`（右下寄せ） |

---

## 7. 看板・施設ドレッシング（`src/maps/map-builder.ts`）

### 7.1 NPC名看板（`world-scene.spawnNpc`）
- 頭上の木看板 `TEX.sign`（プレート＋ロープ）。`displaySize=(文字幅+18)×20`、`y-80`（頭より上）。
- 文字は焼き込み風クリーム `#fbe7c2` / 11px。**浮き白テキストは禁止**。

### 7.2 施設の庇＋吊り看板（`BuildingDef.shop`）
`shop: 'equip' | 'craft' | 'guild' | 'house'`。`house` は装飾なし。

| shop | 庇ストライプ | 吊り看板アイコン |
|---|---|---|
| equip（装備屋） | 赤 `#b34a3a` / クリーム `#e8d8b0` | 剣 |
| craft（鍛冶屋） | 茶 `#8a5a30` / タン `#d8b878` | 槌 |
| guild（ギルド） | 青 `#3a5aa0` / クリーム `#e4dcc0` | 盾 |

庇=8pxストライプ＋スカラップ縁、吊り看板=ロープ＋木板＋アイコン。`drawShopFront/drawShopIcon` 参照。

> TODO: 店先小物（樽・木箱・立て看板）、`signPost`（地面に刺さる立て看板）。

---

## 8. NPC 描き分け（`src/assets/gen/textures.ts` の `drawNpc`）

役割ごとに別テクスチャ。アウトライン `#1a1526`＋陰影＋顔（目・口）付きチビ（64×96、足元原点0.5,0.875）。

| action | テクスチャ | 見た目 |
|---|---|---|
| equip | `TEX.npcMerchant` | 緑エプロンの商人 |
| craft | `TEX.npcSmith` | 赤服＋バンダナの鍛冶屋 |
| job | `TEX.npcGuild` | 青制服＋帽子のギルド |
| quest | `TEX.npcElder` | 紫ローブ＋白ひげの長老 |
| （その他/会話） | `TEX.npcVillager` | 村人（labelハッシュで微ティント変化） |

---

## 9. タイル（`textures.ts`）

- **草 `TEX.tileGrass`**: 低コントラストの落ち着いた芝（キャラが埋もれない）。base `#3a6a40`。
- **草2 `TEX.tileGrass2`**: 近似色 `#3d6d43`。`buildMap` が大パッチ(96–200px, α0.7)をシード配置し単一タイル反復を緩和。
- **道 `TEX.tilePath`**: 踏み固めた土 `#6b5a3c`＋小石＋轍。`drawPathEdges` で縁を手荒く。
- 追加時も「低コントラスト・整数・ニアレスト」を厳守。

> TODO: 道の分岐・石畳広場・草↔道の遷移タイル。

---

## 10. Depth（描画順）レイヤー規約

| depth | 内容 |
|---|---|
| -1000 | 地面 tileSprite（草/石/床）＋草2パッチ |
| -999 | 道 |
| -998 / -997 | 道の縁 / 散布装飾 |
| `round(py)-1`, `y+h-1` | 木・建物の接地影 |
| `round(y)` | 木・建物・NPC・プレイヤー（Yソート） |
| 5 / 6 / 7 | ポータル門 / 矢印・粒子 / ポータル名（ピル6・文字7） |
| `round(y)+1 / +2` | NPC看板 / 看板文字 |
| 1000+ | HUD（UIScene） |

---

## 11. アセット後差しパイプライン（`src/assets/manifest.ts`）

- `public/assets/...` に PNG を置くだけで手続きプレースホルダを**無改修で差し替え**（Boot が preload、`ensureGeneratedTextures` は欠けたキーだけ生成）。
- 主な差し替えキー: `ui/frame.png`(48×48 9スライス枠)、`env/npc_*.png`(64×96 役割NPC)、`env/sign.png`、`tiles/grass*.png`。
- キャラ/装備/敵は96×96ポーズアトラス（`ART_SPEC.md`準拠）。

---

## 12. 受入基準（この画面は「完成見本」か？）

- [ ] キャラ・建物が草に埋もれない（背景と前景のコントラスト十分）
- [ ] 立ちオブジェクトすべてに接地影
- [ ] 光が全て左上から（影は右下）
- [ ] 施設が一目で用途判別できる（庇＋アイコン看板）
- [ ] ワールドに“浮き白テキスト”が無い（看板/ピルに載っている）
- [ ] UIが角丸・ソフト・丸ゴシックで統一（フラットな四角箱が無い）
- [ ] （TODO）町で戦闘UIが主張しすぎない

## 13. やらないこと

3D化 / 自由回転 / 非整数スケール / ぼかし / 生成AI級の描き込み前提の設計 /
既存作品の模倣 / 戦闘システムやデータ構造の変更（本書はあくまで見た目の規約）。
