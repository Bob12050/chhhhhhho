import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { itemDisplayName } from '@/data/items';
import { allRecipes, type Recipe } from '@/crafting/recipes';
import { craft, craftBlock } from '@/crafting/crafting';
import { bus } from '@/core/event-bus';

/**
 * Crafting overlay (opened by the craft NPC). Lists recipes with their
 * material/gold cost and a make button enabled only when affordable. The world
 * is paused while open; closing hints an autosave.
 */
export class CraftingScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;

  constructor() {
    super('Crafting');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(0, 0, w, h, 0x0e0f1a, 0.94).setOrigin(0).setDepth(0);
    this.add
      .text(16, 24, 'クラフト', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff' })
      .setDepth(1);
    this.goldText = this.add
      .text(w - 16, 26, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffd86b' })
      .setOrigin(1, 0)
      .setDepth(1);

    this.content = this.add.container(0, 0).setDepth(1);

    const close = this.add
      .text(w / 2, h - 40, '[ とじる ]', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffd86b',
      })
      .setOrigin(0.5)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render();
  }

  private render(): void {
    this.content.removeAll(true);
    this.goldText.setText(`${gameState.gold} G`);
    const w = this.scale.width;
    let y = 70;
    for (const r of allRecipes()) {
      this.renderRecipe(r, y, w);
      y += 78;
    }
  }

  private renderRecipe(r: Recipe, y: number, w: number): void {
    const block = craftBlock(gameState, r);
    this.content.add(
      this.add.text(16, y, `${itemDisplayName(r.resultItemId)} ×${r.resultQty}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: '#fff',
      }),
    );

    const parts = Object.entries(r.materials).map(([id, qty]) => {
      const have = gameState.materials[id] ?? 0;
      return `${itemDisplayName(id)} ${have}/${qty}`;
    });
    parts.push(`${gameState.gold}/${r.gold} G`);
    this.content.add(
      this.add.text(16, y + 20, parts.join('   '), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: block ? '#e58a8a' : '#9fd0a0',
      }),
    );

    const btn = this.add
      .text(w - 16, y + 8, block ? '不足' : '[ 作る ]', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: block ? '#7e8499' : '#9fe3a0',
      })
      .setOrigin(1, 0);
    if (!block) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => {
        if (craft(gameState, r)) this.flash(`${itemDisplayName(r.resultItemId)} を作った！`);
        this.render();
      });
    }
    this.content.add(btn);
    this.content.add(
      this.add.rectangle(w / 2, y + 64, w - 32, 1, 0x333a5a).setOrigin(0.5),
    );
  }

  private flash(msg: string): void {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height - 70, msg, {
        fontFamily: 'system-ui, sans-serif',
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
