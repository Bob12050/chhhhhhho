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
  sheet('プレイヤー本体', 'assets/char/player_body.png'),
  sheet('装備:革帽子', 'assets/equip/cap_leather.png'),
  sheet('装備:鉄兜', 'assets/equip/helm_iron.png'),
  sheet('装備:布胴着', 'assets/equip/vest_cloth.png'),
  sheet('装備:鉄胸当て', 'assets/equip/plate_iron.png'),
  sheet('装備:木剣', 'assets/equip/sword_wood.png'),
  sheet('装備:鉄剣', 'assets/equip/sword_iron.png'),
  sheet('敵:スライム', 'assets/enemy/slime.png'),
  tile('タイル:草', 'assets/tiles/grass.png'),
  tile('タイル:道', 'assets/tiles/path.png'),
  tile('タイル:石', 'assets/tiles/stone.png'),
  tile('タイル:床', 'assets/tiles/floor.png'),
  tile('障害物', 'assets/env/obstacle.png'),
  tile('壁', 'assets/env/wall.png'),
  {
    label: 'NPC',
    src: 'assets/env/npc.png',
    type: 'image',
    w: CHAR_FRAME_W,
    h: CHAR_FRAME_H,
    anchor: [CHAR_ANCHOR_X, CHAR_ANCHOR_Y],
  },
];
