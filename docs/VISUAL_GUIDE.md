# VISUAL_GUIDE.md — ビジュアル設計書（UI / アートガイド）

最終更新: 2026-07-03（rev.2）。「安っぽさ」を排し、ドット絵の世界＋現代的UIで統一するための一次資料。
**UI/アートを触る前に必ず参照する。** 実装上の真実は
`src/ui/theme.ts`・`src/assets/gen/textures.ts`・`src/maps/map-builder.ts`・`src/scenes/ui-scene.ts`。

> rev.2 の変更: HUDは`statusPanel`統合／町の戦闘UI淡色化を必須化／NPC素材96×96固定／接地影はテクスチャ／
> `HUD_DEPTH=100000`／NPC看板は足元基準計算／`BuildingDef`拡張(props/npcType/shadowType/signIcon)／村画面Phase分解。

---

## 0. 基本方針（3行）

1. **世界はドット絵のまま**（96×96キャラ / 32×32タイル / ニアレスト / 整数座標 / 回転・自由スケール・ぼかし無し）。
2. **UI（HUD・メニュー）はドット絵に縛られない** → 端末ネイティブの丸ゴシック＋角丸ソフトパネル。
3. **役割は一目で分かる形にする**（NPC描き分け・施設の庇/看板/小物・接地影・光源統一）。

CLAUDE.md の不変ルール（フレーム寸法・pixelArt設定・データ駆動・CDN禁止）が上位。本書はその中の「見た目の作り方」を定める。

---

## 1. フォント（`src/ui/theme.ts`）

| 定数 | 用途 | 値 |
|---|---|---|
| `FONT` | HUD・メニュー本文（既定） | `'Hiragino Maru Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic','YuGothic',system-ui,sans-serif` |
| `FONT_PIXEL` | タイトル/ロゴのみ | `'DotGothic16',system-ui,sans-serif` |

- 新規UIテキストは `FONT`。ドット文字はタイトル画面だけ。
- CDN禁止のため Web フォントは足さない。端末ネイティブ書体に乗る（iOS=Hiragino、Android=Noto）。

---

## 2. カラーパレット（`UI` in theme.ts）

**塗り**: `overlay 0x0e0f1a` / `panel 0x10121c` / `divider 0x333a5a`
**文字**: `sub #9aa0b5` / `gold #ffd86b` / `good #9fe3a0` / `bad #e58a8a` / `link #9fd0ff` / `accent #c8b6ff`
**パネル本体**: 濃紺グラデ `#333c5c → #1c2238`。金は「線」でなく「アクセント」で使う（細い金ヘアラインはレトロに見える）。

---

## 3. 共通UI部品（`theme.ts`。新規UIは必ずこれを使う）

- **`ninePanel(scene,cx,cy,w,h,opts?)`**: 9スライス角丸パネル（`TEX.uiFrame` 48×48・スライス`UI_FRAME_SLICE=16`）＋影自動。`active:false`で淡色。`public/assets/ui/frame.png`で全パネル一括差替。
- **`pillButton(...)→Container`**: 角丸ボタン。押下`scale0.96`。一覧内は onTap 側で`if(this.dragged)return;`必須。
- **`tabChip(...)→{root,setActive}`**: 角丸タブ。アクティブ=明色`0x37406a`＋金下線`0xf5c542`。
- **`rowBand(...)`**: 行ごとの角丸カード（交互色）。
- **`addPanelChrome`**: 上下カバー＋淡い白ディバイダ（金線廃止）。
- **`addSceneBackdrop`**: フロント画面用（草＋濃紺グラデ＋ビネット）。

---

## 4. HUD（`src/scenes/ui-scene.ts`）

### 4.1 深度（絶対規約）
```
export const HUD_DEPTH = 100000;   // ワールドのYソート(最大でもround(y)≈数千)と絶対に競合しない
```
- **HUD要素は必ず `HUD_DEPTH` 以上**（`HUD_DEPTH + n` の小オフセットで層分け）。旧 `depth=1000` は廃止。
- 危険ビネット等の全画面演出は `HUD_DEPTH - 1`。

