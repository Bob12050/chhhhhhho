import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allEnemyDefs, type EnemyDef } from '@/enemies/enemy-defs';
import { getDropTable } from '@/loot/drop-table';
import { itemDisplayName, getEquipment } from '@/data/items';
import { FONT, addPanelChrome, rowBand, tabChip, pillButton, ninePanel, type TabHandle } from '@/ui/theme';
import { ELEMENT_LABEL, elementColorHex, isElement } from '@/combat/elements';

/**
 * Monster bestiary (図鑑). Enemies register once killed (gameState.killCounts);
 * undiscovered entries show a black silhouette and ???. Tapping a discovered
 * row opens a detail panel: sprite, flavor text, weakness/resist, drop list
 * (with rough frequency labels) and the lifetime kill counter.
 */
export class BestiaryScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 96;
  private viewBottom = 0;
  private tab: 'normal' | 'boss' = 'normal';
  private tabButtons: { id: 'normal' | 'boss'; tab: TabHandle }[] = [];
  private detail: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Bestiary');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewBottom = h - 64;
    this.scrollY = 0;
    this.detail = null;

    ninePanel(this, 111, 24, 202, 40).setDepth(2.5);
    this.add
      .text(22, 24, 'モンスター図鑑', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    this.tabButtons = [];
    const tabs: { id: 'normal' | 'boss'; label: string }[] = [
      { id: 'normal', label: '通常' },
      { id: 'boss', label: 'ボス' },
    ];
    tabs.forEach((t, i) => {
      const tab = tabChip(this, 60 + i * 96, 68, 92, t.label, () => {
        if (this.dragged) return;
        this.tab = t.id;
        this.scrollY = 0;
        this.closeDetail();
        this.render();
      });
      tab.root.setDepth(3);
      this.tabButtons.push({ id: t.id, tab });
    });
    // Completion counter (discovered / total).
    const all = allEnemyDefs();
    const found = all.filter((e) => (gameState.killCounts[e.id] ?? 0) > 0).length;
    ninePanel(this, w - 54, 68, 92, 34).setDepth(2.5);
    this.add
      .text(w - 54, 68, `${found} / ${all.length}`, { fontFamily: FONT, fontSize: '13px', color: '#ffd86b' })
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

  /** Enemies for the active tab, in roster (progression) order. */
  private entries(): EnemyDef[] {
    return allEnemyDefs().filter((e) => (this.tab === 'boss') === !!e.isBoss);
  }

  private render(): void {
    this.content.removeAll(true);
    const w = this.scale.width;
    for (const tb of this.tabButtons) tb.tab.setActive(tb.id === this.tab);

    let y = this.viewTop + 8;
    let band = 0;
    for (const def of this.entries()) {
      this.renderRow(def, y, w, band++);
      y += 64;
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  /** Small enemy thumbnail; black silhouette while undiscovered. */
  private thumb(x: number, y: number, def: EnemyDef, size: number, known: boolean): Phaser.GameObjects.Image {
    const tex = this.textures.get(def.textureKey);
    const frame = tex.has('1') ? 1 : undefined;
    const img = this.add.image(x, y, def.textureKey, frame);
    img.setScale(size / 96);
    if (!known) {
      img.setTint(0x11131f).setTintMode(Phaser.TintModes.FILL);
    } else if (def.tint) {
      img.setTint(Phaser.Display.Color.HexStringToColor(def.tint).color);
    }
    return img;
  }

  private renderRow(def: EnemyDef, y: number, w: number, band: number): void {
    const kills = gameState.killCounts[def.id] ?? 0;
    const known = kills > 0;
    const rowH = 60;
    const cy = y + rowH / 2;
    const bg = rowBand(this, y, rowH, band);
    this.content.add(bg);
    this.content.add(this.thumb(38, cy, def, 44, known));
    this.content.add(
      this.add.text(70, y + 8, known ? def.name : '？？？', {
        fontFamily: FONT,
        fontSize: '14px',
        color: known ? '#ffffff' : '#5a607a',
      }),
    );
    if (known) {
      const bits: string[] = [`討伐 ${kills}`];
      if (isElement(def.weakness)) bits.push(`弱点:${ELEMENT_LABEL[def.weakness]}`);
      if (def.variantOf) bits.push('亜種');
      this.content.add(
        this.add.text(70, y + 30, bits.join('　'), { fontFamily: FONT, fontSize: '11px', color: '#9aa0b5' }),
      );
      this.content.add(
        this.add.text(w - 20, cy, '›', { fontFamily: FONT, fontSize: '16px', color: '#6a7090' }).setOrigin(1, 0.5),
      );
      // Whole row opens the detail panel.
      const hit = this.add
        .rectangle(w / 2, y - 4, w - 16, rowH, 0x000000, 0.001)
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (this.dragged) return;
        this.openDetail(def, kills);
      });
      this.content.add(hit);
    } else {
      this.content.add(
        this.add.text(70, y + 30, '倒すと登録される', { fontFamily: FONT, fontSize: '11px', color: '#4a4f66' }),
      );
    }
  }

  /** Rough drop-frequency label from the table rate. */
  private rateLabel(rate: number, guaranteedFirst: boolean): { text: string; color: string } {
    if (guaranteedFirst) return { text: '初回確定', color: '#ffd86b' };
    if (rate >= 1) return { text: '確定', color: '#9fe3a0' };
    if (rate >= 0.5) return { text: 'よく落ちる', color: '#cfe0a0' };
    if (rate >= 0.15) return { text: 'たまに', color: '#9fd0ff' };
    return { text: 'レア', color: '#e8a0ff' };
  }

  private openDetail(def: EnemyDef, kills: number): void {
    this.closeDetail();
    const w = this.scale.width;
    const h = this.scale.height;
    const panelW = w - 24;
    const panelH = Math.min(430, h - 140);
    const cx = w / 2;
    const cy = h / 2 - 10;
    const c = this.add.container(0, 0).setDepth(10);
    // Dim + swallow taps behind the panel.
    const shade = this.add.rectangle(0, 0, w, h, 0x05060c, 0.7).setOrigin(0).setInteractive();
    shade.on('pointerup', () => this.closeDetail());
    c.add(shade);
    const panel = this.add
      .rectangle(cx, cy, panelW, panelH, 0x161a2e, 1)
      .setStrokeStyle(1.5, 0x4a5078, 1)
      .setInteractive(); // eat taps so the shade doesn't close under the panel
    c.add(panel);
    const top = cy - panelH / 2;

    c.add(this.thumb(cx, top + 58, def, 84, true));
    c.add(
      this.add
        .text(cx, top + 112, def.name, { fontFamily: FONT, fontSize: '16px', color: '#fff' })
        .setOrigin(0.5),
    );
    const tags: string[] = [def.isBoss ? '大型モンスター' : '通常モンスター'];
    if (def.variantOf) tags.push('亜種');
    c.add(
      this.add
        .text(cx, top + 132, `${tags.join('・')}　討伐数 ${kills}`, { fontFamily: FONT, fontSize: '11px', color: '#9aa0b5' })
        .setOrigin(0.5),
    );

    // Weakness / resist chips.
    let ey = top + 154;
    const elemBits: { label: string; el: string; good: boolean }[] = [];
    if (isElement(def.weakness)) elemBits.push({ label: '弱点', el: def.weakness, good: true });
    if (isElement(def.resist)) elemBits.push({ label: '耐性', el: def.resist, good: false });
    if (elemBits.length) {
      const parts = elemBits
        .map((b) => `${b.label}: ${ELEMENT_LABEL[b.el as never]}`)
        .join('　');
      const t = this.add.text(cx, ey, parts, { fontFamily: FONT, fontSize: '12px', color: '#cfd3e6' }).setOrigin(0.5);
      // Color the element words themselves is fiddly in one text object; tint line subtly instead.
      if (elemBits[0]) t.setColor(elementColorHex(elemBits[0].el as never));
      c.add(t);
      ey += 22;
    }

    // Flavor text.
    if (def.description) {
      c.add(
        this.add
          .text(cx, ey, def.description, {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#b8bed4',
            // useAdvancedWrap: Japanese has no spaces; plain wrap never breaks.
            wordWrap: { width: panelW - 40, useAdvancedWrap: true },
            align: 'center',
            lineSpacing: 4,
          })
          .setOrigin(0.5, 0),
      );
      ey += 54;
    }

    // Drops.
    const table = def.dropTableId ? getDropTable(def.dropTableId) : undefined;
    if (table) {
      c.add(this.add.text(cx - panelW / 2 + 18, ey, '― ドロップ ―', { fontFamily: FONT, fontSize: '11px', color: '#c9b27a' }));
      ey += 20;
      for (const e of table.entries) {
        if (ey > cy + panelH / 2 - 48) break; // keep inside the panel
        const guaranteedFirst = !!e.bossFirstGuaranteed && e.dropRate <= 0;
        const r = this.rateLabel(e.dropRate, guaranteedFirst);
        const isGear = !!getEquipment(e.itemId);
        c.add(
          this.add.text(cx - panelW / 2 + 22, ey, `${itemDisplayName(e.itemId)}${isGear ? '（装備）' : ''}`, {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#e6e9f5',
          }),
        );
        c.add(
          this.add
            .text(cx + panelW / 2 - 20, ey, r.text, { fontFamily: FONT, fontSize: '11px', color: r.color })
            .setOrigin(1, 0),
        );
        ey += 20;
      }
    }

    const closeBtn = pillButton(this, cx, cy + panelH / 2 - 24, 'とじる', () => this.closeDetail(), {
      color: '#ffe9a8',
      bg: '#39406a',
      size: 13,
    });
    c.add(closeBtn);
    this.detail = c;
  }

  private closeDetail(): void {
    this.detail?.destroy();
    this.detail = null;
  }

  private setupScroll(): void {
    let startY = 0;
    let startScroll = 0;
    let inList = false;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startY = p.y;
      startScroll = this.scrollY;
      this.dragged = false;
      // Header/footer taps must never turn into a drag; detail panel blocks too.
      inList = p.y >= this.viewTop && p.y <= this.viewBottom && !this.detail;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !inList) return;
      const d = startY - p.y;
      if (Math.abs(d) > 12) this.dragged = true;
      if (this.dragged) this.scrollTo(startScroll + d);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (!this.detail) this.scrollTo(this.scrollY + dy * 0.5);
    });
  }

  private scrollTo(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  private close(): void {
    this.closeDetail();
    this.scene.stop();
    this.scene.resume('Inventory');
  }
}
