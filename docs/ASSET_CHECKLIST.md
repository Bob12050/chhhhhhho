# ASSET_CHECKLIST.md — 自分でアートを描いて差し込む手順

最終アートは `public/assets/...` に PNG を置くだけで**コード無改修**で反映される
（無いものは生成プレースホルダーにフォールバック）。寸法・コマ割りさえ合えばOK。
規格の出典は `docs/ART_SPEC.md` / `src/config/resolution.ts` / `src/paperdoll/pose-atlas.ts`、
キー対応は `src/assets/manifest.ts`。

## ワークフロー（これだけ）

1. `npm run gen-templates` … `art-templates/` に**正寸テンプレPNG**を生成
2. テンプレを開き、**枠線・基準点・行番号のガイドの上から描く**（ガイドは半透明なので塗り潰してOK）
3. 同じ寸法で **`public/<同じパス>`** に書き出す（例 `art-templates/assets/enemy/slime.png` → `public/assets/enemy/slime.png`）
4. `npm run check-assets` … 有無・寸法・コマ割りを検証（✓/⚠/▫）
5. アプリを**完全終了→再起動**して反映確認（PWAキャッシュのため）

> 1枚ずつでOK。置いたものだけ本物になり、残りはプレースホルダーのまま。

## 規格

- **ドット絵**：Nearest 前提。アンチエイリアス・ぼかし・半透明の多用・自由回転/拡大縮小は不可（`CLAUDE.md`）。
- **透過PNG（RGBA）**。背景は透明。
- レアリティで**画像は変えない**（色違いは枠色・演出で表現。同じ `visualId` を共有）。

## ファイル一覧（置き場・寸法）

### キャラ/装備/敵（ポーズアトラス・スプライトシート）
すべて **256×1728px / 1コマ 64×96 / 4列×18行**。足元基準点は各コマ **(32, 84)**。

| 用途 | 置き場 |
|---|---|
| プレイヤー本体 | `public/assets/char/player_body.png` |
| 装備:革帽子 | `public/assets/equip/cap_leather.png` |
| 装備:鉄兜 | `public/assets/equip/helm_iron.png` |
| 装備:布胴着 | `public/assets/equip/vest_cloth.png` |
| 装備:鉄胸当て | `public/assets/equip/plate_iron.png` |
| 装備:木剣 | `public/assets/equip/sword_wood.png` |
| 装備:鉄剣 | `public/assets/equip/sword_iron.png` |
| 敵:スライム | `public/assets/enemy/slime.png` |

**行の意味（上から、テンプレの行番号と一致）**

| 行 | 方向 | アニメ | 使うコマ数 |
|---|---|---|---|
| 0–5 | 下向き(down) | idle / walk / attack / cast / hurt / death | 2 / 4 / 4 / 4 / 2 / 4 |
| 6–11 | 上向き(up) | idle / walk / attack / cast / hurt / death | 2 / 4 / 4 / 4 / 2 / 4 |
| 12–17 | 左向き(left) | idle / walk / attack / cast / hurt / death | 2 / 4 / 4 / 4 / 2 / 4 |

- **右向きは描かない**（左向きを左右反転して使う）。
- 各アニメは**左のコマから**順に。使うコマ数より右の余白コマは無視される（テンプレでは薄く塗られたコマだけが使用対象）。
- テンプレの基準点クロスは色分け：**下=赤 / 上=緑 / 左=青**。

> 装備レイヤーは本体に**重ねて描画**される。本体と同じポーズ・同じ基準点で、その装備部分だけを描く（他は透明）。

### 単体画像

| 用途 | 置き場 | 寸法 | 備考 |
|---|---|---|---|
| タイル:草 | `public/assets/tiles/grass.png` | 32×32 | 敷き詰め前提（端が繋がる柄推奨） |
| タイル:道 | `public/assets/tiles/path.png` | 32×32 | 同上 |
| タイル:石 | `public/assets/tiles/stone.png` | 32×32 | 同上 |
| タイル:床 | `public/assets/tiles/floor.png` | 32×32 | 同上 |
| 障害物 | `public/assets/env/obstacle.png` | 32×32 | — |
| 壁 | `public/assets/env/wall.png` | 32×32 | — |
| NPC | `public/assets/env/npc.png` | 64×96 | 単一絵。基準点 (32,84) |

## 新しい装備/敵の絵を増やすには

1. `src/data/visual-ids.ts` に新しい `visualId` を追加
2. `src/assets/manifest.ts` と `tools/asset-list.ts` に同じパスのエントリを追加（パスは両方一致させる）
3. `npm run gen-templates` → 描く → `public/assets/...` に配置 → `npm run check-assets`