### 4.2 statusPanel（HP/MP/EXPは個別配置禁止・必ず統合）
**HP/MP/EXP/Lv/職業を単独で置かない。すべて `statusPanel` コンテナに集約する。**

| 項目 | 値 |
|---|---|
| 位置 | `x = insets.left + 8`, `y = insets.top + 8`（左上・safe-area尊重） |
| サイズ | `w = 196〜216`（既定206）, `h = 92〜108`（既定100） |
| 背景 | `ninePanel(scene, x+w/2, y+h/2, w, h)`（中心アンカーに注意） |
| 左 | 顔アイコン or 職業アイコン **40〜48px**（既定44、角丸フレームセル。職業family絵柄をtint） |
| 右 | 上から `Lv ○ 職業名` → HPバー → MPバー → EXPバー（細め） |
| 所持金 | **panel下部** または **panel直下の小pill**（金貨アイコン＋数値） |

- 参照保持: `this.hpBar/mpBar/expBar`(fill Rectangle, `scaleX`更新)・`this.hpText/mpText/expText/jobText/goldText`。
- バーは角丸トラック（暗`0x0e1220`α0.92＋影）＋fill（HP橙`0xef8a3c`/MP青`0x3aa0e0`/EXP金`0xf5c542`）。値は各バー右端に小さく重ねる（shadow付き）。
- コンテナは `Phaser.GameObjects.Container` を1つ作り、子は相対座標。`container.setDepth(HUD_DEPTH)`。

### 4.3 クエストトラッカー
statusPanel直下に角丸カード（左に金アクセントバー、目標名＋進捗）。`HUD_DEPTH`基準。

### 4.4 操作ボタン
`baseX = w - insets.right - 44`, `baseY = h - bottomPad - 44`。攻撃32r（最優先）／スキルS1 28r・S2 26r／回避。右上=バッグ・マップ22r。**§12の淡色化ルールに従う。**

---

## 5. 光源ルール（全ワールド共通）

- **太陽は左上（top-left）固定**。ハイライトは上/左、シェードは下/右、**接地影は右下へ**。
- 建物: 左壁ハイライト（白α0.06・5px）＋右壁シェード（黒α0.14・5px）＋屋根稜線。例外を作らない。

---

## 6. 接地影（テクスチャ方式・必須）

**Graphics楕円は使わない。事前生成テクスチャ `TEX.groundShadow`（またはPNG後差し）を `Image` で置く。**

- `TEX.groundShadow`: 48×20 程度の楕円ソフトシャドウを**一度だけ**canvas生成（中心濃く外周へα減衰）。`public/assets/env/shadow.png`で差替可。
- 使い方: 各立ちオブジェクトの足元に `scene.add.image(x, footY, TEX.groundShadow).setDisplaySize(sw, sh).setDepth(round(footY)-1)`。整数座標・ニアレスト厳守。
- サイズは `shadowType`（後述）で決定: `soft`(既定) / `hard`(濃い小さめ) / `none`。

| 対象 | 目安 displaySize | 由来 |
|---|---|---|
| プレイヤー/NPC | 22×8 | 足元 |
| 木 | 26×9 | `shadowType` |
| 建物 | `w*0.96`×16 | `shadowType`、右下寄せ(+4,+3) |

---

## 7. 看板・施設ドレッシング（`src/maps/map-builder.ts`）

### 7.1 NPC名看板（足元基準・y固定禁止）
- **`y-80` 等の固定オフセットを使わない。** 足元基準で算出:
  `nameplateY = footY - frameH * originY - margin`（NPCは frameH=96, originY=0.875, margin≈6 → footY-90）。
  個別調整は `entity.nameplateOffsetY`（省略時は上式）で上書き可能にする。
- 看板は木プレート `TEX.sign`＋クリーム文字 `#fbe7c2`。**浮き白テキスト禁止**。

