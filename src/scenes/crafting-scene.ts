import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getEquipment, getMaterial, itemDisplayName } from '@/data/items';
import { rarityColorHex } from '@/data/rarity';
import { allRecipes, type Recipe } from '@/crafting/recipes';
import { craft, craftBlock } from '@/crafting/crafting';
import { bus } from '@/core/event-bus';
import { FONT, UI, addPanelChrome } from '@/ui/theme';

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
  private tabButtons: { id: CraftTab; text: Phaser.GameObjects.Text }[] = [];

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

    this.add
      .text(16, 24, 'クラフト', { fontFamily: FONT, fontSize: '18px', color: '#fff' })
      .setDepth(3);
    this.goldText = this.add
      .text(w - 16, 26, '', { fontFamily: FONT, fontSize: '14px', color: '#ffd86b' })
      .setOrigin(1, 0)
      .setDepth(3);

    // Tabs: weapons / armour / tools.
    this.tabButtons = [];
    const tabs: { id: CraftTab; label: string }[] = [
      { id: 'weapon', label: '武器' },
      { id: 'armor', label: '防具' },
      { id: 'tool', label: 'どうぐ' },
    ];
    tabs.forEach((t, i) => {
      const tb = this.add
        .text(12 + i * 78, 54, t.label, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#fff',
          backgroundColor: UI.tabIdleBg,
          padding: { x: 12, y: 8 },
        })
        .setDepth(3)
        .setInteractive({ useHandCursor: true });
      tb.on('pointerup', () => {
        if (this.dragged) return;
        this.tab = t.id;
        this.scrollY = 0;
        this.render();
      });
      this.tabButtons.push({ id: t.id, text: tb });
    });

    this.content = this.add.container(0, 0).setDepth(1);
    this.viewBottom = h - 72;
    addPanelChrome(this, this.viewTop, this.viewBottom);
    this.setupScroll();

    const close = this.add
      .text(w / 2, h - 40, 'とじる', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffd86b',
        backgroundColor: '#2a3050',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.close());
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
  }

  private render(): void {
    this.content.removeAll(true);
    this.goldText.setText(`${gameState.gold} Gold`);
    for (const tb of this.tabButtons) {
      tb.text.setBackgroundColor(tb.id === this.tab ? UI.tabActiveBg : UI.tabIdleBg);
    }
    const w = this.scale.width;
    let y = this.viewTop + 8;
    const list = allRecipes().filter((r) => this.recipeCategory(r) === this.tab);
    if (list.length === 0) {
      this.content.add(
        this.add.text(16, y, '作れるものがありません。', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#9aa0b4',
        }),
      );
      y += 28;
    }
    for (const r of list) {
      this.renderRecipe(r, y, w);
      y += 78;
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  private renderRecipe(r: Recipe, y: number, w: number): void {
    const block = craftBlock(gameState, r);
    const resultRarity =
      getEquipment(r.resultItemId)?.rarity ?? getMaterial(r.resultItemId)?.rarity;
    this.content.add(
      this.add.text(16, y, `${itemDisplayName(r.resultItemId)} ×${r.resultQty}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: rarityColorHex(resultRarity),
      }),
    );

    const parts = Object.entries(r.materials).map(([id, qty]) => {
      const have = gameState.materials[id] ?? 0;
      return `${itemDisplayName(id)} ${have}/${qty}`;
    });
    // Upgrade recipes also consume a lower-tier piece (下位装備 → 上位装備).
    for (const eq of r.consumeEquipment ?? []) {
      const have = gameState.ownedEquipmentCount(eq);
      parts.push(`${itemDisplayName(eq)}(装備) ${have}/1`);
    }
    parts.push(`${gameState.gold}/${r.gold} Gold`);
    this.content.add(
      this.add.text(16, y + 20, parts.join('   '), {
        fontFamily: FONT,
        fontSize: '11px',
        color: block ? '#e58a8a' : '#9fd0a0',
        // Wrap long upgrade-recipe cost lines instead of running off the right
        // edge; keep clear of the make button (top-right ~90px).
        wordWrap: { width: w - 104 },
      }),
    );

    const btn = this.add
      .text(w - 16, y + 8, block ? '不足' : '[ 作る ]', {
        fontFamily: FONT,
        fontSize: '14px',
        color: block ? '#7e8499' : '#9fe3a0',
      })
      .setOrigin(1, 0);
    if (!block) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => {
        if (this.dragged) return;
        if (craft(gameState, r)) this.flash(`${itemDisplayName(r.resultItemId)} を作った！`);
        this.render();
      });
    }
    this.content.add(btn);
    this.content.add(
      this.add.rectangle(w / 2, y + 64, w - 32, 1, UI.divider).setOrigin(0.5),
    );
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
