import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getConsumable, itemDisplayName } from '@/data/items';
import { getShop, type ShopStockEntry } from '@/shops/shop-defs';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, rowBand, pillButton } from '@/ui/theme';
import { TEX } from '@/assets/gen/textures';

/**
 * 道具屋 (general store) — the pre-hunt prep facility. Sells consumables /
 * hunt-prep items for gold. It does NOT sell weapons or armour; those are
 * crafted at the 鍛冶屋 (Crafting). Data-driven from shops.json. World is paused
 * while open; closing hints an autosave.
 */
export class ShopScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 70;
  private viewBottom = 0;
  private shopId = 'general';

  constructor() {
    super('Shop');
  }

  create(data?: { id?: string }): void {
    if (data?.id) this.shopId = data.id;
    const w = this.scale.width;
    const h = this.scale.height;
    const shop = getShop(this.shopId);

    this.add.rectangle(0, 0, w, 46, 0x10121c, 1).setOrigin(0).setDepth(2);
    this.add
      .text(16, 23, shop?.name ?? '道具屋', { fontFamily: FONT, fontSize: '18px', color: '#fff' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.add.circle(w - 62, 23, 6, 0xf5c542).setStrokeStyle(1.5, 0x8a6a1a, 1).setDepth(3);
    this.goldText = this.add
      .text(w - 52, 23, '', { fontFamily: FONT, fontSize: '14px', color: '#ffd86b' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.add
      .text(16, 54, shop?.blurb ?? '狩りの準備に。', { fontFamily: FONT, fontSize: '11px', color: '#9aa0b5' })
      .setDepth(3);

    this.content = this.add.container(0, 0).setDepth(1);
    this.viewBottom = h - 72;
    addPanelChrome(this, this.viewTop, this.viewBottom);
    this.setupScroll();

    pillButton(this, w / 2, h - 40, 'とじる', () => this.close(), {
      color: '#ffe9a8',
      bg: '#39406a',
      size: 15,
    }).setDepth(3);
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render();
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
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.scrollTo(this.scrollY + dy * 0.5);
    });
  }

  private scrollTo(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  private render(): void {
    this.content.removeAll(true);
    this.goldText.setText(`${gameState.gold}`);
    const w = this.scale.width;
    const shop = getShop(this.shopId);
    let y = this.viewTop + 8;
    let band = 0;
    for (const entry of shop?.stock ?? []) {
      this.renderRow(entry, y, w, band++);
      y += 64;
    }
    if (!shop?.stock.length) {
      this.content.add(
        this.add.text(16, y, '品切れです。', { fontFamily: FONT, fontSize: '13px', color: '#9aa0b4' }),
      );
      y += 28;
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  /** Tint the flask by what it restores (HP red / MP blue / both gold). */
  private itemTint(id: string): number {
    const eff = getConsumable(id)?.effect;
    if (eff?.hp && eff?.mp) return 0xf5c542;
    if (eff?.mp) return 0x3aa0e0;
    return 0xef6a6a;
  }

  private effectText(id: string): string {
    const eff = getConsumable(id)?.effect;
    if (!eff) return '';
    const parts: string[] = [];
    if (eff.hp) parts.push(`HP+${eff.hp}`);
    if (eff.mp) parts.push(`MP+${eff.mp}`);
    return parts.join(' / ');
  }

  private renderRow(entry: ShopStockEntry, y: number, w: number, band: number): void {
    const rowH = 60;
    const cy = y + rowH / 2;
    this.content.add(rowBand(this, y, rowH, band));
    const afford = gameState.gold >= entry.price;
    this.content.add(
      this.add.rectangle(26, cy, 32, 32, 0x1c2036, 1).setStrokeStyle(2, afford ? 0x6db06a : 0x4a4f5c, 0.95),
    );
    this.content.add(this.add.image(26, cy, TEX.iconFlask).setTint(afford ? this.itemTint(entry.itemId) : 0x888ea0));
    this.content.add(
      this.add.text(50, y + 8, itemDisplayName(entry.itemId), {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#fff',
      }),
    );
    this.content.add(
      this.add.text(50, y + 30, this.effectText(entry.itemId), {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#9aa0b5',
      }),
    );
    // Price chip.
    this.content.add(
      this.add
        .text(w - 92, cy, `${entry.price}G`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: afford ? '#ffd86b' : '#e58a8a',
        })
        .setOrigin(1, 0.5),
    );

    if (afford) {
      const btn = this.add
        .text(w - 16, cy, '買う', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#bfffce',
          backgroundColor: '#274a30',
          padding: { x: 12, y: 6 },
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => {
        if (this.dragged) return;
        this.buy(entry);
      });
      this.content.add(btn);
    } else {
      this.content.add(
        this.add
          .text(w - 16, cy, '所持金不足', { fontFamily: FONT, fontSize: '11px', color: '#7e8499' })
          .setOrigin(1, 0.5),
      );
    }
  }

  private buy(entry: ShopStockEntry): void {
    if (gameState.gold < entry.price) return;
    gameState.addGold(-entry.price);
    gameState.addConsumable(entry.itemId, 1);
    bus.emit('sfx:play', { id: 'coin' });
    this.flash(`${itemDisplayName(entry.itemId)} を買った！`);
    this.render();
  }

  private flash(msg: string): void {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height - 70, msg, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 500, onComplete: () => t.destroy() });
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