### 7.2 BuildingDef 拡張（`src/maps/map-def.ts`）
施設は庇/看板だけでなく、以下を持てる。データ駆動（town.json 等）。
```ts
interface BuildingDef {
  x; y; w; h; style;
  shop?: 'equip'|'craft'|'guild'|'house';   // 役割（既存）
  npcType?: string;      // 併設NPCの見た目キー（例 'merchant'|'smith'|'guild'|'elder'|'villager'）
  signIcon?: 'sword'|'hammer'|'shield'|'potion'|'scroll'|'coin'; // 吊り看板アイコン
  shadowType?: 'soft'|'hard'|'none';        // §6の接地影種別
  props?: Array<{ kind: 'barrel'|'crate'|'signpost'|'lantern'|'banner'; dx: number; dy: number }>;
    // 店先小物。dx/dy は建物左上からの相対px。
}
```
| shop | 庇色 | 既定 signIcon | 既定 npcType |
|---|---|---|---|
| equip | 赤`#b34a3a`/クリーム`#e8d8b0` | sword | merchant |
| craft | 茶`#8a5a30`/タン`#d8b878` | hammer | smith |
| guild | 青`#3a5aa0`/クリーム`#e4dcc0` | shield | guild |
| house | （なし） | — | villager |

`props` は §6 の接地影付きで足元にY ソート配置。`drawShopFront/drawShopIcon/drawProps` 参照。

---

## 8. NPC 描き分け（`src/assets/gen/textures.ts` の `drawNpc`）

- **フレームは 96×96 固定**（キャラ規格`CHAR_FRAME_W/H`と一致。ペーパードールと同じ土台）。
  **見た目の身体幅だけ 64px 程度**に収める（フレームは96のまま、中央に描画）。足元原点 (48,84)。
- アウトライン `#1a1526`＋陰影＋顔（目・口）付きチビ。役割別テクスチャ:

| npcType/action | テクスチャ | 見た目 |
|---|---|---|
| merchant/equip | `TEX.npcMerchant` | 緑エプロンの商人 |
| smith/craft | `TEX.npcSmith` | 赤服＋バンダナの鍛冶屋 |
| guild/job | `TEX.npcGuild` | 青制服＋帽子のギルド |
| elder/quest | `TEX.npcElder` | 紫ローブ＋白ひげの長老 |
| villager/その他 | `TEX.npcVillager` | 村人（微ティント変化） |

---

## 9. タイル（`textures.ts`）

- 草 `TEX.tileGrass`: 低コントラストの落ち着いた芝 `#3a6a40`。
- 草2 `TEX.tileGrass2`: 近似色 `#3d6d43`。`buildMap` が**1タイル単位（32px・グリッド整列）**でシード散布し反復緩和。**大きな矩形パッチは禁止**（デバッグ領域に見える）。
- 道 `TEX.tilePath`: 踏み固めた土＋小石＋轍。追加時も「低コントラスト・整数・ニアレスト」厳守。

---

## 10. Depth（描画順）規約

| depth | 内容 |
|---|---|
| -1000 | 地面 tileSprite＋草2パッチ |
| -999 / -998 / -997 | 道 / 道の縁 / 散布装飾 |
| `round(footY)-1` | 接地影（テクスチャ、§6） |
| `round(y)` | 木・建物・NPC・プレイヤー・props（Yソート） |
| 5 / 6 / 7 | ポータル門 / 矢印・粒子 / ポータル名 |
| `round(y)+1 / +2` | NPC看板 / 看板文字 |
| **`HUD_DEPTH=100000` 以上** | HUD（UIScene） |

---

## 11. アセット後差しパイプライン（`src/assets/manifest.ts`）

- `public/assets/...` に PNG を置くだけで手続きプレースホルダを**無改修で差替**。
- 主なキー: `ui/frame.png`(48×48 9スライス枠)、`env/npc_*.png`(**96×96** 役割NPC)、`env/sign.png`、`env/shadow.png`(接地影)、`tiles/grass*.png`。
- キャラ/装備/敵/NPC は 96×96（`ART_SPEC.md`準拠。NPCは静止1枚でも96×96フレーム）。

