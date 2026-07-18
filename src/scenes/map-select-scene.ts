import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { travelMaps, getMap, spawnPoint } from '@/maps/map-def';
import { bus } from '@/core/event-bus';
import { illustratedMapTextureKey } from '@/maps/map-builder';
import { TEX } from '@/assets/gen/textures';
import { FONT, addPanelChrome, pillButton, ninePanel } from '@/ui/theme';
import { KineticScroll } from '@/ui/kinetic-scroll';

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
  private viewTop = 72;
  private viewBottom = 0;

  constructor() {
    super('MapSelect');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewBottom = h - 60;

    ninePanel(this, 112, 31, 210, 46).setDepth(2.5);
    this.add.image(25, 31, TEX.iconMap).setScale(1.6).setTint(0xffdf85).setDepth(3);
    this.add
      .text(46, 30, 'マップ移動', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fff',
      })
      .setDepth(3);

    this.content = this.add.container(0, 0).setDepth(1);
    addPanelChrome(this, this.viewTop, this.viewBottom, {
      backdropAlpha: 0.46,
      backdropKey: TEX.uiMapBackdrop,
    });
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
    let y = this.viewTop + 10;
    for (const m of travelMaps()) {
      const current = m.id === gameState.mapId;
      const locked = !!m.travel?.unlockFlag && !gameState.flags[m.travel.unlockFlag];

      const rowH = 70;
      const cy = y + rowH / 2;
      const panel = ninePanel(this, w / 2, cy, w - 18, rowH, { active: !locked });
      this.content.add(panel);

      const texture = illustratedMapTextureKey(m.id);
      if (texture && this.textures.exists(texture)) {
        const thumb = this.add.image(53, cy, texture);
        const side = Math.min(thumb.frame.realWidth, thumb.frame.realHeight);
        thumb.setCrop(
          Math.floor((thumb.frame.realWidth - side) / 2),
          Math.floor((thumb.frame.realHeight - side) / 2),
          side,
          side,
        );
        thumb.setDisplaySize(54, 54).setTint(locked ? 0x677080 : 0xffffff);
        this.content.add(thumb);
        const rim = this.add.rectangle(53, cy, 57, 57, 0x000000, 0).setStrokeStyle(2, current ? 0x8ee3a6 : 0xd8b45b, 0.8);
        this.content.add(rim);
      } else {
        const icon = this.add.image(53, cy, TEX.iconMap).setScale(2.2).setTint(locked ? 0x667080 : 0xffdf85);
        this.content.add(icon);
      }

      this.content.add(
        this.add.text(92, y + 15, m.name, {
          fontFamily: FONT,
          fontSize: '15px',
          color: locked ? '#7e8499' : '#fff',
        }),
      );
      const sub = current ? '現在地' : locked ? 'ロック中' : (m.travel?.note ?? '');
      this.content.add(
        this.add.text(92, y + 42, sub, {
          fontFamily: FONT,
          fontSize: '11px',
          color: current ? '#9fe3a0' : '#9aa0b5',
        }),
      );

      if (!current && !locked) {
        const go = this.add
          .text(w - 25, cy, '›', {
            fontFamily: FONT,
            fontSize: '30px',
            color: '#ffe29a',
          })
          .setOrigin(1, 0.5);
        this.content.add(go);
        const hit = this.add.zone(w / 2, cy, w - 18, rowH).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
          if (this.dragged) return;
          this.travelTo(m.id);
        });
        this.content.add(hit);
      }
      y += 78;
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
    new KineticScroll(this, {
      viewport: () => new Phaser.Geom.Rectangle(
        0,
        this.viewTop,
        this.scale.width,
        this.viewBottom - this.viewTop,
      ),
      getValue: () => this.scrollY,
      getMax: () => this.maxScroll,
      setValue: (value) => this.scrollTo(value),
      onDragState: (dragged) => {
        this.dragged = dragged;
      },
    });
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
