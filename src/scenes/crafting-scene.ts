import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getEquipment, getMaterial, getConsumable, itemDisplayName } from '@/data/items';
import { rarityColor } from '@/data/rarity';
import { allRecipes, type Recipe } from '@/crafting/recipes';
import { craft, craftBlock, visibleRecipes } from '@/crafting/crafting';
import {
  BOSS_RARE_EXCHANGE_COST,
  exchangeBossRareMaterial,
  getBossRareExchangeForMaterial,
} from '@/crafting/boss-rare-exchange';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, type TabHandle } from '@/ui/theme';
import { TEX } from '@/assets/gen/textures';
import { KineticScroll } from '@/ui/kinetic-scroll';

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
  private viewTop = 132;
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

    // A quiet workshop header: the generated forge art supplies atmosphere,
    // while one compact workbench bar carries identity and currency.
    const header = this.add.graphics().setDepth(3);
    header.fillStyle(0x111a21, 0.96);
    header.fillRoundedRect(8, 7, w - 16, 34, 5);
    header.fillStyle(0xd28a3b, 0.95);
    header.fillRoundedRect(8, 12, 3, 24, 1);
    header.lineStyle(1, 0xe7c985, 0.32);
    header.strokeRoundedRect(8, 7, w - 16, 34, 5);
    this.add.image(27, 24, TEX.iconSword).setDisplaySize(19, 19).setTint(0xffd88a).setDepth(4);
    this.add
      .text(43, 23, '鍛冶工房', { fontFamily: FONT, fontSize: '15px', color: '#fff4d6', fontStyle: 'bold' })
      .setOrigin(0, 0.5)
      .setDepth(4);
    this.add.circle(w - 108, 23, 5, 0xf1bc45).setStrokeStyle(1, 0xffe6a1, 0.72).setDepth(4);
    this.goldText = this.add
      .text(w - 18, 23, '', { fontFamily: FONT, fontSize: '12px', color: '#ffe2a3', fontStyle: 'bold' })
      .setOrigin(1, 0.5)
      .setDepth(4);

    // One segmented tool rail reads as a single control instead of three
    // unrelated floating cards.
    const tabRail = this.add.graphics().setDepth(3);
    tabRail.fillStyle(0x0c141b, 0.94);
    tabRail.fillRoundedRect(8, 48, w - 16, 36, 5);
    tabRail.lineStyle(1, 0xffffff, 0.09);
    tabRail.strokeRoundedRect(8, 48, w - 16, 36, 5);
    this.tabButtons = [];
    const tabs: { id: CraftTab; label: string; icon: string }[] = [
      { id: 'weapon', label: '武器', icon: TEX.iconSword },
      { id: 'armor', label: '防具', icon: TEX.iconArmor },
      { id: 'tool', label: 'どうぐ', icon: TEX.iconFlask },
    ];
    const mainTabW = (w - 16) / tabs.length;
    tabs.forEach((t, i) => {
      const tab = this.mainTab(8 + mainTabW * (i + 0.5), 66, mainTabW, t.label, t.icon, () => {
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
    addPanelChrome(this, this.viewTop, this.viewBottom, {
      backdropKey: TEX.uiCraftingBackdrop,
      backdropAlpha: 0.2,
      chromeColor: 0x0d161e,
      chromeAlpha: 0.92,
    });
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

  /** Screen-specific segmented tab used by the forge's primary navigation. */
  private mainTab(
    cx: number,
    cy: number,
    width: number,
    label: string,
    iconKey: string,
    onTap: () => void,
  ): TabHandle {
    const g = this.add.graphics();
    const icon = this.add.image(-22, -1, iconKey).setDisplaySize(15, 15);
    const text = this.add
      .text(6, -1, label, { fontFamily: FONT, fontSize: '13px', color: '#aab4bd', fontStyle: 'bold' })
      .setOrigin(0.5);
    const root = this.add.container(cx, cy, [g, icon, text]);
    root.setSize(width, 36).setInteractive({ useHandCursor: true });
    root.on('pointerup', onTap);
    const draw = (active: boolean): void => {
      g.clear();
      if (active) {
        g.fillStyle(0x263845, 0.96);
        g.fillRoundedRect(-width / 2 + 2, -16, width - 4, 32, 4);
        g.fillStyle(0xe2a54a, 1);
        g.fillRoundedRect(-width / 2 + 18, 13, width - 36, 3, 1);
      }
      g.lineStyle(1, 0xffffff, active ? 0.1 : 0.04);
      g.lineBetween(width / 2 - 1, -11, width / 2 - 1, 11);
      icon.setTint(active ? 0xffd27a : 0x71808b);
      text.setColor(active ? '#fff4d6' : '#9ba6ae');
    };
    draw(false);
    return { root, setActive: draw };
  }

  /** Compact filter label for the horizontally draggable weapon/armour rail. */
  private filterChip(
    cx: number,
    cy: number,
    width: number,
    label: string,
    onTap: () => void,
  ): TabHandle {
    const g = this.add.graphics();
    const text = this.add
      .text(0, -1, label, { fontFamily: FONT, fontSize: '12px', color: '#9aa6af' })
      .setOrigin(0.5);
    const root = this.add.container(cx, cy, [g, text]);
    root.setSize(width, 30).setInteractive({ useHandCursor: true });
    root.on('pointerup', onTap);
    const draw = (active: boolean): void => {
      g.clear();
      g.fillStyle(active ? 0x273942 : 0x101a21, active ? 0.98 : 0.82);
      g.fillRoundedRect(-width / 2, -14, width, 28, 4);
      if (active) {
        g.fillStyle(0xe0a24a, 0.98);
        g.fillRoundedRect(-width / 2 + 8, 10, width - 16, 2, 1);
      }
      g.lineStyle(1, active ? 0xd9b56f : 0xffffff, active ? 0.28 : 0.06);
      g.strokeRoundedRect(-width / 2, -14, width, 28, 4);
      text.setColor(active ? '#fff1cf' : '#9aa6af');
    };
    draw(false);
    return { root, setActive: draw };
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
    const cy = 108;
    for (const [value, label] of defs) {
      const chipW = label.length * 13 + 28;
      const tab = this.filterChip(x + chipW / 2, cy, chipW, label, () => {
        if (this.chipDragging) return;
        this.subFilter = value;
        this.scrollY = 0;
        for (const c of this.filterChips) c.tab.setActive(c.value === value);
        this.render();
      });
      tab.setActive(value === this.subFilter);
      bar.add(tab.root);
      this.filterChips.push({ value, tab });
      x += chipW + 6;
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
    new KineticScroll(this, {
      axis: 'x',
      viewport: () => new Phaser.Geom.Rectangle(0, 90, this.scale.width, 36),
      getValue: () => -(this.chipBar?.x ?? 0),
      getMax: () => Math.max(0, this.chipBarWidth - this.scale.width),
      setValue: (value) => {
        if (!this.chipBar) return;
        this.chipBar.x = -value;
        this.updateChipEdgeHints();
      },
      enabled: () => !!this.chipBar,
      onTouchStart: () => {
        this.chipNudge?.remove();
        this.chipNudge = null;
      },
      onDragState: (dragged) => {
        this.chipDragging = dragged;
      },
      indicator: false,
    });
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
        this.rowQueue.push({ kind: 'recipe', y, h: 94, r, band: band++ });
        y += 94;
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
        this.rowQueue.push({ kind: 'header', y, h: 60, group: g, band: band++ });
        y += 60;
        if (this.expanded.has(g.key)) {
          for (const r of g.recipes) {
            this.rowQueue.push({ kind: 'recipe', y, h: 94, r, band: band++ });
            y += 94;
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
   * lists froze the phone otherwise. Heights vary (header 60 / recipe 94) so
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
    const h = 58;
    const open = this.expanded.has(g.key);
    const surface = this.add.graphics();
    surface.fillStyle(open ? 0x172a32 : band % 2 ? 0x101a21 : 0x121d24, 0.96);
    surface.fillRoundedRect(8, y - 2, w - 16, h, 5);
    surface.fillStyle(rarityColor(g.rarity), open ? 0.95 : 0.68);
    surface.fillRoundedRect(8, y + 5, 3, h - 14, 1);
    if (g.craftable > 0) {
      surface.fillStyle(0x4a341d, 0.92);
      surface.fillRoundedRect(w - 112, y + 28, 76, 20, 3);
      surface.lineStyle(1, 0xe2b863, 0.35);
      surface.strokeRoundedRect(w - 112, y + 28, 76, 20, 3);
    }
    surface.lineStyle(1, open ? 0xe1b867 : 0xffffff, open ? 0.24 : 0.07);
    surface.strokeRoundedRect(8, y - 2, w - 16, h, 5);
    this.content.add(surface);
    this.content.add(
      this.add
        .rectangle(29, y + 27, 30, 30, 0x091219, 0.94)
        .setStrokeStyle(1, rarityColor(g.rarity), open ? 0.75 : 0.4),
    );
    this.content.add(
      this.add.image(29, y + 27, this.resultIcon(g.recipes[0].resultItemId)).setDisplaySize(20, 20)
        .setTint(open ? 0xffd78a : 0xa7b1b8),
    );
    this.content.add(
      this.add.text(50, y + 6, g.label === 'その他' ? 'その他' : `${g.label}シリーズ`, {
        fontFamily: FONT,
        fontSize: '14px',
        color: open ? '#fff2d0' : '#e7edf0',
        fontStyle: 'bold',
      }),
    );
    this.content.add(
      this.add.text(50, y + 31, `Lv${g.minLv}  ·  ${g.recipes.length}部位`, {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#8f9ca4',
      }),
    );
    if (g.craftable > 0) {
      this.content.add(
        this.add
          .text(w - 74, y + 38, `制作可 ${g.craftable}`, {
            fontFamily: FONT,
            fontSize: '10px',
            color: '#ffd98a',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
    }
    this.content.add(
      this.add.text(w - 20, y + 26, open ? '−' : '+', {
        fontFamily: FONT,
        fontSize: '16px',
        color: open ? '#ffd47f' : '#8d9aa3',
      }).setOrigin(0.5),
    );
    // Whole-row tap target (kept last so it sits above the visuals).
    const zone = this.add
      .rectangle(w / 2, y + h / 2, w, h, 0x000000, 0.001)
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
    const rowH = 92;
    const block = craftBlock(gameState, r);
    const craftable = block === null;
    const missingRare = Object.entries(r.materials)
      .map(([id, qty]) => ({
        id,
        missing: (gameState.materials[id] ?? 0) < qty,
        exchange: getBossRareExchangeForMaterial(id),
      }))
      .find((entry) => entry.missing && entry.exchange);
    const proofHave = missingRare?.exchange
      ? gameState.materials[missingRare.exchange.proofItemId] ?? 0
      : 0;
    const exchangeReady = !!missingRare && proofHave >= BOSS_RARE_EXCHANGE_COST;
    const resultRarity =
      getEquipment(r.resultItemId)?.rarity ?? getMaterial(r.resultItemId)?.rarity;
    const surface = this.add.graphics();
    surface.fillStyle(craftable ? 0x17252a : band % 2 ? 0x10181e : 0x111a20, 0.97);
    surface.fillRoundedRect(14, y - 2, w - 22, rowH, 5);
    surface.fillStyle(craftable ? 0xe09a42 : rarityColor(resultRarity), craftable ? 0.92 : 0.3);
    surface.fillRoundedRect(14, y + 7, 3, rowH - 18, 1);
    surface.lineStyle(1, craftable ? 0xe0b66c : 0xffffff, craftable ? 0.22 : 0.06);
    surface.strokeRoundedRect(14, y - 2, w - 22, rowH, 5);
    this.content.add(surface);
    // Result icon cell (rarity border), dimmed when unaffordable.
    const border = craftable ? rarityColor(resultRarity) : 0x48545c;
    const cy = y + 42;
    this.content.add(
      this.add.rectangle(38, cy, 38, 38, 0x091218, 0.98).setStrokeStyle(1, border, craftable ? 0.82 : 0.42),
    );
    this.content.add(
      this.add
        .image(38, cy, this.resultIcon(r.resultItemId))
        .setDisplaySize(24, 24)
        .setTint(craftable ? 0xffe0a0 : 0x6f7b82),
    );
    this.content.add(
      this.add.text(64, y + 7, `${itemDisplayName(r.resultItemId)} ×${r.resultQty}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: craftable ? '#fff3d6' : '#d9e0e3',
        fontStyle: 'bold',
      }),
    );

    // Requirements read like a compact bill of materials. Tiny status dots
    // carry pass/fail colour so the text itself stays calm and legible.
    const costs: { label: string; ok: boolean }[] = [];
    for (const [id, qty] of Object.entries(r.materials)) {
      const have = gameState.materials[id] ?? 0;
      costs.push({ label: `${itemDisplayName(id)} ${have}/${qty}`, ok: have >= qty });
      if (id === missingRare?.id) {
        costs.push({
          label: `討伐証 ${proofHave}/${BOSS_RARE_EXCHANGE_COST}`,
          ok: exchangeReady,
        });
      }
    }
    for (const eq of r.consumeEquipment ?? []) {
      const have = gameState.ownedEquipmentCount(eq);
      costs.push({ label: `${itemDisplayName(eq)}(装) ${have}/1`, ok: have >= 1 });
    }
    costs.push({ label: `${r.gold}G`, ok: gameState.gold >= r.gold });
    let lineX = 64;
    let lineY = y + 34;
    const maxCostX = w - 82;
    for (const c of costs) {
      const t = this.add.text(0, 0, c.label, {
        fontFamily: FONT,
        fontSize: '10px',
        color: c.ok ? '#b8c4c9' : '#e29b91',
      });
      const entryW = t.width + 16;
      if (lineX + entryW > maxCostX && lineX > 64) {
        lineX = 64;
        lineY += 18;
      }
      t.setPosition(lineX + 9, lineY);
      this.content.add(this.add.circle(lineX + 3, lineY + 7, 2.5, c.ok ? 0x6fb584 : 0xc56c62));
      this.content.add(t);
      lineX += entryW;
    }

    // Command stays in one fixed place for every row. Unavailable recipes keep
    // the same silhouette, which makes the craftable amber buttons pop.
    const buttonPlate = this.add.graphics();
    buttonPlate.fillStyle(craftable ? 0xb96c2f : exchangeReady ? 0x245c5a : 0x1d282e, 1);
    buttonPlate.fillRoundedRect(-30, -19, 60, 38, 5);
    buttonPlate.fillStyle(
      craftable ? 0xffc465 : exchangeReady ? 0x68d1c3 : 0x53616a,
      craftable || exchangeReady ? 0.9 : 0.35,
    );
    buttonPlate.fillRoundedRect(-30, -19, 3, 38, { tl: 5, tr: 0, bl: 5, br: 0 });
    buttonPlate.lineStyle(
      1,
      craftable ? 0xffd383 : exchangeReady ? 0x8ce5d8 : 0x71808a,
      craftable || exchangeReady ? 0.62 : 0.2,
    );
    buttonPlate.strokeRoundedRect(-30, -19, 60, 38, 5);
    const blockedLabel = block === 'gold' ? 'G不足' : block === 'equipment' ? '装備不足' : '素材不足';
    const buttonLabel = craftable
      ? '制作'
      : missingRare
        ? exchangeReady
          ? '交換'
          : `証 ${proofHave}/${BOSS_RARE_EXCHANGE_COST}`
        : blockedLabel;
    const buttonText = this.add
      .text(0, 0, buttonLabel, {
        fontFamily: FONT,
        fontSize: craftable || exchangeReady ? '12px' : '9px',
        color: craftable ? '#fff5d6' : exchangeReady ? '#d8fff9' : '#7f8c94',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const btn = this.add.container(w - 45, cy, [buttonPlate, buttonText]).setSize(62, 42);
    if (craftable || exchangeReady) {
      btn.setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => btn.setScale(0.96));
      btn.on('pointerout', () => btn.setScale(1));
      btn.on('pointerup', () => {
        btn.setScale(1);
        if (this.dragged) return;
        if (craftable && craft(gameState, r)) {
          this.flash(`${itemDisplayName(r.resultItemId)} を作った！`);
          bus.emit('sfx:play', { id: 'craft' });
        } else if (
          exchangeReady
          && missingRare
          && exchangeBossRareMaterial(gameState, missingRare.id)
        ) {
          this.flash(`${itemDisplayName(missingRare.id)} と交換した！`);
          bus.emit('sfx:play', { id: 'craft' });
        }
        this.render();
      });
    }
    this.content.add(btn);
  }

  private flash(msg: string): void {
    const t = this.add
      .text(0, -1, msg, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#fff0c6',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const plate = this.add.graphics();
    const toastW = Math.min(this.scale.width - 32, Math.max(150, t.width + 30));
    plate.fillStyle(0x101a20, 0.97);
    plate.fillRoundedRect(-toastW / 2, -17, toastW, 34, 5);
    plate.lineStyle(1, 0xe2ad59, 0.55);
    plate.strokeRoundedRect(-toastW / 2, -17, toastW, 34, 5);
    const toast = this.add
      .container(this.scale.width / 2, this.viewBottom - 20, [plate, t])
      .setDepth(5);
    this.tweens.add({
      targets: toast,
      y: toast.y - 6,
      alpha: 0,
      delay: 750,
      duration: 450,
      onComplete: () => toast.destroy(),
    });
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
