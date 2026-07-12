/**
 * Tool-side asset spec (Phaser-free). Mirrors src/assets/manifest.ts paths so
 * the art tooling can generate correctly-sized templates and verify dropped
 * files without importing the runtime manifest (which pulls in Phaser).
 *
 * KEEP PATHS IN SYNC with src/assets/manifest.ts.
 */
import { CHAR_FRAME_W, CHAR_FRAME_H, CHAR_ANCHOR_X, CHAR_ANCHOR_Y, TILE_SIZE } from '../src/config/resolution';
import { SHEET_WIDTH, SHEET_HEIGHT } from '../src/paperdoll/pose-atlas';

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

export const ASSET_SPECS: AssetSpec[] = [
  sheet('プレイヤー本体', 'assets/char/player_body-storybook-v2.png'),
  sheet('職業:戦士', 'assets/char/job_fighter-storybook-v2.png'),
  sheet('職業:魔法使い', 'assets/char/job_mage-storybook-v2.png'),
  sheet('職業:僧侶', 'assets/char/job_priest-storybook-v2.png'),
  sheet('職業:盗賊', 'assets/char/job_thief-storybook-v2.png'),
  sheet('職業:ペット使い', 'assets/char/job_pet_raiser-storybook-v2.png'),
  sheet('職業:サムライ', 'assets/char/job_samurai-storybook-v1.png'),
  sheet('職業:ソーサラー', 'assets/char/job_sorcerer-storybook-v1.png'),
  sheet('職業:ホーリーナイト', 'assets/char/job_holy_knight-storybook-v1.png'),
  sheet('職業:ニンジャ', 'assets/char/job_ninja-storybook-v1.png'),
  sheet('職業:レンジャー', 'assets/char/job_ranger-storybook-v1.png'),
  sheet('職業:ソードカイザー', 'assets/char/job_sword_kaiser-storybook-v1.png'),
  sheet('職業:グランマギアー', 'assets/char/job_grand_magia-storybook-v1.png'),
  sheet('職業:シルドセイバー', 'assets/char/job_shield_saber-storybook-v1.png'),
  sheet('職業:アベンジスタ', 'assets/char/job_avengista-storybook-v1.png'),
  sheet('職業:デュアルスター', 'assets/char/job_dual_star-storybook-v1.png'),
  sheet('職業:アラミカグラ', 'assets/char/job_aramikagura-storybook-v1.png'),
  sheet('職業:アルヴライド', 'assets/char/job_alvride-storybook-v1.png'),
  sheet('職業:ニルバディオ', 'assets/char/job_nirvadio-storybook-v1.png'),
  sheet('職業:ノクスティア', 'assets/char/job_noxtia-storybook-v1.png'),
  sheet('職業:オルタリエ', 'assets/char/job_oltarie-storybook-v1.png'),
  sheet('装備:革帽子', 'assets/equip/cap_leather.png'),
  sheet('装備:鉄兜', 'assets/equip/helm_iron.png'),
  sheet('装備:布胴着', 'assets/equip/vest_cloth.png'),
  sheet('装備:鉄胸当て', 'assets/equip/plate_iron.png'),
  sheet('装備:木剣', 'assets/equip/sword_wood.png'),
  sheet('装備:鉄剣', 'assets/equip/sword_iron.png'),
  sheet('敵:スライム', 'assets/enemy/slime.png'),
  { label: 'タイル:草', src: 'assets/tiles/grass.png', type: 'image', w: 128, h: 128 },
  { label: 'タイル:道', src: 'assets/tiles/path.png', type: 'image', w: 128, h: 128 },
  { label: 'タイル:石', src: 'assets/tiles/stone.png', type: 'image', w: 128, h: 128 },
  tile('タイル:床', 'assets/tiles/floor.png'),
  { label: '街背景', src: 'assets/maps/town-storybook.png', type: 'image', w: 360, h: 800 },
  { label: '草原背景', src: 'assets/maps/field-storybook.png', type: 'image', w: 360, h: 1280 },
  { label: '森背景', src: 'assets/maps/forest-storybook.png', type: 'image', w: 360, h: 1024 },
  { label: '洞窟背景', src: 'assets/maps/dungeon-storybook.png', type: 'image', w: 360, h: 1280 },
  { label: '渓谷背景', src: 'assets/maps/canyon-storybook.png', type: 'image', w: 360, h: 1152 },
  { label: '火山背景', src: 'assets/maps/volcano-storybook.png', type: 'image', w: 360, h: 1280 },
  { label: '雪原背景', src: 'assets/maps/snowfield-storybook.png', type: 'image', w: 360, h: 1152 },
  { label: '砂漠背景', src: 'assets/maps/desert-storybook.png', type: 'image', w: 360, h: 1280 },
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
