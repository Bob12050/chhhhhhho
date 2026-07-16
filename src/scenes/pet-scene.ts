import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allPets, getPet, type PetDef } from '@/pets/pet-defs';
import { getPetItem } from '@/data/items';
import {
  petLevelFromExp,
  petLevelProgress,
  petExpToNext,
  scaledPassive,
  petAttackDamage,
  PET_MAX_LEVEL,
} from '@/pets/pet-growth';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, rowBand, pillButton, ninePanel } from '@/ui/theme';

/** Short labels for the passive summary line. */
const STAT_LABEL: Record<string, string> = {
  maxHp: 'HP',
  maxMp: 'MP',
  physAtk: '物攻',
  magAtk: '魔攻',
  def: '防御',
  magDef: '魔防',
  accuracy: '命中',
  evasion: '回避',
  critRate: '会心',
  atkSpeed: '攻速',
  moveSpeed: '移動',
  dropRate: 'ドロ率',
  lifesteal: '吸血',
  goldRate: '金運',
};

/**
 * Pet screen (🐾, opened from the bag footer). Top: owned pets with level,
 * exp bar, scaled passive and an active-pet switcher. Bottom: eggs waiting
 * to hatch. Duplicates hatch into pet exp instead of a second pet.
 */
export class PetScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 56;
  private viewBottom = 0;
  private countText!: Phaser.GameObjects.Text;

  constructor() {
    super('PetScreen');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewBottom = h - 64;
    this.scrollY = 0;
    this.dragged = false;

    ninePanel(this, 106, 24, 194, 40).setDepth(2.5);
    ninePanel(this, w - 54, 24, 92, 40).setDepth(2.5);
    this.add
      .text(22, 24, '🐾 ペット', { fontFamily: FONT, fontSize: '18px', color: '#fff', fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.countText = this.add
      .text(w - 54, 24, '', { fontFamily: FONT, fontSize: '13px', color: '#ffd86b' })
      .setOrigin(0.5)
      .setDepth(3);

    this.content = this.add.container(0, 0).setDepth(1);
    addPanelChrome(this, this.viewTop, this.viewBottom);
    this.setupScroll();

    pillButton(this, w / 2, h - 34, 'とじる', () => {
      if (this.dragged) return;
      this.close();
    }, { color: '#ffe9a8', bg: '#39406a', size: 15 }).setDepth(3);
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render();
  }

  private heading(text: string, y: number): number {
    this.content.add(
      this.add.text(16, y, text, { fontFamily: FONT, fontSize: '12px', color: '#8fa0ff', fontStyle: 'bold' }),
    );
    return y + 22;
  }

  private render(): void {
    this.content.removeAll(true);
    this.countText.setText(`${gameState.ownedPets.length} / ${allPets().length}`);
    const w = this.scale.width;
    let y = this.viewTop + 8;
    let band = 0;

    const pets = gameState.ownedPets.map((id) => getPet(id)).filter((p): p is PetDef => !!p);
    if (pets.length) {
      y = this.heading('なかま', y);
      for (const p of pets) {
        this.renderPet(p, y, w, band++);
        y += 78;
      }
    } else {
      y = this.heading('なかま', y);
      this.content.add(
        this.add.text(16, y, 'まだ仲間がいない。敵がまれに落とす「たまご」を探そう。', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#9aa0b5',
          wordWrap: { width: w - 32, useAdvancedWrap: true },
        }),
      );
      y += 44;
    }

    const eggs = Object.entries(gameState.petEggs).filter(([, n]) => n > 0);
    y = this.heading('たまご', y + 8);
    if (eggs.length) {
      for (const [itemId, count] of eggs) {
        this.renderEgg(itemId, count, y, w, band++);
        y += 64;
      }
    } else {
      this.content.add(
        this.add.text(16, y, 'たまごは持っていない。', { fontFamily: FONT, fontSize: '12px', color: '#9aa0b5' }),
      );
      y += 30;
    }

    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  private thumb(x: number, y: number, def: PetDef, size: number): Phaser.GameObjects.Image {
    const tex = this.textures.get(def.textureKey);
    const frame = tex.has('1') ? 1 : undefined;
    const img = this.add.image(x, y, def.textureKey, frame).setScale(size / 96);
    if (def.tint) img.setTint(Phaser.Display.Color.HexStringToColor(def.tint).color);
    return img;
  }

  private passiveText(def: PetDef, level: number): string {
    const scaled = scaledPassive(def, level);
    const bits = Object.entries(scaled).map(([k, v]) => {
      const pct = k === 'critRate' || k === 'dropRate' || k === 'lifesteal' || k === 'goldRate';
      return `${STAT_LABEL[k] ?? k}+${pct ? `${Math.round((v as number) * 100)}%` : v}`;
    });
    if (def.atkBase) bits.push(`攻撃 ${petAttackDamage(def.atkBase, level)}`);
    return bits.join(' ');
  }

  private renderPet(def: PetDef, y: number, w: number, band: number): void {
    const rowH = 74;
    const active = gameState.activePetId === def.id;
    const exp = gameState.petExp[def.id] ?? 0;
    const lv = petLevelFromExp(exp);
    this.content.add(rowBand(this, y, rowH, band));
    if (active) {
      this.content.add(
        this.add
          .rectangle(w / 2, y - 4, w - 16, rowH, 0x000000, 0)
          .setOrigin(0.5, 0)
          .setStrokeStyle(1.5, 0xf5c542, 0.9),
      );
    }
    this.content.add(this.thumb(38, y + 30, def, 46));
    this.content.add(
      this.add.text(70, y + 4, `${def.name}  Lv${lv}${lv >= PET_MAX_LEVEL ? '（MAX）' : ''}`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: active ? '#ffe9a8' : '#fff',
      }),
    );
    // Exp bar.
    const barW = 130;
    this.content.add(this.add.rectangle(70, y + 26, barW, 6, 0x000000, 0.5).setOrigin(0, 0.5));
    this.content.add(
      this.add
        .rectangle(71, y + 26, Math.max(2, Math.round((barW - 2) * petLevelProgress(exp))), 4, 0x8fd0ff)
        .setOrigin(0, 0.5),
    );
    if (lv < PET_MAX_LEVEL) {
      this.content.add(
        this.add.text(70 + barW + 8, y + 26, `あと${petExpToNext(exp)}`, { fontFamily: FONT, fontSize: '9px', color: '#7e8499' }).setOrigin(0, 0.5),
      );
    }
    this.content.add(
      this.add.text(70, y + 38, this.passiveText(def, lv), { fontFamily: FONT, fontSize: '10px', color: '#9fe3a0' }),
    );
    if (def.description) {
      this.content.add(
        this.add.text(70, y + 54, def.description, { fontFamily: FONT, fontSize: '9px', color: '#7e8499' }),
      );
    }

    const btn = this.add
      .text(w - 16, y + 14, active ? '連れている' : '[ 連れていく ]', {
        fontFamily: FONT,
        fontSize: '12px',
        color: active ? '#9fe3a0' : '#9fd0ff',
      })
      .setOrigin(1, 0.5);
    if (!active) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerup', () => {
        if (this.dragged) return;
        gameState.setActivePet(def.id);
        bus.emit('sfx:play', { id: 'equip' });
        this.render();
      });
    }
    this.content.add(btn);
  }

  private renderEgg(itemId: string, count: number, y: number, w: number, band: number): void {
    const item = getPetItem(itemId);
    if (!item) return;
    const petDef = getPet(item.petId);
    const owned = petDef ? gameState.ownedPets.includes(petDef.id) : false;
    const rowH = 60;
    this.content.add(rowBand(this, y, rowH, band));
    // Egg glyph: a simple ellipse tinted like its pet.
    const tint = petDef?.tint ? Phaser.Display.Color.HexStringToColor(petDef.tint).color : 0xf0e0c0;
    this.content.add(this.add.ellipse(38, y + 26, 22, 28, tint, 1).setStrokeStyle(1.5, 0xffffff, 0.25));
    this.content.add(
      this.add.text(70, y + 6, `${item.name} ×${count}`, { fontFamily: FONT, fontSize: '13px', color: '#fff' }),
    );
    this.content.add(
      this.add.text(70, y + 26, owned ? '孵化ずみ: 割ると経験値になる' : (item.description ?? ''), {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#9aa0b5',
      }),
    );
    const btn = this.add
      .text(w - 16, y + 26, '[ 孵化する ]', { fontFamily: FONT, fontSize: '13px', color: '#ffd86b' })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerup', () => {
      if (this.dragged) return;
      const result = gameState.hatchEgg(itemId);
      if (result === 'new') {
        bus.emit('sfx:play', { id: 'fanfare' });
        this.toast(`${petDef?.name ?? '？？？'} が仲間になった！`);
      } else if (result === 'duplicate') {
        bus.emit('sfx:play', { id: 'level_up' });
        this.toast(`${petDef?.name ?? ''} が経験値をもらった`);
      }
      this.render();
    });
    this.content.add(btn);
  }

  /** Small centered toast for hatch results. */
  private toast(msg: string): void {
    const w = this.scale.width;
    const t = this.add
      .text(w / 2, this.viewTop + 30, msg, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffe9a8',
        backgroundColor: '#2a2d44',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 150 });
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 350, onComplete: () => t.destroy() });
  }

  private setupScroll(): void {
    let startY = 0;
    let startScroll = 0;
    let inList = false;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startY = p.y;
      startScroll = this.scrollY;
      this.dragged = false;
      inList = p.y >= this.viewTop && p.y <= this.viewBottom;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !inList) return;
      const d = startY - p.y;
      if (Math.abs(d) > 12) this.dragged = true;
      if (this.dragged) this.scrollTo(startScroll + d);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.scrollTo(this.scrollY + dy * 0.5);
    });
  }

  private scrollTo(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('Inventory');
  }
}
