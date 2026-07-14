import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getEquipment, getMaterial, getConsumable, itemDisplayName } from '@/data/items';
import { rarityColor } from '@/data/rarity';
import { allRecipes, type Recipe } from '@/crafting/recipes';
import { craft, craftBlock, visibleRecipes } from '@/crafting/crafting';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, tabChip, ninePanel, type TabHandle } from '@/ui/theme';
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
  /** Scroll target of this render's seeded jump (-1 = none); extends maxScroll. */
  private seedScroll = -1;

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

    // One continuous forge header reads as a single screen identity. The old
    // split title/currency frames competed with each other at the top.
    ninePanel(this, w / 2, 23, w - 16, 38).setDepth(2.5);
    this.add.image(26, 23, TEX.iconSword).setScale(1.35).setTint(0xffdf85).setDepth(3);
    this.add
      .text(44, 23, '装備工房', { fontFamily: FONT, fontSize: '16px', color: '#fff4cf', fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.add.circle(w - 112, 23, 5, 0xf5c542).setStrokeStyle(1, 0xffe995, 0.7).setDepth(3);
    this.goldText = this.add
      .text(w - 20, 23, '', { fontFamily: FONT, fontSize: '12px', color: '#ffe39a' })
      .setOrigin(1, 0.5)
      .setDepth(3);

    // Tabs: weapons / armour / tools.
    this.tabButtons = [];
    const tabs: { id: CraftTab; label: string; icon: string }[] = [
      { id: 'weapon', label: '武器', icon: TEX.iconSword },
      { id: 'armor', label: '防具', icon: TEX.iconArmor },
      { id: 'tool', label: 'どうぐ', icon: TEX.iconFlask },
    ];
    const mainTabW = (w - 12) / tabs.length;
    tabs.forEach((t, i) => {
      const tab = tabChip(this, 6 + mainTabW * (i + 0.5), 62, mainTabW, t.label, () => {
        if (this.dragged) return;
        this.tab = t.id;
        this.subFilter = null;
        this.scrollY = 0;
        this.buildFilterChips();
        this.render();
      }, { icon: t.icon });
      tab.root.setDepth(3);
      this.tabButtons.push({ id: t.id, tab });
    });
    this.buildFilterChips();

    this.content = this.add.container(0, 0).setDepth(1);
    this.viewBottom = h - 72;
    addPanelChrome(this, this.viewTop, this.viewBottom);
    this.setupScroll();

    const closeDisc = this.add
      .circle(0, 0, 20, 0x152238, 0.98)
      .setStrokeStyle(1, 0xe2c978, 0.7);
    const closeGlyph = this.add
      .text(0, -1, '×', { fontFamily: FONT, fontSize: '22px', color: '#fff1c4' })
      .setOrigin(0.5);
    const closeBtn = this.add
      .container(w / 2, h - 36, [closeDisc, closeGlyph])
      .setSize(48, 48)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => closeBtn.setScale(0.94));
    closeBtn.on('pointerout', () => closeBtn.setScale(1));
    closeBtn.on('pointerup', () => {
      closeBtn.setScale(1);
      this.close();
    });
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
    this.goldText.setText(`${gameState.gold.toLocaleString()} G`);
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
      this.seedScroll = -1;
      for (const g of groups) {
        if (g.key === seededKey) this.scrollY = this.seedScroll = Math.max(0, y - (this.viewTop + 8));
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
    // The seeded jump must land its group exactly at the top of the view even
    // when that group sits near the list's end — otherwise the clamp leaves it
    // mid-screen (and made the E2E craft tap land on the wrong row when RNG
    // drops changed which recipes were visible).
    if (this.seedScroll > this.maxScroll) this.maxScroll = this.seedScroll;
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
    const open = this.expanded.has(g.key);
    const surface = this.add.graphics();
    surface.fillStyle(open ? 0x13263a : band % 2 ? 0x0e1b2b : 0x0c1827, 0.96);
    surface.fillRoundedRect(8, y - 3, w - 16, h, 5);
    surface.fillStyle(rarityColor(g.rarity), 0.82);
    surface.fillRoundedRect(8, y + 5, 3, h - 16, 1);
    surface.lineStyle(1, 0xffffff, open ? 0.14 : 0.07);
    surface.strokeRoundedRect(8, y - 3, w - 16, h, 5);
    this.content.add(surface);
    this.content.add(
      this.add.circle(23, y + 17, 9, 0x07111e, 0.92).setStrokeStyle(1, 0xffffff, 0.08),
    );
    this.content.add(
      this.add.text(23, y + 16, open ? '−' : '+', {
        fontFamily: FONT,
        fontSize: '12px',
        color: open ? '#ffe39a' : '#aab6c4',
      }).setOrigin(0.5),
    );
    this.content.add(
      this.add.text(40, y + 8, g.label === 'その他' ? 'その他' : `${g.label}シリーズ`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#eef3f7',
        fontStyle: 'bold',
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
          .text(w - 54, y + 9, `作成可 ${g.craftable}`, {
            fontFamily: FONT,
            fontSize: '10px',
            color: '#e4c66e',
          })
          .setOrigin(1, 0),
      );
    }
    // Piece-state strip (max 12 cells fits 360px portrait).
    let x = 43;
    const iy = y + 44;
    for (const r of g.recipes.slice(0, 12)) {
      const blocked = !!craftBlock(gameState, r);
      const owned = gameState.ownedEquipmentCount(r.resultItemId) > 0;
      const border = owned ? 0x63826e : blocked ? 0x303b48 : 0xd0aa4c;
      const fill = owned ? 0x14271f : blocked ? 0x08121e : 0x302718;
      this.content.add(
        this.add.rectangle(x, iy, 22, 22, fill, 1).setStrokeStyle(1, border, blocked ? 0.55 : 0.88),
      );
      const img = this.add
        .image(x, iy, this.resultIcon(r.resultItemId))
        .setDisplaySize(16, 16)
        .setTint(owned ? 0x9fc5ab : blocked ? 0x596575 : 0xffdda0);
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
    const block = craftBlock(gameState, r);
    const resultRarity =
      getEquipment(r.resultItemId)?.rarity ?? getMaterial(r.resultItemId)?.rarity;
    const surface = this.add.graphics();
    surface.fillStyle(band % 2 ? 0x091523 : 0x0a1726, 0.97);
    surface.fillRoundedRect(18, y - 3, w - 26, rowH, 4);
    surface.fillStyle(rarityColor(resultRarity), block ? 0.28 : 0.68);
    surface.fillRect(18, y + 6, 2, rowH - 18);
    surface.lineStyle(1, 0xffffff, 0.055);
    surface.strokeRoundedRect(18, y - 3, w - 26, rowH, 4);
    this.content.add(surface);
    // Result icon cell (rarity border), dimmed when unaffordable.
    const border = block ? 0x4a4f5c : rarityColor(resultRarity);
    const cy = y + rowH / 2;
    this.content.add(
      this.add.rectangle(37, cy, 30, 30, 0x0a1220, 1).setStrokeStyle(1, border, block ? 0.5 : 0.8),
    );
    this.content.add(
      this.add.image(37, cy, this.resultIcon(r.resultItemId)).setTint(block ? 0x737d8c : 0xf2e4bd),
    );
    this.content.add(
      this.add.text(58, y + 6, `${itemDisplayName(r.resultItemId)} ×${r.resultQty}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#eef3f7',
        fontStyle: 'bold',
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
    let lineX = 58;
    let lineY = y + 28;
    for (const c of costs) {
      const t = this.add.text(lineX, lineY, c.label, {
        fontFamily: FONT,
        fontSize: '11px',
        color: c.ok ? '#a8b8c8' : '#df8a83',
      });
      this.content.add(t);
      lineX = t.x + t.width + 10;
      // Wrap long upgrade-recipe cost lists to a second row.
      if (lineX > w - 96 && lineY === y + 28) {
        lineX = 58;
        lineY = y + 46;
      }
    }

    if (block) {
      this.content.add(
        this.add
          .text(w - 16, cy, '素材不足', { fontFamily: FONT, fontSize: '10px', color: '#727f8e' })
          .setOrigin(1, 0.5),
      );
    } else {
      const buttonPlate = this.add.graphics();
      buttonPlate.fillStyle(0x2b2619, 1);
      buttonPlate.fillRoundedRect(-29, -15, 58, 30, 4);
      buttonPlate.fillStyle(0xd0aa4c, 0.9);
      buttonPlate.fillRoundedRect(-29, -15, 3, 30, { tl: 4, tr: 0, bl: 4, br: 0 });
      buttonPlate.lineStyle(1, 0xe5ca7b, 0.58);
      buttonPlate.strokeRoundedRect(-29, -15, 58, 30, 4);
      const buttonText = this.add
        .text(0, 0, '作る', { fontFamily: FONT, fontSize: '12px', color: '#ffeab0', fontStyle: 'bold' })
        .setOrigin(0.5);
      const btn = this.add
        .container(w - 45, cy, [buttonPlate, buttonText])
        .setSize(58, 34)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => btn.setScale(0.96));
      btn.on('pointerout', () => btn.setScale(1));
      btn.on('pointerup', () => {
        btn.setScale(1);
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
