/**
 * Tool-side asset spec (Phaser-free). Mirrors src/assets/manifest.ts paths so
 * the art tooling can generate correctly-sized templates and verify dropped
 * files without importing the runtime manifest (which pulls in Phaser).
 *
 * KEEP PATHS IN SYNC with src/assets/manifest.ts.
 */
import { CHAR_FRAME_W, CHAR_FRAME_H, CHAR_ANCHOR_X, CHAR_ANCHOR_Y, TILE_SIZE } from '../src/config/resolution';
import {
  DIAGONAL_SHEET_HEIGHT,
  DIAGONAL_SHEET_WIDTH,
  SHEET_HEIGHT,
  SHEET_WIDTH,
} from '../src/paperdoll/pose-atlas';

export interface AssetSpec {
  label: string;
  src: string; // relative to public/ (and to art-templates/)
  type: 'sheet' | 'image';
  w: number;
  h: number;
  frameW?: number;
  frameH?: number;
  anchor?: [number, number];
}

const sheet = (label: string, src: string): AssetSpec => ({
  label,
  src,
  type: 'sheet',
  w: SHEET_WIDTH,
  h: SHEET_HEIGHT,
  frameW: CHAR_FRAME_W,
  frameH: CHAR_FRAME_H,
  anchor: [CHAR_ANCHOR_X, CHAR_ANCHOR_Y],
});
const tile = (label: string, src: string): AssetSpec => ({
  label,
  src,
  type: 'image',
  w: TILE_SIZE,
  h: TILE_SIZE,
});
const diagonalSheet = (label: string, src: string): AssetSpec => ({
  label,
  src,
  type: 'sheet',
  w: DIAGONAL_SHEET_WIDTH,
  h: DIAGONAL_SHEET_HEIGHT,
  frameW: CHAR_FRAME_W,
  frameH: CHAR_FRAME_H,
  anchor: [CHAR_ANCHOR_X, CHAR_ANCHOR_Y],
});
const hdSheet = (label: string, src: string): AssetSpec => ({
  label,
  src,
  type: 'sheet',
  w: SHEET_WIDTH * 2,
  h: SHEET_HEIGHT * 2,
  frameW: CHAR_FRAME_W * 2,
  frameH: CHAR_FRAME_H * 2,
  anchor: [CHAR_ANCHOR_X * 2, CHAR_ANCHOR_Y * 2],
});
const hdDiagonalSheet = (label: string, src: string): AssetSpec => ({
  label,
  src,
  type: 'sheet',
  w: DIAGONAL_SHEET_WIDTH * 2,
  h: DIAGONAL_SHEET_HEIGHT * 2,
  frameW: CHAR_FRAME_W * 2,
  frameH: CHAR_FRAME_H * 2,
  anchor: [CHAR_ANCHOR_X * 2, CHAR_ANCHOR_Y * 2],
});
const enemySprite = (label: string, src: string): AssetSpec => ({
  label,
  src,
  type: 'image',
  w: CHAR_FRAME_W,
  h: CHAR_FRAME_H,
  anchor: [CHAR_ANCHOR_X, CHAR_ANCHOR_Y],
});

