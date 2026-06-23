import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allEquipment, getEquipment } from '@/data/items';
import { type EquipSlot } from '@/equipment/slots';
import { bus } from '@/core/event-bus';
import { returnToTitle } from '@/core/game-flow';

/**
 * Phase 0 equipment screen. Lets the player cycle equippable items per visible
 * slot (head / torso / main_hand) and see derived-stat changes immediately.
 * Touch + keyboard friendly. Closing returns to gameplay (which auto-saves on
 * equipment change).
 */
const VISIBLE_SLOTS: EquipSlot[] = ['head', 'torso', 'main_hand'];

export class EquipmentScene extends Phaser.Scene {
  private statsText!: Phaser.GameObjects.Text;

  constructor() {
    super('Equipment');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, 0x0e0f1a, 0.92).setOrigin(0).setDepth(0);

    this.add
      .text(w / 2, 28, '装備', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff' })
      .setOrigin(0.5)
      .setDepth(1);

    let y = 70;
    for (const slot of VISIBLE_SLOTS) {
      this.buildSlotRow(slot, y, w);
      y += 64;
    }

    this.statsText = this.add
      .text(16, y + 8, '', {
        fontFamily: 'system-ui, monospace',
        fontSize: '12px',
        color: '#cfe',
        lineSpacing: 2,
      })
      .setDepth(1);
    this.refreshStats();

    // Close button.
    const close = this.add
      .text(w / 2, h - 48, '[ とじる ]', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffd86b',
      })
      .setOrigin(0.5)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.input.keyboard?.on('keydown-E', () => this.close());

    // Return to title (autosave keeps progress; this is the only menu for now).
    const toTitle = this.add
      .text(w - 16, h - 48, 'タイトルへ', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#9aa0b5',
      })
      .setOrigin(1, 0.5)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    toTitle.on('pointerup', () => {
      bus.emit('save:written', { slot: -1 }); // ask Town to persist current state
      this.time.delayedCall(60, () => returnToTitle(this));
    });

    const off = bus.on('equipment:changed', () => this.refreshStats());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  private buildSlotRow(slot: EquipSlot, y: number, w: number): void {
    const options = this.optionsFor(slot);
    const label = this.add
      .text(16, y, slotLabel(slot), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#fff',
      })
      .setDepth(1);
    void label;

    const nameText = this.add
      .text(16, y + 20, '', { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: '#9fd' })
      .setDepth(1);

    const render = (): void => {
      const cur = gameState.equipment[slot];
      nameText.setText(cur ? (getEquipment(cur)?.name ?? cur) : '（なし）');
    };
    render();

    const cycle = (delta: number): void => {
      const cur = gameState.equipment[slot];
      const idx = options.findIndex((o) => o === cur);
      const nextIdx = (idx + delta + options.length) % options.length;
      gameState.equip(slot, options[nextIdx]);
      render();
    };

    const prev = this.add
      .text(w - 120, y + 8, '◀', { fontSize: '22px', color: '#fff' })
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    const next = this.add
      .text(w - 40, y + 8, '▶', { fontSize: '22px', color: '#fff' })
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    prev.on('pointerup', () => cycle(-1));
    next.on('pointerup', () => cycle(1));
  }

  /** [null, ...equippable items for this slot]. */
  private optionsFor(slot: EquipSlot): (string | null)[] {
    const items = allEquipment()
      .filter((e) => e.slot === slot)
      .map((e) => e.id);
    return [null, ...items];
  }

  private refreshStats(): void {
    const d = gameState.derived;
    this.statsText.setText(
      [
        `物理攻撃 ${d.physAtk}   防御 ${d.def}`,
        `最大HP   ${d.maxHp}   命中 ${d.accuracy}`,
        `移動速度 ${d.moveSpeed}  回避 ${d.evasion}`,
      ].join('\n'),
    );
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('Town');
    bus.emit('save:written', { slot: -1 }); // hint; town listens & saves
  }
}

function slotLabel(slot: EquipSlot): string {
  switch (slot) {
    case 'head':
      return '頭';
    case 'torso':
      return '胴';
    case 'main_hand':
      return '武器';
    default:
      return slot;
  }
}
