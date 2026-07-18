import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getConsumable, getMaterial, itemDisplayName } from '@/data/items';
import { rarityColor } from '@/data/rarity';
import { getShop, type ShopStockEntry } from '@/shops/shop-defs';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, rowBand, pillButton, tabChip, ninePanel, type TabHandle } from '@/ui/theme';
import { TEX } from '@/assets/gen/textures';
import { KineticScroll } from '@/ui/kinetic-scroll';

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
  private viewTop = 96;
  private viewBottom = 0;
  private shopId = 'general';
  private tab: 'buy' | 'sell' = 'buy';
  private tabButtons: { id: 'buy' | 'sell'; tab: TabHandle }[] = [];

  constructor() {
    super('Shop');
  }

  create(data?: { id?: string }): void {
    if (data?.id) this.shopId = data.id;
    const w = this.scale.width;
    const h = this.scale.height;
    const shop = getShop(this.shopId);

    ninePanel(this, 102, 23, 184, 38).setDepth(2.5);
    ninePanel(this, w - 78, 23, 148, 38).setDepth(2.5);
    this.add
      .text(22, 23, shop?.name ?? '道具屋', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.add.circle(w - 128, 23, 6, 0xf5c542).setStrokeStyle(1.5, 0x8a6a1a, 1).setDepth(3);
    this.goldText = this.add
      .text(w - 116, 23, '', { fontFamily: FONT, fontSize: '13px', color: '#ffd86b' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.add
      .text(16, 54, shop?.blurb ?? '狩りの準備に。', { fontFamily: FONT, fontSize: '11px', color: '#9aa0b5' })
      .setDepth(3);

    // 買う / 売る tabs.
    this.tabButtons = [];
    (
      [
        { id: 'buy', label: '買う' },
        { id: 'sell', label: '売る' },
      ] as const
    ).forEach((t, i) => {
      const tab = tabChip(this, 50 + i * 82, 80, 78, t.label, () => {
        if (this.dragged) return;
        this.tab = t.id;
        this.scrollY = 0;
        this.render();
      });
      tab.root.setDepth(3);
      this.tabButtons.push({ id: t.id, tab });
    });

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

  private render(): void {
    this.content.removeAll(true);
    this.goldText.setText(`${gameState.gold}`);
    for (const tb of this.tabButtons) tb.tab.setActive(tb.id === this.tab);
    const w = this.scale.width;
    let y = this.viewTop + 8;
    let band = 0;

    if (this.tab === 'buy') {
      const shop = getShop(this.shopId);
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
    } else {
      // Sell: everything sellable the player holds (materials, then potions).
      // Equipment is deliberately NOT sellable here (protects progression gear).
      const rows: { id: string; qty: number; price: number; kind: 'mat' | 'cons' }[] = [];
      for (const [id, qty] of Object.entries(gameState.materials)) {
        const def = getMaterial(id);
        if (def && qty > 0 && def.sellPrice > 0) {
          rows.push({ id, qty, price: def.sellPrice, kind: 'mat' });
        }
      }
      for (const [id, qty] of Object.entries(gameState.consumables)) {
        const def = getConsumable(id);
        if (def && qty > 0) rows.push({ id, qty, price: def.sellPrice, kind: 'cons' });
      }
      if (rows.length === 0) {
        this.content.add(
          this.add.text(16, y, '売れるものがありません。', { fontFamily: FONT, fontSize: '13px', color: '#9aa0b4' }),
        );
        y += 28;
      }
      for (const r of rows) {
        this.renderSellRow(r, y, w, band++);
        y += 64;
      }
    }

    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  /** One sellable stack: icon + name ×qty + unit price + 売る / 全部売る. */
  private renderSellRow(
    r: { id: string; qty: number; price: number; kind: 'mat' | 'cons' },
    y: number,
    w: number,
    band: number,
  ): void {
    const rowH = 60;
    const cy = y + rowH / 2;
    this.content.add(rowBand(this, y, rowH, band));
    const tint = r.kind === 'mat' ? rarityColor(getMaterial(r.id)?.rarity) : this.itemTint(r.id);
    const icon = r.kind === 'mat' ? TEX.iconGem : TEX.iconFlask;
    this.content.add(this.add.rectangle(26, cy, 32, 32, 0x1c2036, 1).setStrokeStyle(2, 0x46508a, 0.95));
    this.content.add(this.add.image(26, cy, icon).setTint(tint));
    this.content.add(
      this.add.text(50, y + 8, `${itemDisplayName(r.id)} ×${r.qty}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#fff',
      }),
    );
    this.content.add(
      this.add.text(50, y + 30, `1個 ${r.price}G`, { fontFamily: FONT, fontSize: '11px', color: '#ffd86b' }),
    );
    const sellOne = this.add
      .text(w - 74, cy, '売る', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffe9a8',
        backgroundColor: '#4a3a20',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    sellOne.on('pointerup', () => {
      if (this.dragged) return;
      this.sell(r, 1);
    });
    this.content.add(sellOne);
    const sellAll = this.add
      .text(w - 16, cy, '全部', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffd0a0',
        backgroundColor: '#3a2d18',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    sellAll.on('pointerup', () => {
      if (this.dragged) return;
      this.sell(r, r.qty);
    });
    this.content.add(sellAll);
  }

  private sell(r: { id: string; qty: number; price: number; kind: 'mat' | 'cons' }, count: number): void {
    const n = Math.min(count, r.qty);
    if (n <= 0) return;
    const ok =
      r.kind === 'mat'
        ? gameState.consumeMaterials({ [r.id]: n })
        : gameState.removeConsumable(r.id, n);
    if (!ok) return;
    gameState.addGold(r.price * n);
    bus.emit('sfx:play', { id: 'coin' });
    this.flash(`${itemDisplayName(r.id)} ×${n} を ${r.price * n}G で売った`);
    this.render();
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
