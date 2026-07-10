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

/** One gear set on the list (MH-style row: name + piece icons, tap to open). */
interface SeriesGroup {
  /** Expansion key, `tab:label`. */
  key: string;
  label: string;
  minLv: number;
  rarity: number;
  recipes: Recipe[];
  craftable: number;
}

/** Virtualized list rows: collapsed series headers and expanded recipe rows. */
type ListEntry =
  | { kind: 'header'; y: number; h: number; group: SeriesGroup; band: number }
  | { kind: 'recipe'; y: number; h: number; r: Recipe; band: number };

export class CraftingScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 128;
  private viewBottom = 0;
  private tab: CraftTab = 'weapon';
  private tabButtons: { id: CraftTab; tab: TabHandle }[] = [];
  /** Sub-filter (weapon type / armour slot) selected in the chip row. */
  private subFilter: string | null = null;
  private filterChips: { value: string | null; tab: TabHandle }[] = [];
  /** Horizontally-scrollable chip bar (one big-finger-sized row). */
  private chipBar: Phaser.GameObjects.Container | null = null;
  private chipBarWidth = 0;
  private chipDragging = false;
  /** Edge chevrons hinting that more chips are hidden left/right. */
  private chipHintL: Phaser.GameObjects.Container | null = null;
  private chipHintR: Phaser.GameObjects.Container | null = null;
  /** Attention nudge played when an overflowing chip bar first appears. */
  private chipNudge: Phaser.Tweens.Tween | null = null;
  /** All rows as data (virtualized; see render/updateWindow). */
  private rowQueue: ListEntry[] = [];
  /** Game objects of currently-materialized rows, keyed by row index. */
  private liveRows = new Map<number, Phaser.GameObjects.GameObject[]>();
  /** Expanded series groups (key = tab:label), sticky across re-renders. */
  private expanded = new Set<string>();
  /** Tabs whose first craftable group was auto-opened once already. */
  private seededTabs = new Set<CraftTab>();

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
        this.subFilter = null;
        this.scrollY = 0;
        this.buildFilterChips();
        this.render();
      });
      tab.root.setDepth(3);
      this.tabButtons.push({ id: t.id, tab });
    });
    this.buildFilterChips();

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

  /**
   * Second filter row under the tabs: weapon types on 武器, armour slots on
   * 防具 (nothing on どうぐ). Chips flow left→right and wrap; tapping narrows
   * the list so 400+ recipes never need marathon scrolling.
   */
  private buildFilterChips(): void {
    for (const c of this.filterChips) c.tab.root.destroy();
    this.filterChips = [];
    const defs: [string | null, string][] =
      this.tab === 'weapon'
        ? [[null, '全部'], ['sword', '剣'], ['katana', '刀'], ['axe', '斧'], ['spear', '槍'],
           ['dagger', '短剣'], ['mace', '槌'], ['whip', '鞭'], ['bow', '弓'],
           ['shuriken', '手裏剣'], ['shield', '盾'], ['staff', '杖'], ['wand', 'ロッド']]
        : this.tab === 'armor'
          ? [[null, '全部'], ['head', '頭'], ['torso', '胴'], ['back', '背'], ['hands', '手'],
             ['feet', '足'], ['waist', '腰'], ['accessory', 'アクセ']]
          : [];
    this.chipBar?.destroy();
    this.chipBar = null;
    if (defs.length === 0) {
      this.buildChipEdgeHints(0); // no bar → just clears any leftover hints
      return;
    }
    // One horizontally-draggable row of finger-sized chips (3 wrapped rows ate
    // the screen and overlapped the list). Drag sideways to reach 手裏剣/ロッド.
    const bar = this.add.container(0, 0).setDepth(3);
    this.chipBar = bar;
    let x = 8;
    const cy = 102;
    for (const [value, label] of defs) {
      const chipW = label.length * 14 + 32;
      const tab = tabChip(this, x + chipW / 2, cy, chipW, label, () => {
        if (this.chipDragging) return;
        this.subFilter = value;
        this.scrollY = 0;
        for (const c of this.filterChips) c.tab.setActive(c.value === value);
        this.render();
      });
      tab.setActive(value === this.subFilter);
      bar.add(tab.root);
      this.filterChips.push({ value, tab });
      x += chipW + 8;
    }
    this.chipBarWidth = x;
    this.buildChipEdgeHints(cy);
  }

  /**
   * Scrollability affordances for the chip bar: pulsing ‹ › chevrons at the
   * band edges (shown only while chips are hidden in that direction) plus a
   * short slide-and-back nudge when the bar first appears. Without these the
   * bar read as a fixed row and nobody discovered 手裏剣〜ロッド.
   */
  private buildChipEdgeHints(cy: number): void {
    this.chipNudge?.remove();
    this.chipNudge = null;
    this.chipHintL?.destroy();
    this.chipHintR?.destroy();
    this.chipHintL = null;
    this.chipHintR = null;
    const w = this.scale.width;
    if (!this.chipBar || this.chipBarWidth <= w) return;

    const makeHint = (x: number, glyph: string): Phaser.GameObjects.Container => {
      // Small dark pill under the arrow so it stays readable over a chip edge.
      const pill = this.add.graphics();
      pill.fillStyle(0x0e0f1a, 0.88);
      pill.fillRoundedRect(-9, -14, 18, 28, 8);
      const arrow = this.add
        .text(0, 0, glyph, { fontFamily: FONT, fontSize: '16px', color: '#ffd86b' })
        .setOrigin(0.5);
      const c = this.add.container(x, cy, [pill, arrow]).setDepth(4);
      this.tweens.add({
        targets: arrow,
        alpha: { from: 1, to: 0.35 },
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      return c;
    };
    this.chipHintL = makeHint(10, '‹');
    this.chipHintR = makeHint(w - 10, '›');
    this.updateChipEdgeHints();

    // One gentle slide-and-back so the row is *seen* moving. Stopped by any
    // pointerdown (setupScroll) so it never fights a real drag.
    this.chipNudge = this.tweens.add({
      targets: this.chipBar,
      x: -30,
      delay: 450,
      duration: 340,
      yoyo: true,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.updateChipEdgeHints(),
      onComplete: () => this.updateChipEdgeHints(),
    });
  }

  /** Show each chevron only while chips are actually hidden on that side. */
  private updateChipEdgeHints(): void {
    if (!this.chipBar) return;
    const minX = Math.min(0, this.scale.width - this.chipBarWidth);
    this.chipHintL?.setVisible(this.chipBar.x < -4);
    this.chipHintR?.setVisible(this.chipBar.x > minX + 4);
  }

  /** True when a recipe's result matches the active sub-filter chip. */
  private matchesSubFilter(r: Recipe): boolean {
    if (this.subFilter === null) return true;
    const eq = getEquipment(r.resultItemId);
    if (!eq) return false;
    if (this.tab === 'weapon') return (eq.weaponTags ?? [])[0] === this.subFilter;
    if (this.subFilter === 'accessory') return eq.slot.startsWith('accessory');
    return eq.slot === this.subFilter;
  }

  private setupScroll(): void {
    let startPointerY = 0;
    let startScroll = 0;
    let inList = false;
    let startPointerX = 0;
    let inChips = false;
    let chipStartX = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startPointerY = p.y;
      startPointerX = p.x;
      startScroll = this.scrollY;
      this.dragged = false;
      this.chipDragging = false;
      // Header taps (tabs / filter chips) must never turn into a drag — a tiny
      // finger roll was eating chip taps. Only list-area gestures scroll.
      inList = p.y >= this.viewTop && p.y <= this.viewBottom;
      // Chip band: horizontal drag pans the chip bar instead.
      inChips = p.y >= 84 && p.y <= 122 && !!this.chipBar;
      // Freeze the discovery nudge the moment the user touches the screen so
      // it never shifts a chip out from under their finger mid-tap.
      this.chipNudge?.remove();
      this.chipNudge = null;
      chipStartX = this.chipBar?.x ?? 0;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      if (inChips && this.chipBar) {
        const dx = p.x - startPointerX;
        if (Math.abs(dx) > 12) this.chipDragging = true;
        if (this.chipDragging) {
          const minX = Math.min(0, this.scale.width - this.chipBarWidth);
          this.chipBar.x = Phaser.Math.Clamp(chipStartX + dx, minX, 0);
          this.updateChipEdgeHints();
        }
        return;
      }
      if (!inList) return;
      const d = startPointerY - p.y;
      // 12px threshold: forgiving of natural tap wobble on device.
      if (Math.abs(d) > 12) this.dragged = true;
      if (this.dragged) this.scrollTo(startScroll + d);
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
    const inTab = allRecipes().filter(
      (r) => this.recipeCategory(r) === this.tab && this.matchesSubFilter(r),
    );
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
    // Virtualized list: only rows near the viewport exist as game objects.
    // 武器/防具 are grouped MH-style into series rows (name + piece icons)
    // that expand into recipe rows on tap; どうぐ stays a flat list.
    this.rowQueue = [];
    let band = 0;
    if (this.tab === 'tool') {
      for (const r of visible) {
        this.rowQueue.push({ kind: 'recipe', y, h: 76, r, band: band++ });
        y += 76;
      }
    } else {
      const groups = this.buildGroups(visible);
      // First visit of a tab: open the first (lowest-rarity) group with
      // something craftable and jump the list to it, so opening the forge
      // always shows something makeable instead of a wall of locked sets.
      let seededKey: string | null = null;
      if (!this.seededTabs.has(this.tab)) {
        this.seededTabs.add(this.tab);
        const first = groups.find((g) => g.craftable > 0);
        if (first) {
          this.expanded.add(first.key);
          seededKey = first.key;
        }
      }
      for (const g of groups) {
        if (g.key === seededKey) this.scrollY = Math.max(0, y - (this.viewTop + 8));
        this.rowQueue.push({ kind: 'header', y, h: 64, group: g, band: band++ });
        y += 64;
        if (this.expanded.has(g.key)) {
          for (const r of g.recipes) {
            this.rowQueue.push({ kind: 'recipe', y, h: 76, r, band: band++ });
            y += 76;
          }
        }
      }
    }
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

  /** Group visible equipment recipes by their result's gear series. */
  private buildGroups(visible: Recipe[]): SeriesGroup[] {
    const byLabel = new Map<string, Recipe[]>();
    for (const r of visible) {
      const label = getEquipment(r.resultItemId)?.series ?? 'その他';
      const arr = byLabel.get(label);
      if (arr) arr.push(r);
      else byLabel.set(label, [r]);
    }
    const groups: SeriesGroup[] = [];
    for (const [label, recipes] of byLabel) {
      const eqs = recipes.map((r) => getEquipment(r.resultItemId));
      groups.push({
        key: `${this.tab}:${label}`,
        label,
        minLv: Math.min(...eqs.map((e) => e?.levelRequirement ?? 1)),
        rarity: Math.max(...eqs.map((e) => e?.rarity ?? 1)),
        recipes,
        craftable: recipes.filter((r) => !craftBlock(gameState, r)).length,
      });
    }
    // レア度順 (asc): the ladder players climb. その他 (unlabeled one-offs)
    // always sits at the bottom regardless of rarity.
    groups.sort(
      (a, b) =>
        Number(a.label === 'その他') - Number(b.label === 'その他') ||
        a.rarity - b.rarity ||
        a.minLv - b.minLv ||
        a.label.localeCompare(b.label, 'ja'),
    );
    return groups;
  }

  /**
   * Virtual window: create rows near the viewport, destroy rows outside it.
   * Keeps live object count small no matter how many recipes exist — big
   * lists froze the phone otherwise. Heights vary (header 64 / recipe 76) so
   * visibility is tested per entry instead of by fixed pitch.
   */
  private updateWindow(): void {
    if (this.rowQueue.length === 0) return;
    const top = this.scrollY + this.viewTop - 160;
    const bottom = this.scrollY + this.viewBottom + 160;
    // Destroy rows that left the window.
    for (const [idx, objs] of this.liveRows) {
      const q = this.rowQueue[idx];
      if (!q || q.y + q.h < top || q.y > bottom) {
        for (const o of objs) o.destroy();
        this.liveRows.delete(idx);
      }
    }
    // Create rows that entered it (track exactly the objects each row adds).
    const w = this.scale.width;
    for (let i = 0; i < this.rowQueue.length; i++) {
      if (this.liveRows.has(i)) continue;
      const q = this.rowQueue[i];
      if (q.y + q.h < top || q.y > bottom) continue;
      const before = this.content.length;
      if (q.kind === 'header') this.renderSeriesHeader(q.group, q.y, w, q.band);
      else this.renderRecipe(q.r, q.y, w, q.band);
      this.liveRows.set(i, this.content.list.slice(before) as Phaser.GameObjects.GameObject[]);
    }
  }

  /**
   * MH-style series row: rarity accent + name + Lv, and one small cell per
   * piece coloured by state (green border = owned, gold = craftable now,
   * grey = missing materials). Tapping anywhere on the row expands/collapses
   * the recipe rows beneath it.
   */
  private renderSeriesHeader(g: SeriesGroup, y: number, w: number, band: number): void {
    const h = 64;
    this.content.add(rowBand(this, y, h, band));
    this.content.add(
      this.add.rectangle(8, y + h / 2, 4, h - 14, rarityColor(g.rarity), 0.95).setOrigin(0.5),
    );
    const open = this.expanded.has(g.key);
    this.content.add(
      this.add.text(18, y + 9, open ? '▾' : '▸', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#9aa0b4',
      }),
    );
    this.content.add(
      this.add.text(36, y + 7, g.label === 'その他' ? 'その他' : `${g.label}シリーズ`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: rarityColorHex(g.rarity),
      }),
    );
    this.content.add(
      this.add
        .text(w - 16, y + 9, `Lv${g.minLv}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#9aa0b4',
        })
        .setOrigin(1, 0),
    );
    if (g.craftable > 0) {
      this.content.add(
        this.add
          .text(w - 52, y + 9, `作れる ${g.craftable}`, {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#9fd0a0',
          })
          .setOrigin(1, 0),
      );
    }
    // Piece-state strip (max 12 cells fits 360px portrait).
    let x = 40;
    const iy = y + 44;
    for (const r of g.recipes.slice(0, 12)) {
      const blocked = !!craftBlock(gameState, r);
      const owned = gameState.ownedEquipmentCount(r.resultItemId) > 0;
      const border = owned ? 0x63d68a : blocked ? 0x3c4152 : 0xf5c542;
      this.content.add(
        this.add.rectangle(x, iy, 22, 22, 0x1c2036, 1).setStrokeStyle(1.5, border, 1),
      );
      const img = this.add
        .image(x, iy, this.resultIcon(r.resultItemId))
        .setDisplaySize(16, 16)
        .setTint(owned ? 0xbfffce : blocked ? 0x6a7086 : 0xffe9a8);
      this.content.add(img);
      x += 26;
    }
    // Whole-row tap target (kept last so it sits above the visuals).
    const zone = this.add
      .rectangle(w / 2, y + h / 2, w, h - 2, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => {
      if (this.dragged) return;
      if (open) this.expanded.delete(g.key);
      else this.expanded.add(g.key);
      bus.emit('sfx:play', { id: 'ui_tap' });
      this.render();
    });
    this.content.add(zone);
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
