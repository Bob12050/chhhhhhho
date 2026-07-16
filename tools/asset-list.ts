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
const enemySprite = (label: string, src: string): AssetSpec => ({
  label,
  src,
  type: 'image',
  w: CHAR_FRAME_W,
  h: CHAR_FRAME_H,
  anchor: [CHAR_ANCHOR_X, CHAR_ANCHOR_Y],
});

export const ASSET_SPECS: AssetSpec[] = [
  sheet('プレイヤー本体', 'assets/char/player_body-storybook-v2.png'),
  diagonalSheet('プレイヤー本体:斜め', 'assets/char/player_body-diagonal-v1.png'),
  sheet('試作レイヤー:素体', 'assets/paperdoll-pilot/base-cardinal-v1.png'),
  diagonalSheet('試作レイヤー:素体斜め', 'assets/paperdoll-pilot/base-diagonal-v1.png'),
  sheet('試作レイヤー:頭', 'assets/paperdoll-pilot/helm-iron-cardinal-v1.png'),
  diagonalSheet('試作レイヤー:頭斜め', 'assets/paperdoll-pilot/helm-iron-diagonal-v1.png'),
  sheet('試作レイヤー:胴', 'assets/paperdoll-pilot/torso-iron-cardinal-v1.png'),
  diagonalSheet('試作レイヤー:胴斜め', 'assets/paperdoll-pilot/torso-iron-diagonal-v1.png'),
  sheet('試作レイヤー:奥手', 'assets/paperdoll-pilot/hand-far-iron-cardinal-v1.png'),
  diagonalSheet('試作レイヤー:奥手斜め', 'assets/paperdoll-pilot/hand-far-iron-diagonal-v1.png'),
  sheet('試作レイヤー:手前', 'assets/paperdoll-pilot/hand-near-iron-cardinal-v1.png'),
  diagonalSheet('試作レイヤー:手前斜め', 'assets/paperdoll-pilot/hand-near-iron-diagonal-v1.png'),
  sheet('試作レイヤー:脚', 'assets/paperdoll-pilot/feet-iron-cardinal-v1.png'),
  diagonalSheet('試作レイヤー:脚斜め', 'assets/paperdoll-pilot/feet-iron-diagonal-v1.png'),
  sheet('試作レイヤー:剣', 'assets/paperdoll-pilot/sword-iron-cardinal-v1.png'),
  diagonalSheet('試作レイヤー:剣斜め', 'assets/paperdoll-pilot/sword-iron-diagonal-v1.png'),
  sheet('試作レイヤー:盾', 'assets/paperdoll-pilot/shield-iron-cardinal-v1.png'),
  diagonalSheet('試作レイヤー:盾斜め', 'assets/paperdoll-pilot/shield-iron-diagonal-v1.png'),
  sheet('職業:戦士', 'assets/char/job_fighter-storybook-v3.png'),
  diagonalSheet('職業:戦士斜め', 'assets/char/job_fighter-diagonal-v1.png'),
  sheet('職業:魔法使い', 'assets/char/job_mage-storybook-v4.png'),
  diagonalSheet('職業:魔法使い斜め', 'assets/char/job_mage-diagonal-v2.png'),
  sheet('職業:僧侶', 'assets/char/job_priest-storybook-v4.png'),
  diagonalSheet('職業:僧侶斜め', 'assets/char/job_priest-diagonal-v2.png'),
  sheet('職業:盗賊', 'assets/char/job_thief-storybook-v4.png'),
  diagonalSheet('職業:盗賊斜め', 'assets/char/job_thief-diagonal-v2.png'),
  sheet('職業:ペット使い', 'assets/char/job_pet_raiser-storybook-v4.png'),
  diagonalSheet('職業:ペット使い斜め', 'assets/char/job_pet_raiser-diagonal-v2.png'),
  sheet('職業:サムライ', 'assets/char/job_samurai-storybook-v2.png'),
  diagonalSheet('職業:サムライ斜め', 'assets/char/job_samurai-diagonal-v1.png'),
  sheet('職業:ソーサラー', 'assets/char/job_sorcerer-storybook-v2.png'),
  diagonalSheet('職業:ソーサラー斜め', 'assets/char/job_sorcerer-diagonal-v1.png'),
  sheet('職業:ホーリーナイト', 'assets/char/job_holy_knight-storybook-v2.png'),
  diagonalSheet('職業:ホーリーナイト斜め', 'assets/char/job_holy_knight-diagonal-v1.png'),
  sheet('職業:ニンジャ', 'assets/char/job_ninja-storybook-v2.png'),
  diagonalSheet('職業:ニンジャ斜め', 'assets/char/job_ninja-diagonal-v1.png'),
  sheet('職業:レンジャー', 'assets/char/job_ranger-storybook-v2.png'),
  diagonalSheet('職業:レンジャー斜め', 'assets/char/job_ranger-diagonal-v1.png'),
  sheet('職業:ソードカイザー', 'assets/char/job_sword_kaiser-storybook-v2.png'),
  diagonalSheet('職業:ソードカイザー斜め', 'assets/char/job_sword_kaiser-diagonal-v1.png'),
  sheet('職業:グランマギアー', 'assets/char/job_grand_magia-storybook-v2.png'),
  diagonalSheet('職業:グランマギアー斜め', 'assets/char/job_grand_magia-diagonal-v2.png'),
  sheet('職業:シルドセイバー', 'assets/char/job_shield_saber-storybook-v2.png'),
  diagonalSheet('職業:シルドセイバー斜め', 'assets/char/job_shield_saber-diagonal-v1.png'),
  sheet('職業:アベンジスタ', 'assets/char/job_avengista-storybook-v2.png'),
  diagonalSheet('職業:アベンジスタ斜め', 'assets/char/job_avengista-diagonal-v1.png'),
  sheet('職業:デュアルスター', 'assets/char/job_dual_star-storybook-v2.png'),
  diagonalSheet('職業:デュアルスター斜め', 'assets/char/job_dual_star-diagonal-v1.png'),
  sheet('職業:アラミカグラ', 'assets/char/job_aramikagura-storybook-v2.png'),
  diagonalSheet('職業:アラミカグラ斜め', 'assets/char/job_aramikagura-diagonal-v1.png'),
  sheet('職業:アルヴライド', 'assets/char/job_alvride-storybook-v2.png'),
  diagonalSheet('職業:アルヴライド斜め', 'assets/char/job_alvride-diagonal-v1.png'),
  sheet('職業:ニルバディオ', 'assets/char/job_nirvadio-storybook-v2.png'),
  diagonalSheet('職業:ニルバディオ斜め', 'assets/char/job_nirvadio-diagonal-v1.png'),
  sheet('職業:ノクスティア', 'assets/char/job_noxtia-storybook-v2.png'),
  diagonalSheet('職業:ノクスティア斜め', 'assets/char/job_noxtia-diagonal-v1.png'),
  sheet('職業:オルタリエ', 'assets/char/job_oltarie-storybook-v2.png'),
  diagonalSheet('職業:オルタリエ斜め', 'assets/char/job_oltarie-diagonal-v1.png'),
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
  { label: '街背景', src: 'assets/maps/town-cute-wide-v1.png', type: 'image', w: 640, h: 960 },
  { label: '草原背景', src: 'assets/maps/field-cute-wide-v1.png', type: 'image', w: 640, h: 960 },
  { label: '森背景', src: 'assets/maps/forest-cute-wide-v1.png', type: 'image', w: 640, h: 960 },
  { label: '洞窟背景', src: 'assets/maps/dungeon-cute-wide-v1.png', type: 'image', w: 640, h: 960 },
  { label: '渓谷背景', src: 'assets/maps/canyon-cute-compact-v1.png', type: 'image', w: 640, h: 960 },
  { label: '火山背景', src: 'assets/maps/volcano-storybook-wide-v2.png', type: 'image', w: 640, h: 960 },
  { label: '雪原背景', src: 'assets/maps/snowfield-storybook-wide-v2.png', type: 'image', w: 640, h: 960 },
  { label: '砂漠背景', src: 'assets/maps/desert-storybook-wide-v2.png', type: 'image', w: 640, h: 960 },
  { label: '闘技場背景', src: 'assets/maps/arena-storybook.png', type: 'image', w: 360, h: 800 },
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
  { label: 'NPC:道具屋', src: 'assets/env/npc_merchant-storybook-v2.png', type: 'image', w: 96, h: 96, anchor: [48, 84] },
  { label: 'NPC:鍛冶屋', src: 'assets/env/npc_craft-storybook-v2.png', type: 'image', w: 96, h: 96, anchor: [48, 84] },
  { label: 'NPC:ギルド', src: 'assets/env/npc_guild-storybook-v2.png', type: 'image', w: 96, h: 96, anchor: [48, 84] },
  { label: 'NPC:村長', src: 'assets/env/npc_elder-storybook-v2.png', type: 'image', w: 96, h: 96, anchor: [48, 84] },
  { label: 'NPC:村人', src: 'assets/env/npc_villager-storybook-v2.png', type: 'image', w: 96, h: 96, anchor: [48, 84] },
];
