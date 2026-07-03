import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { travelMaps, getMap, spawnPoint } from '@/maps/map-def';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, pillButton } from '@/ui/theme';

/**
 * Fast-travel map list. Opened from the HUD map button anywhere. Picking a
 * destination persists the target (default spawn) and warps via a scene
 * restart (same path as portals). The world is paused while open.
 *
 * Maps are listed from map-def `travel` metadata; a `travel.unlockFlag` (none
 * set yet — all open) gates an entry, shown locked when unmet.
 */
export class MapSelectScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 64;
  private viewBottom = 0;

  constructor() {
    super('MapSelect');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewBottom = h - 60;

    this.add
      .text(16, 22, 'マップ移動', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fff',
      })
      .setDepth(3);

    this.content = this.add.container(0, 0).setDepth(1);
    addPanelChrome(this, this.viewTop, this.viewBottom);
    this.setupScroll();

    pillButton(this, w / 2, h - 36, 'とじる', () => {
      if (this.dragged) return;
      this.close();
    }, { color: '#ffe9a8', bg: '#39406a', size: 15 }).setDepth(3);
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render();
  }

  private render(): void {
    const w = this.scale.width;
    let y = this.viewTop + 8;
    for (const m of travelMaps()) {
      const current = m.id === gameState.mapId;
      const locked = !!m.travel?.unlockFlag && !gameState.flags[m.travel.unlockFlag];

      const row = this.add
        .rectangle(w / 2, y + 22, w - 24, 48, current ? 0x2c3a2c : 0x20233a, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(1, current ? 0x6fcf6f : 0x39406a);
      this.content.add(row);

      this.content.add(
        this.add.text(24, y + 16, m.name, {
          fontFamily: FONT,
          fontSize: '15px',
          color: locked ? '#7e8499' : '#fff',
        }),
      );
      const sub = current ? '現在地' : locked ? 'ロック中' : (m.travel?.note ?? '');
      this.content.add(
        this.add.text(24, y + 38, sub, {
          fontFamily: FONT,
          fontSize: '11px',
          color: current ? '#9fe3a0' : '#9aa0b5',
        }),
      );

      if (!current && !locked) {
        const go = this.add
          .text(w - 28, y + 22, '[ 移動 ]', {
            fontFamily: FONT,
            fontSize: '14px',
            color: '#9fd0ff',
          })
          .setOrigin(1, 0.5);
        this.content.add(go);
        // Whole row is tappable.
        row.setInteractive({ useHandCursor: true });
        row.on('pointerup', () => {
          if (this.dragged) return;
          this.travelTo(m.id);
        });
      }
      y += 60;
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  private travelTo(id: string): void {
    const target = getMap(id);
    if (!target) return;
    const sp = spawnPoint(target, 'default');
    gameState.mapId = id;
    gameState.x = sp.x;
    gameState.y = sp.y;
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('map:travel', {});
  }

  private setupScroll(): void {
    let startY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startY = p.y;
      startScroll = this.scrollY;
      this.dragged = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const d = startY - p.y;
      if (Math.abs(d) > 6) this.dragged = true;
      this.scrollTo(startScroll + d);
    });
    this.input.on(
      'wheel',
      (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
        this.scrollTo(this.scrollY + dy * 0.5);
      },
    );
  }

  private scrollTo(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
  }
}
