# public/assets — 差し込みアート

ここに PNG を置くと、対応するプレースホルダーを**コード無改修で**置き換えます。
ファイルが無い項目は従来どおり生成プレースホルダーが使われます。
キーとパスの対応は `src/assets/manifest.ts`、規格は `docs/ART_SPEC.md`。

## レイアウト（パスは manifest と一致させる）

```
assets/
  char/player_body.png      # 96x96 フレームのポーズアトラス
  equip/cap_leather.png     # 同上（装備レイヤー）
  equip/helm_iron.png
  equip/vest_cloth.png
  equip/plate_iron.png
  equip/sword_wood.png
  equip/sword_iron.png
  enemy/slime.png           # 96x96 ポーズアトラス
  tiles/grass.png           # 32x32
  tiles/path.png            # 32x32
  tiles/stone.png           # 32x32
  tiles/floor.png           # 32x32
  env/obstacle.png          # 32x32
  env/wall.png              # 32x32
  env/npc.png               # 96x96（単一画像）
  env/npc_*-storybook-hd-v1.webp # 192x192（NPC高解像度版、ゲーム内では半分表示）
```

## ポーズアトラス規格（char/equip/enemy）

- 1フレーム **96×96**、足元基準点 **(48,84)**。
- 行 = 方向(down,up,left) × アニメ(idle,walk,attack,cast,hurt,death)、列 = フレーム。
- `right` は `left` の水平反転（描画時に自動）。
- Nearest 前提のドット絵（アンチエイリアスなし）。
- 詳細・行数は `docs/ART_SPEC.md` / `src/paperdoll/pose-atlas.ts`。

> レアリティで画像は変えない（visual_family= `visualId` で共有）。差別化は枠色・演出で。