export const ASSET_SPECS: AssetSpec[] = [
  hdSheet('プレイヤー本体HD', 'assets/char/player_body-storybook-hd-v1.webp'),
  hdDiagonalSheet('プレイヤー本体:斜めHD', 'assets/char/player_body-diagonal-hd-v1.webp'),
  sheet('鉄3枠:素体', 'assets/paperdoll-pilot/base-cardinal-v3.png'),
  diagonalSheet('鉄3枠:素体斜め', 'assets/paperdoll-pilot/base-diagonal-v3.png'),
  sheet('鉄3枠:頭', 'assets/paperdoll-pilot/helm-iron-cardinal-v3.png'),
  diagonalSheet('鉄3枠:頭斜め', 'assets/paperdoll-pilot/helm-iron-diagonal-v3.png'),
  sheet('鉄3枠:衣装', 'assets/paperdoll-pilot/outfit-iron-cardinal-v3.png'),
  diagonalSheet('鉄3枠:衣装斜め', 'assets/paperdoll-pilot/outfit-iron-diagonal-v3.png'),
  sheet('鉄3枠:武器', 'assets/paperdoll-pilot/weapon-iron-cardinal-v3.png'),
  diagonalSheet('鉄3枠:武器斜め', 'assets/paperdoll-pilot/weapon-iron-diagonal-v3.png'),
  hdSheet('職業:戦士HD', 'assets/char/job_fighter-storybook-hd-v2.webp'),
  hdDiagonalSheet('職業:戦士斜めHD', 'assets/char/job_fighter-diagonal-hd-v2.webp'),
  hdSheet('職業:魔法使いHD', 'assets/char/job_mage-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:魔法使い斜めHD', 'assets/char/job_mage-diagonal-hd-v1.webp'),
  hdSheet('職業:僧侶HD', 'assets/char/job_priest-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:僧侶斜めHD', 'assets/char/job_priest-diagonal-hd-v1.webp'),
  hdSheet('職業:盗賊HD', 'assets/char/job_thief-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:盗賊斜めHD', 'assets/char/job_thief-diagonal-hd-v1.webp'),
  hdSheet('職業:ペット使いHD', 'assets/char/job_pet_raiser-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:ペット使い斜めHD', 'assets/char/job_pet_raiser-diagonal-hd-v1.webp'),
  hdSheet('職業:サムライHD', 'assets/char/job_samurai-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:サムライ斜めHD', 'assets/char/job_samurai-diagonal-hd-v1.webp'),
  hdSheet('職業:ソーサラーHD', 'assets/char/job_sorcerer-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:ソーサラー斜めHD', 'assets/char/job_sorcerer-diagonal-hd-v1.webp'),
  hdSheet('職業:ホーリーナイトHD', 'assets/char/job_holy_knight-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:ホーリーナイト斜めHD', 'assets/char/job_holy_knight-diagonal-hd-v1.webp'),
  hdSheet('職業:ニンジャHD', 'assets/char/job_ninja-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:ニンジャ斜めHD', 'assets/char/job_ninja-diagonal-hd-v1.webp'),
  hdSheet('職業:レンジャーHD', 'assets/char/job_ranger-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:レンジャー斜めHD', 'assets/char/job_ranger-diagonal-hd-v1.webp'),
  hdSheet('職業:ソードカイザーHD', 'assets/char/job_sword_kaiser-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:ソードカイザー斜めHD', 'assets/char/job_sword_kaiser-diagonal-hd-v1.webp'),
  hdSheet('職業:グランマギアーHD', 'assets/char/job_grand_magia-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:グランマギアー斜めHD', 'assets/char/job_grand_magia-diagonal-hd-v1.webp'),
  hdSheet('職業:シルドセイバーHD', 'assets/char/job_shield_saber-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:シルドセイバー斜めHD', 'assets/char/job_shield_saber-diagonal-hd-v1.webp'),
  hdSheet('職業:アベンジスタHD', 'assets/char/job_avengista-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:アベンジスタ斜めHD', 'assets/char/job_avengista-diagonal-hd-v1.webp'),
  hdSheet('職業:デュアルスターHD', 'assets/char/job_dual_star-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:デュアルスター斜めHD', 'assets/char/job_dual_star-diagonal-hd-v1.webp'),
  hdSheet('職業:アラミカグラHD', 'assets/char/job_aramikagura-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:アラミカグラ斜めHD', 'assets/char/job_aramikagura-diagonal-hd-v1.webp'),
  hdSheet('職業:アルヴライドHD', 'assets/char/job_alvride-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:アルヴライド斜めHD', 'assets/char/job_alvride-diagonal-hd-v1.webp'),
  hdSheet('職業:ニルバディオHD', 'assets/char/job_nirvadio-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:ニルバディオ斜めHD', 'assets/char/job_nirvadio-diagonal-hd-v1.webp'),
  hdSheet('職業:ノクスティアHD', 'assets/char/job_noxtia-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:ノクスティア斜めHD', 'assets/char/job_noxtia-diagonal-hd-v1.webp'),
  hdSheet('職業:オルタリエHD', 'assets/char/job_oltarie-storybook-hd-v1.webp'),
  hdDiagonalSheet('職業:オルタリエ斜めHD', 'assets/char/job_oltarie-diagonal-hd-v1.webp'),
  sheet('装備:革帽子', 'assets/equip/cap_leather.png'),
  sheet('装備:鉄兜', 'assets/equip/helm_iron.png'),
  sheet('装備:布胴着', 'assets/equip/vest_cloth.png'),
  sheet('装備:鉄胸当て', 'assets/equip/plate_iron.png'),
  sheet('装備:木剣', 'assets/equip/sword_wood.png'),
  sheet('装備:鉄剣', 'assets/equip/sword_iron.png'),
  enemySprite('敵:スライム', 'assets/enemy/slime-storybook-v3.png'),
  enemySprite('ボス:王冠スライム', 'assets/enemy/slime-royal-storybook-v2.png'),
  enemySprite('敵:こうもり', 'assets/enemy/bat-storybook-v2.png'),
  enemySprite('敵:狼', 'assets/enemy/wolf-storybook-v2.png'),
  enemySprite('敵:キノコ', 'assets/enemy/mushroom-storybook-v2.png'),
  enemySprite('敵:ゴーレム', 'assets/enemy/golem-storybook-v2.png'),
  enemySprite('敵:岩トカゲ', 'assets/enemy/lizard-storybook-v2.png'),
  enemySprite('敵:ウィスプ', 'assets/enemy/wisp-storybook-v2.png'),
  enemySprite('敵:影の騎士', 'assets/enemy/knight-storybook-v2.png'),
  enemySprite('敵:トレント', 'assets/enemy/treant-storybook-v2.png'),
  enemySprite('敵:ドラゴン', 'assets/enemy/dragon-storybook-v2.png'),
  enemySprite('ボス:風翔の王ゼフィス', 'assets/enemy/zephys-storybook-v2.png'),
  enemySprite('ボス:ヒュドラ', 'assets/enemy/hydra-storybook-v2.png'),
  enemySprite('ボス:サンドゴア', 'assets/enemy/sandgoa-storybook-v2.png'),
  enemySprite('ボス:アルマギア', 'assets/enemy/almagia-storybook-v2.png'),
  { label: 'タイル:草', src: 'assets/tiles/grass.png', type: 'image', w: 128, h: 128 },
  { label: 'タイル:道', src: 'assets/tiles/path.png', type: 'image', w: 128, h: 128 },
  { label: 'タイル:石', src: 'assets/tiles/stone.png', type: 'image', w: 128, h: 128 },
  tile('タイル:床', 'assets/tiles/floor.png'),
  { label: '街背景HD', src: 'assets/maps/town-hd-storybook-v1.webp', type: 'image', w: 1280, h: 1920 },
  { label: '草原背景HD', src: 'assets/maps/field-hd-storybook-v1.webp', type: 'image', w: 1280, h: 1920 },
  { label: '森背景HD', src: 'assets/maps/forest-hd-storybook-v1.webp', type: 'image', w: 1280, h: 1920 },
  { label: '洞窟背景HD', src: 'assets/maps/dungeon-hd-storybook-v1.webp', type: 'image', w: 1280, h: 1920 },
  { label: '渓谷背景', src: 'assets/maps/canyon-cute-compact-v1.png', type: 'image', w: 640, h: 960 },
  { label: '火山背景', src: 'assets/maps/volcano-storybook-wide-v2.png', type: 'image', w: 640, h: 960 },
  { label: '雪原背景', src: 'assets/maps/snowfield-storybook-wide-v2.png', type: 'image', w: 640, h: 960 },
  { label: '砂漠背景', src: 'assets/maps/desert-storybook-wide-v2.png', type: 'image', w: 640, h: 960 },
  { label: '闘技場背景', src: 'assets/maps/arena-storybook.png', type: 'image', w: 360, h: 800 },
  { label: '木立の闘技場背景', src: 'assets/maps/arena-grove-storybook-v2.png', type: 'image', w: 360, h: 800 },
  { label: 'タイトル背景HD', src: 'assets/ui/title-backdrop-storybook-hd-v1.webp', type: 'image', w: 1080, h: 1920 },
  { label: 'タイトル紋章', src: 'assets/ui/title-emblem-storybook-v1.png', type: 'image', w: 256, h: 256 },
  { label: 'もりの主：根攻撃', src: 'assets/fx/treant-root-lane-v1.png', type: 'image', w: 96, h: 608 },
  { label: '障害物', src: 'assets/env/obstacle.png', type: 'image', w: 48, h: 64, anchor: [24, 59] },
  tile('壁', 'assets/env/wall.png'),
  {
    label: 'NPC',
    src: 'assets/env/npc-storybook-v2.png',
    type: 'image',
    w: CHAR_FRAME_W,
    h: CHAR_FRAME_H,
    anchor: [CHAR_ANCHOR_X, CHAR_ANCHOR_Y],
  },
  { label: 'NPC:道具屋HD', src: 'assets/env/npc_merchant-storybook-hd-v1.webp', type: 'image', w: 192, h: 192, anchor: [96, 168] },
  { label: 'NPC:鍛冶屋HD', src: 'assets/env/npc_craft-storybook-hd-v1.webp', type: 'image', w: 192, h: 192, anchor: [96, 168] },
  { label: 'NPC:ギルドHD', src: 'assets/env/npc_guild-storybook-hd-v1.webp', type: 'image', w: 192, h: 192, anchor: [96, 168] },
  { label: 'NPC:村長HD', src: 'assets/env/npc_elder-storybook-hd-v1.webp', type: 'image', w: 192, h: 192, anchor: [96, 168] },
  { label: 'NPC:村人HD', src: 'assets/env/npc_villager-storybook-hd-v1.webp', type: 'image', w: 192, h: 192, anchor: [96, 168] },
  { label: 'NPC:クエスト受付HD', src: 'assets/env/npc_quest-storybook-hd-v1.webp', type: 'image', w: 192, h: 192, anchor: [96, 168] },
];