---

## 12. 受入基準（この画面は「完成見本」か？）

- [ ] キャラ・建物が草に埋もれない（前景/背景コントラスト十分）
- [ ] 立ちオブジェクトすべてに接地影（**テクスチャ方式**）
- [ ] 光が全て左上から（影は右下）
- [ ] 施設が一目で用途判別（庇＋アイコン看板＋店先props）
- [ ] ワールドに“浮き白テキスト”が無い（看板/ピルに載る。看板は足元基準）
- [ ] UIが角丸・ソフト・丸ゴシックで統一（HP/MP/EXPは`statusPanel`に統合、個別配置なし）
- [ ] **HUDは全て `HUD_DEPTH(100000)` 以上でワールドと競合しない**
- [ ] **町（安全地帯・敵0）では戦闘UI（攻撃/スキル/回避）を淡色化して情報量を下げる**（必須）

## 13. やらないこと

3D化 / 自由回転 / 非整数スケール / ぼかし / 生成AI級の描き込み前提の設計 /
既存作品の模倣 / 戦闘・データ構造の変更（本書は見た目の規約）。

---

## 14. 実装チケット — 村画面1枚だけを完成見本にする（Phase 1〜5）

> ゲーム全体ではなく **town マップ1枚**を「完成見本」に仕上げる。各Phaseは実機確認して次へ。

### Phase 1 — 基盤（定数・共有テクスチャ）
- **T1-1** `HUD_DEPTH=100000` を `theme.ts` に定義し、`ui-scene.ts` の `depth` 参照を全置換。
- **T1-2** `TEX.groundShadow` を `textures.ts` に生成（48×20 ソフト楕円、α減衰）。manifest に `env/shadow.png` 追加。
- **完了条件**: 既存見た目は不変で typecheck/build 通過。HUDが最前面。

### Phase 2 — statusPanel 統合（§4.2）
- **T2-1** `statusPanel` コンテナを実装（ninePanel背景＋左職業アイコン＋右 Lv/職業/HP/MP/EXP）。
- **T2-2** 所持金を panel下部 or 直下pillへ。旧・個別バー/箱/所持金を撤去。
- **T2-3** bus購読（hp/mp/exp/level-up/job/gold）を新参照に接続。低HPビネットは `HUD_DEPTH-1`。
- **完了条件**: HP/MP/EXP/Lv/職業/所持金が1パネルに集約。実機で崩れなし。

### Phase 3 — 接地影のテクスチャ化（§6）
- **T3-1** プレイヤー/NPC/木/建物/props の影を `TEX.groundShadow` の `Image` に統一（Graphics楕円を撤去）。
- **T3-2** `shadowType`（soft/hard/none）でサイズ切替。depth=`round(footY)-1`。
- **完了条件**: 全立ちオブジェクトに接地影、浮き解消、描画コスト増なし。

### Phase 4 — NPC/看板/BuildingDef 拡張（§7・§8）
- **T4-1** NPC素材を **96×96フレーム**に統一（身体幅~64px中央）。`drawNpc`・manifest・spawn を更新。
- **T4-2** NPC名看板を **足元基準計算**（`nameplateOffsetY`対応）に変更、`y-80`固定を撤去。
- **T4-3** `BuildingDef` に `npcType/signIcon/shadowType/props` を追加、validate 拡張、town.json に反映。
- **T4-4** `drawProps`（barrel/crate/signpost/lantern/banner）を実装し店先に配置。
- **完了条件**: 施設が庇＋看板＋小物で用途判別可。看板が頭上に正しく載る。

### Phase 5 — 町の情報整理（§12 必須基準）
- **T5-1** 「安全地帯（敵0 or map.safe）」判定を追加。町では攻撃/スキル/回避ボタンを淡色化（α~0.5, 無効化は任意）。
- **T5-2** 受入基準（§12）を town で全チェック。道の反復や小物の最終調整。
- **完了条件**: §12 の全チェックが town で満たされる。
