import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import {
  getEquipment,
  getConsumable,
  itemDisplayName,
  type EquipmentDef,
} from '@/data/items';
import type { EquipSlot } from '@/equipment/slots';
import { bus } from '@/core/event-bus';
import { returnToTitle } from '@/core/game-flow';

type Tab = 'items' | 'consumables' | 'equipment';

const SLOT_LABEL: Record<string, string> = {
  head: '頭',
  torso: '胴',
  main_hand: '武器',
};

/**
 * Bag / menu overlay (replaces the old equipment-only screen). Three tabs:
 * materials, consumables (use), and equipment (equip from owned). Opened from
 * the HUD bag button or the equip-shop NPC. The world is paused while open.
 */
export class InventoryScene extends Phaser.Scene {
  private tab: Tab = 'items';
  private content!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private tabButtons: { id: Tab; text: Phaser.GameObjects.Text }[] = [];

  constructor() {
    super('Inventory');
  }

  init(data: { tab?: Tab }): void {
    this.tab = data.tab ?? 'items';
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.tabButtons = [];

    this.add.rectangle(0, 0, w, h, 0x0e0f1a, 0.94).setOrigin(0).setDepth(0);
    this.add
      .text(16, 24, 'もちもの', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff' })
      .setDepth(1);
    this.goldText = this.add
      .text(w - 16, 26, '', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#ffd86b' })
      .setOrigin(1, 0)
      .setDepth(1);

    // Tabs.
    const tabs: { id: Tab; label: string }[] = [
      { id: 'items', label: '素材' },
      { id: 'consumables', label: '消耗品' },
      { id: 'equipment', label: '装備' },
    ];
    tabs.forEach((t, i) => {
      const tb = this.add
        .text(16 + i * 86, 58, t.label, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#fff',
          backgroundColor: '#2a2d44',
          padding: { x: 14, y: 8 },
        })
        .setDepth(1)
        .setInteractive({ useHandCursor: true });
      tb.on('pointerup', () => {
        this.tab = t.id;
        this.renderTab();
      });
      this.tabButtons.push({ id: t.id, text: tb });
    });

    this.content = this.add.container(0, 0).setDepth(1);

    // Close + return-to-title.
    const close = this.add
      .text(w / 2, h - 44, '[ とじる ]', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffd86b',
      })
      .setOrigin(0.5)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    const toTitle = this.add
      .text(w - 16, h - 44, 'タイトルへ', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#9aa0b5',
      })
      .setOrigin(1, 0.5)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    toTitle.on('pointerup', () => {
      bus.emit('save:written', { slot: -1 });
      this.time.delayedCall(60, () => returnToTitle(this));
    });

    const off = bus.on('inventory:changed', () => this.refreshGold());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);

    this.refreshGold();
    this.renderTab();
  }

  private refreshGold(): void {
    this.goldText.setText(`${gameState.gold} G`);
  }

  private renderTab(): void {
    this.content.removeAll(true);
    for (const tb of this.tabButtons) {
      tb.text.setBackgroundColor(tb.id === this.tab ? '#46508a' : '#2a2d44');
    }
    if (this.tab === 'items') this.renderItems();
    else if (this.tab === 'consumables') this.renderConsumables();
    else this.renderEquipment();
  }

  private addRow(y: number, ...objs: Phaser.GameObjects.GameObject[]): void {
    this.content.add(objs);
    void y;
  }

  private emptyNote(): void {
    this.content.add(
      this.add.text(16, 110, '（なし）', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#7e8499',
      }),
    );
  }

  private renderItems(): void {
    const entries = Object.entries(gameState.materials).filter(([, q]) => q > 0);
    if (entries.length === 0) return this.emptyNote();
    let y = 100;
    for (const [id, qty] of entries) {
      this.addRow(
        y,
        this.add.text(16, y, itemDisplayName(id), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#fff',
        }),
        this.add
          .text(this.scale.width - 16, y, `×${qty}`, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            color: '#cfd3e6',
          })
          .setOrigin(1, 0),
      );
      y += 32;
    }
  }

  private renderConsumables(): void {
    const entries = Object.entries(gameState.consumables).filter(([, q]) => q > 0);
    if (entries.length === 0) return this.emptyNote();
    let y = 100;
    const w = this.scale.width;
    for (const [id, qty] of entries) {
      const def = getConsumable(id);
      this.content.add(
        this.add.text(16, y, `${itemDisplayName(id)}  ×${qty}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#fff',
        }),
      );
      if (def) {
        this.content.add(
          this.add.text(16, y + 17, def.description, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            color: '#9aa0b5',
          }),
        );
      }
      const use = this.add
        .text(w - 16, y + 6, '[ つかう ]', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          color: '#9fe3a0',
        })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      use.on('pointerup', () => {
        gameState.useConsumable(id);
        this.renderTab();
      });
      this.content.add(use);
      y += 52;
    }
  }

  private renderEquipment(): void {
    const owned = gameState.equipmentOwned
      .map((id) => getEquipment(id))
      .filter((d): d is EquipmentDef => !!d);
    const w = this.scale.width;
    let y = 100;
    if (owned.length === 0) this.emptyNote();
    for (const def of owned) {
      const slot = def.slot as EquipSlot;
      const equipped = gameState.equipment[slot] === def.id;
      this.content.add(
        this.add.text(16, y, `${SLOT_LABEL[slot] ?? slot}: ${def.name}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: equipped ? '#9fe3a0' : '#fff',
        }),
      );
      const btn = this.add
        .text(w - 16, y, equipped ? '[ はずす ]' : '[ そうび ]', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          color: '#9fd0ff',
        })
        .setOrigin(1, 0)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => {
        gameState.equip(slot, equipped ? null : def.id);
        this.renderTab();
      });
      this.content.add(btn);
      y += 34;
    }

    const d = gameState.derived;
    this.content.add(
      this.add.text(16, y + 12, `物理攻撃 ${d.physAtk}   防御 ${d.def}   最大HP ${d.maxHp}`, {
        fontFamily: 'system-ui, monospace',
        fontSize: '12px',
        color: '#cfe',
      }),
    );
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
