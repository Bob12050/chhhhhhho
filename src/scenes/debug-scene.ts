import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allEquipment } from '@/data/items';
import { getMap, spawnPoint } from '@/maps/map-def';
import { bus } from '@/core/event-bus';

/**
 * Debug menu (gated by core/debug.isDebugEnabled). Warp between maps and grant
 * resources to exercise the full Phase 1 loop quickly on device. Not shown for
 * normal players.
 */
export class DebugScene extends Phaser.Scene {
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super('Debug');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, 0x0e0f1a, 0.95).setOrigin(0).setDepth(0);
    this.add
      .text(16, 20, 'DEBUG', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ff8888' })
      .setDepth(1);

    this.status = this.add
      .text(16, 46, '', { fontFamily: 'system-ui, monospace', fontSize: '11px', color: '#cfd3e6' })
      .setDepth(1);
    this.refreshStatus();

    let y = 88;
    this.label('ワープ', y);
    y += 22;
    const maps: [string, string][] = [
      ['町', 'town'],
      ['草原', 'field'],
      ['洞窟', 'dungeon'],
      ['ボス', 'boss_room'],
    ];
    maps.forEach(([lbl, id], i) => this.btn(16 + i * 84, y, lbl, () => this.warp(id)));
    y += 44;

    this.label('付与', y);
    y += 22;
    this.btn(16, y, '+Lv', () => this.grant(() => gameState.gainExp(1000)));
    this.btn(110, y, '能力P+5', () => this.grant(() => (gameState.statPoints += 5)));
    this.btn(220, y, '技P+3', () => this.grant(() => (gameState.skillPoints += 3)));
    y += 40;
    this.btn(16, y, '+100G', () => this.grant(() => gameState.addGold(100)));
    this.btn(110, y, '素材+5', () => this.grant(() => this.grantMaterials()));
    this.btn(220, y, '全回復', () => this.grant(() => gameState.fullHeal()));
    y += 40;
    this.btn(16, y, '全装備入手', () => this.grant(() => this.grantAllEquipment()));
    this.btn(160, y, 'ペット入手', () => this.grant(() => gameState.obtainPetItem('pet_egg_slime')));
    y += 44;
    this.btn(16, y, '通し確認チェックリスト', () => {
      this.scene.stop();
      this.scene.launch('Checklist');
    });
    y += 48;

    this.btn(w / 2 - 44, y, '[ とじる ]', () => this.close(), 0xffd86b);
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private warp(mapId: string): void {
    const m = getMap(mapId);
    if (!m) return;
    const sp = spawnPoint(m, 'default');
    gameState.mapId = mapId;
    gameState.x = sp.x;
    gameState.y = sp.y;
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('debug:warp', {});
  }

  private grant(fn: () => void): void {
    fn();
    this.refreshStatus();
  }

  private grantMaterials(): void {
    for (const id of ['slime_jelly', 'soft_leather', 'iron_ore']) gameState.addMaterial(id, 5);
  }

  private grantAllEquipment(): void {
    for (const e of allEquipment()) gameState.addEquipment(e.id);
  }

  private refreshStatus(): void {
    const g = gameState;
    this.status.setText(
      `Lv${g.level} 職:${g.jobId} G:${g.gold}  能P:${g.statPoints} 技P:${g.skillPoints}  pet:${g.activePetId ?? '-'}`,
    );
  }

  private label(text: string, y: number): void {
    this.add
      .text(16, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: '12px', color: '#9aa0b5' })
      .setDepth(1);
  }

  private btn(x: number, y: number, label: string, cb: () => void, color = 0x2a2d44): void {
    const t = this.add
      .text(x, y, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        backgroundColor: typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : '#2a2d44',
        padding: { x: 10, y: 7 },
      })
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    t.on('pointerup', cb);
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
  }
}
