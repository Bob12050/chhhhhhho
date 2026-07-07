import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getEquipment, getMaterial, getConsumable, itemDisplayName } from '@/data/items';
import { rarityColorHex, rarityColor } from '@/data/rarity';
import { allRecipes, type Recipe } from '@/crafting/recipes';
import { craft, craftBlock, visibleRecipes } from '@/crafting/crafting';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, rowBand, tabChip, pillButton, type TabHandle } from '@/ui/theme';
import { TEX } from '@/assets/gen/textures';

/**
 * Crafting overlay (opened by the craft NPC). Lists recipes with their
 * material/gold cost and a make button enabled only when affordable. The world
 * is paused while open; closing hints an autosave.
 */
type CraftTab = 'weapon' | 'armor' | 'tool';

export class CraftingScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 88;
  private viewBottom = 0;
  private tab: CraftTab = 'weapon';
  private tabButtons: { id: CraftTab; tab: TabHandle }[] = [];
  /** All rows as data (virtualized; see render/updateWindow). */
  private rowQueue: { r: Recipe; y: number; band: number }[] = [];
  /** Game objects of currently-materialized rows, keyed by row index. */
  private liveRows = new Map<number, Phaser.GameObjects.GameObject[]>();
  private rowsBaseY = 0;

  constructor() {
    super('Crafting');
  }

  /** Category of a recipe's result (weapon / armor / tool). */
  private recipeCategory(r: Recipe): CraftTab {
    const eq = getEquipment(r.resultItemId);
    if (!eq) return 'tool';
    return eq.slot === 'main_hand' ? 'weapon' : 'armor';
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(0, 0, w, 46, 0x10121c, 1).setOrigin(0).setDepth(2);
    this.add
      .text(16, 23, 'クラフト', { fontFamily: FONT, fontSize: '18px', color: '#fff' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.add.circle(w - 62, 23, 6, 0xf5c542).setStrokeStyle(1.5, 0x8a6a1a, 1).setDepth(3);
    this.goldText = this.add
      .text(w - 52, 23, '', { fontFamily: FONT, fontSize: '14px', color: '#ffd86b' })
      .setOrigin(0, 0.5)
      .setDepth(3);

    // Tabs: weapons / armour / tools.
    this.tabButtons = [];
    const tabs: { id: CraftTab; label: string }[] = [
      { id: 'weapon', label: '武器' },
      { id: 'armor', label: '防具' },
      { id: 'tool', label: 'どうぐ' },
    ];
    tabs.forEach((t, i) => {
      const tab = tabChip(this, 46 + i * 78, 60, 74, t.label, () => {
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
    let startPointerY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startPointerY = p.y;
      startScroll = this.scrollY;
      this.dragged = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const d = startPointerY - p.y;
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
    this.updateWindow();
  }

  private render(): void {
    this.content.removeAll(true);
    this.liveRows.clear();
    this.goldText.setText(`${gameState.gold}`);
    for (const tb of this.tabButtons) tb.tab.setActive(tb.id === this.tab);
    const w = this.scale.width;
    let y = this.viewTop + 8;
    // MH-style discovery: only recipes whose materials the player has seen,
    // craftable ones first. Hidden count hints there's more to find.
    const inTab = allRecipes().filter((r) => this.recipeCategory(r) === this.tab);
    const { visible, hidden } = visibleRecipes(gameState, inTab);
    if (visible.length === 0) {
      this.content.add(
        this.add.text(16, y, '作れるものがありません。素材を集めてこよう。', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#9aa0b4',
        }),
      );
      y += 28;
    }
    // Virtualized list: only rows near the viewport exist as game objects
    // (~12 live at once). Rows leaving the window are destroyed. Fixed 76px
    // pitch → total height and hit positions are known without building rows.
    this.rowsBaseY = y;
    this.rowQueue = visible.map((r, i) => ({ r, y: y + i * 76, band: i }));
    y += visible.length * 76;
    if (hidden > 0) {
      this.content.add(
        this.add
          .text(w / 2, y + 10, `？ 未発見のレシピ ${hidden}件（新しい素材を手に入れると増える）`, {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#7e8499',
          })
          .setOrigin(0.5, 0),
      );
      y += 34;
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  /**
   * Virtual window: create rows within ±2 rows of the viewport, destroy rows
   * outside it. Keeps live object count constant (~12 rows × ~12 objects) no
   * matter how many recipes exist — big lists froze the phone otherwise.
   */
  private updateWindow(): void {
    if (this.rowQueue.length === 0) return;
    const pitch = 76;
    const first = Math.max(
      0,
      Math.floor((this.scrollY + this.viewTop - this.rowsBaseY) / pitch) - 2,
    );
    const last = Math.min(
      this.rowQueue.length - 1,
      Math.ceil((this.scrollY + this.viewBottom - this.rowsBaseY) / pitch) + 2,
    );
    // Destroy rows that left the window.
    for (const [idx, objs] of this.liveRows) {
      if (idx < first || idx > last) {
        for (const o of objs) o.destroy();
        this.liveRows.delete(idx);
      }
    }
    // Create rows that entered it (track exactly the objects each row adds).
    const w = this.scale.width;
    for (let i = first; i <= last; i++) {
      if (this.liveRows.has(i)) continue;
      const q = this.rowQueue[i];
      const before = this.content.length;
      this.renderRecipe(q.r, q.y, w, q.band);
      this.liveRows.set(i, this.content.list.slice(before) as Phaser.GameObjects.GameObject[]);
    }
  }

  /** Icon for a recipe result (weapon type / armour slot / consumable / gem). */
  private resultIcon(id: string): string {
    const eq = getEquipment(id);
    if (eq) {
      if (eq.slot === 'main_hand') {
        const tag = eq.weaponTags?.[0];
        if (tag === 'staff' || tag === 'wand') return TEX.iconStaff;
        if (tag === 'bow' || tag === 'shuriken') return TEX.iconBow;
        if (tag === 'shield') return TEX.iconShield;
        return TEX.iconSword;
      }
      if (eq.slot === 'head') return TEX.iconHelm;
      if (eq.slot.startsWith('accessory')) return TEX.iconRing;
      return TEX.iconArmor;
    }
    if (getConsumable(id)) return TEX.iconFlask;
    return TEX.iconGem;
  }

  private renderRecipe(r: Recipe, y: number, w: number, band: number): void {
    const rowH = 72;
    this.content.add(rowBand(this, y, rowH, band));
    const block = craftBlock(gameState, r);
    const resultRarity =
      getEquipment(r.resultItemId)?.rarity ?? getMaterial(r.resultItemId)?.rarity;
    // Result icon cell (rarity border), dimmed when unaffordable.
    const border = block ? 0x4a4f5c : rarityColor(resultRarity);
    const cy = y + rowH / 2;
    this.content.add(
      this.add.rectangle(26, cy, 32, 32, 0x1c2036, 1).setStrokeStyle(2, border, 0.95),
    );
    this.content.add(
      this.add.image(26, cy, this.resultIcon(r.resultItemId)).setTint(block ? 0x888ea0 : rarityColor(resultRarity)),
    );
    this.content.add(
      this.add.text(50, y + 6, `${itemDisplayName(r.resultItemId)} ×${r.resultQty}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: rarityColorHex(resultRarity),
      }),
    );

    // Per-cost chips: green when satisfied, red when short (a wall of red text
    // was unreadable; colour each requirement individually).
    const costs: { label: string; ok: boolean }[] = [];
    for (const [id, qty] of Object.entries(r.materials)) {
      const have = gameState.materials[id] ?? 0;
      costs.push({ label: `${itemDisplayName(id)} ${have}/${qty}`, ok: have >= qty });
    }
    for (const eq of r.consumeEquipment ?? []) {
      const have = gameState.ownedEquipmentCount(eq);
      costs.push({ label: `${itemDisplayName(eq)}(装) ${have}/1`, ok: have >= 1 });
    }
    costs.push({ label: `${r.gold}G`, ok: gameState.gold >= r.gold });
    let lineX = 50;
    let lineY = y + 28;
    for (const c of costs) {
      const t = this.add.text(lineX, lineY, c.label, {
        fontFamily: FONT,
        fontSize: '11px',
        color: c.ok ? '#9fd0a0' : '#e58a8a',
      });
      this.content.add(t);
      lineX = t.x + t.width + 10;
      // Wrap long upgrade-recipe cost lists to a second row.
      if (lineX > w - 96 && lineY === y + 28) {
        lineX = 50;
        lineY = y + 46;
      }
    }

    if (block) {
      this.content.add(
        this.add
          .text(w - 16, cy, '不足', { fontFamily: FONT, fontSize: '13px', color: '#7e8499' })
          .setOrigin(1, 0.5),
      );
    } else {
      const btn = this.add
        .text(w - 16, cy, '作る', {
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
        if (craft(gameState, r)) {
          this.flash(`${itemDisplayName(r.resultItemId)} を作った！`);
          bus.emit('sfx:play', { id: 'craft' });
        }
        this.render();
      });
      this.content.add(btn);
    }
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
