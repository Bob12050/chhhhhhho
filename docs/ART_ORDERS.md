# ART_ORDERS.md — PixelLab 発注書（協働の最大化プラン）

あなたが PixelLab で生成 → zip をチャットに渡す → 僕が 96×96 ポーズアトラスへ変換・組み込み。
職業スプライト5体で確立済みのフローです。**1体=1zip、zip名に下のIDを入れてください**（例: `boss_treant.zip`）。

---

## 共通ルール（全発注に適用）

**スタイル統一の呪文**（全プロンプトの末尾に付いています）:
> cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite

**エクスポート設定**（職業スプライトと同じ）:
- **Rotations**: 8方向
- **Animations**: `Breathing Idle` と `Walking` は必須。敵・ボスは可能なら `Lead Jab`（攻撃）も
- サイズはそのままでOK（96〜144pxどれでも僕が NEAREST で 96×96 に正規化します）

**参考画像**: 既存の職業スプライト（`public/assets/char/job_fighter-storybook-v2.png` 等）を参考画像に添えると画風が揃います。

**進め方の推奨**: まず「バッチ1（ボス3体）」だけ作って渡してください。パイプラインと画風を確認してから残りを量産するのが安全です。

---

## バッチ1: 看板ボス・検証用3体（最優先）

| ID | 名前 | プロンプト |
|---|---|---|
| boss_treant | もりの主 (Lv6) | ancient forest guardian treant boss, mossy bark body, glowing green eyes, leafy crown, thick root legs, gentle but imposing, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_slime | キングスライム (Lv25) | giant king slime boss, translucent pink jelly body, small golden crown, big cute eyes, wobbly and round, drips of slime, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_dragon | 竜王ヴァルガ (Lv30) | crimson dragon king boss, folded wings, golden horns and chest scales, smoke from nostrils, proud stance, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |

## バッチ2: 残りの看板ボス9体

| ID | 名前 | プロンプト |
|---|---|---|
| boss_stone | 岩の番人 (Lv16) | ancient stone golem guardian boss, cracked sandstone body, glowing rune carvings, moss patches, heavy fists, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_bat_lord | 夜の王 ノクス (Lv12) | regal giant bat lord boss, deep purple fur, tattered cape-like wings, small silver crown, glowing yellow eyes, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_flame | 業火の主 ヴルム (Lv20) | blazing hellhound boss, body wreathed in orange flames, ember mane, molten cracks on black fur, fierce grin, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_wolf_alpha | 群狼の長 フェンリル (Lv24) | great silver alpha wolf boss, battle scars, storm-grey mane, piercing blue eyes, proud stance, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_mushroom | 胞子の母 スポラ (Lv34) | giant mother mushroom boss, huge violet cap with glowing spots, spore clouds drifting, sleepy wise face, tiny root feet, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_lizard_king | 岩牙竜 ガロ (Lv44) | rock-fanged lizard king boss, sandstone-armored scales, huge stone jaw fangs, desert ochre colors, low crouching stance, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_wisp_queen | 霜の女王 グラキエス (Lv56) | frost spirit queen boss, elegant floating ice wraith, crystal crown, trailing frozen veil, pale blue glow, snowflakes around her, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_knight_dread | 不死騎士 モルド (Lv68) | undead dread knight boss, hollow black armor with violet ghost-fire inside, cracked greatsword, torn cape, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| boss_slime_abyss | 深淵のスライム (Lv80) | abyssal void slime boss, pitch-black jelly with galaxy-like star speckles inside, single huge glowing eye, tendrils of darkness, ominous but cute, chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |

## バッチ3: 通常敵10種

| ID | 名前 | プロンプト |
|---|---|---|
| slime | スライム | small round green slime monster, big happy eyes, glossy jelly body, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| bat | こうもり | small blue cave bat monster, round fuzzy body, big ears, tiny fangs, spread wings, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| golem | ゴーレム | small stone golem monster, grey rocky body, moss on shoulders, glowing blue core in chest, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| green_wolf | みどり狼 | small forest wolf monster, moss-green fur, leaf tuft on head, alert ears, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| cap_shroom | ぼうし茸 | walking mushroom monster, big purple polka-dot cap like a hat, stubby body, sleepy eyes, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| rock_lizard | 岩トカゲ | small desert lizard monster with rocky armored back, sandy brown scales, curled tail, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| cave_bat | 洞窟コウモリ | small dusky purple bat monster, ragged wings, single glinting eye catchlight, slightly spooky, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| flame_hound | 火炎獣 | small fiery hound monster, orange-red fur with small flames on back, ember eyes, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| frost_wisp | 氷霊 | small floating ice spirit monster, translucent pale-blue wisp body, crystal shards orbiting, calm glowing eyes, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| shadow_knight | 影の騎士 | small shadow knight monster, dark blue-grey armor, dim red visor glow, short sword and round shield, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |

## バッチ4: NPC 6役（軽量：Rotationsのみ、アニメ不要）

| ID | 役割 | プロンプト |
|---|---|---|
| npc_equip | 装備屋 | friendly armor shop keeper, apron over sturdy clothes, holding a folded tunic, warm smile, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| npc_smith | 鍛冶屋 | dwarven blacksmith, thick beard, leather apron, hammer on shoulder, soot smudges, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| npc_guild | ギルド受付 | guild receptionist, neat uniform with sash, holding a quest ledger, professional smile, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| npc_elder | むらおさ | kind village elder, long white beard, walking staff, green robe, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| npc_villager | むらびと | cheerful young villager, simple tunic, straw hat on back, waving, cute chibi proportions, clean 1px outline, flat cel shading, transparent background, game sprite |
| npc_board | クエスト掲示板 | wooden quest notice board with pinned colorful papers and small roof, RPG prop, clean 1px outline, flat cel shading, transparent background, game sprite（※これはキャラでなく物。1方向のみでOK） |

## バッチ5: 装備アイコン（メニュー用・各1枚の静止画）

32×32目安の単品アイコン。武器タグ12種＋防具部位＋素材系で**約20枚**:
sword / axe / spear / katana / staff / wand / mace / dagger / whip / shuriken / bow / shield /
helmet / armor / gloves / belt / boots / cape / ring / amulet

プロンプト例: `iron sword game item icon, 32x32 pixel art, clean 1px outline, flat cel shading, transparent background`
（各アイコンの个別プロンプトは着手時に一覧を渡します）

## バッチ6: 2次職以降の見た目（15職）・ペット・タイトルロゴ

タイトル名決定後・バッチ1〜3完了後に発注書を追補します。

---

## あなたの協力メニュー（絵以外）

1. **正式タイトル名の決定** — ロゴ・PWAアイコン最終版・manifest名がこれ待ち。候補出しは僕がやります
2. **実機通しプレイ** — 序盤30分＋ボス2〜3体。「硬い/痛い/MP切れる/ロール間に合わない」の体感メモをくれれば即日チューニング
3. **BGMファイル（任意）** — Suno等で作った mp3/ogg を渡してもらえれば、チップチューンを実音源に差し替え（自己ホストでCDN禁止もクリア）

## 到達点の目安

バッチ1〜4＋タイトル名で「**固有の敵・ボス・NPC・ロゴを持つ商用風モバイルRPG**」になります。
バッチ5（アイコン）と実音楽まで入れば、見た目・音の「安っぽさ」要因はほぼ消えます。
