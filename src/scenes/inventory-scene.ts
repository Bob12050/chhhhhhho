import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getEquipment, getConsumable, getMaterial, itemDisplayName } from '@/data/items';
import { rarityColorHex, rarityColor, rarityLabel } from '@/data/rarity';
import { TEX } from '@/assets/gen/textures';
import type { EquipSlot } from '@/equipment/slots';
import type { BaseStats } from '@/stats/stats';
import { expToNext } from '@/stats/leveling';
import { allSkills, getSkill, type SkillDef } from '@/skills/skill-defs';
import { getJob } from '@/jobs/job-defs';
import { appearanceTexKey } from '@/jobs/job-appearance';
import { frameIndex } from '@/paperdoll/pose-atlas';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, rowBand, tabChip, pillButton, type TabHandle } from '@/ui/theme';
import { returnToTitle } from '@/core/game-flow';
import { ELEMENT_LABEL, ELEMENT_COLOR, isElement } from '@/combat/elements';

type Tab = 'items' | 'consumables' | 'equipment' | 'status' | 'skill';

/** Equipment-tab virtual list rows: slot section headers + item rows. */
type EquipEntry =
  | { kind: 'header'; slot: string; count: number; y: number; h: number }
  | { kind: 'row'; id: string; count: number; y: number; h: number; band: number };

const SLOT_LABEL: Record<string, string> = {
  head: '頭',
  torso: '胴',
  hands: '手',
  waist: '腰',
  feet: '足',
  back: '背',
  main_hand: '武器',
  accessory_1: '装飾1',
  accessory_2: '装飾2',
};

/** Short stat labels for the equip-diff display. */
const DIFF_LABEL: Record<string, string> = {
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
 * Bag / menu overlay (replaces the old equipment-only screen). Three tabs:
 * materials, consumables (use), and equipment (equip from owned). Opened from
 * the HUD bag button or the equip-shop NPC. The world is paused while open.
 */
export class InventoryScene extends Phaser.Scene {
  private tab: Tab = 'items';
  private content!: Phaser.GameObjects.Container;
  private goldText!: Phaser.GameObjects.Text;
  private tabButtons: { id: Tab; tab: TabHandle }[] = [];
  /** Virtualized equipment list (slot headers + rows); see updateEquipWindow. */
  private eqQueue: EquipEntry[] = [];
  private eqLive = new Map<number, Phaser.GameObjects.GameObject[]>();
  /** Slot filter for the equipment tab (null = 全部, 'accessory' = both). */
  private slotFilter: string | null = null;
  /** Chip row (equipment tab only), rebuilt on tab switch. */
  private slotChipObjs: Phaser.GameObjects.GameObject[] = [];
  /** Fixed job profile card (equipment/status); never moves with list scroll. */
  private profileObjs: Phaser.GameObjects.GameObject[] = [];
  private skillView: 'loadout' | 'learn' = 'loadout';
  private selectedSkillSlot = 0;
  private skillRefreshPending = false;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 86;
  private viewBottom = 0;

  constructor() {
    super('Inventory');
  }

  init(data: { tab?: Tab }): void {
    this.tab = data.tab ?? 'items';
    this.skillView = 'loadout';
    this.selectedSkillSlot = 0;
    this.skillRefreshPending = false;
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.tabButtons = [];

    // Header band with a bag icon, title, and a coin+gold readout.
    this.add.rectangle(0, 0, w, 50, 0x10121c, 1).setOrigin(0).setDepth(2);
    this.add.image(20, 25, TEX.iconBag).setScale(1.6).setDepth(3);
    this.add
      .text(38, 24, 'もちもの', { fontFamily: FONT, fontSize: '18px', color: '#fff' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.add.circle(w - 60, 25, 6, 0xf5c542).setStrokeStyle(1.5, 0x8a6a1a, 1).setDepth(3);
    this.goldText = this.add
      .text(w - 50, 25, '', { fontFamily: FONT, fontSize: '14px', color: '#ffd86b' })
      .setOrigin(0, 0.5)
      .setDepth(3);

    // Tabs — wider, taller pills with a lit underline on the active one.
    const tabs: { id: Tab; label: string; icon: string }[] = [
      { id: 'items', label: '素材', icon: TEX.iconGem },
      { id: 'consumables', label: '消耗', icon: TEX.iconFlask },
      { id: 'equipment', label: '装備', icon: TEX.iconArmor },
      { id: 'status', label: '能力', icon: TEX.iconShield },
      { id: 'skill', label: '技', icon: TEX.iconStaff },
    ];
    const tabW = Math.floor((w - 16) / tabs.length);
    tabs.forEach((t, i) => {
      const tab = tabChip(this, 8 + i * tabW + tabW / 2, 66, tabW, t.label, () => {
        this.tab = t.id;
        this.renderTab();
      }, { icon: t.icon });
      tab.root.setDepth(3);
      this.tabButtons.push({ id: t.id, tab });
    });

    this.content = this.add.container(0, 0).setDepth(1);
    this.viewBottom = h - 76;
    // Opaque header/footer bars (depth 2) hide the scrolling list (depth 1) so
    // rows never overlap the tabs or the close row.
    addPanelChrome(this, this.viewTop, this.viewBottom, {
      backdropAlpha: 0.84,
      chromeColor: 0x111d36,
      chromeAlpha: 0.97,
    });
    this.add.rectangle(0, 49, w, 1, 0xd8b45b, 0.7).setOrigin(0).setDepth(3);
    this.setupScroll();

    // Close + return-to-title.
    pillButton(this, w / 2, h - 44, 'とじる', () => this.close(), {
      color: '#ffe9a8',
      bg: '#39406a',
      size: 15,
    }).setDepth(3);
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    const toOptions = this.add
      .text(16, h - 44, '⚙ 設定', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9aa0b5',
      })
      .setOrigin(0, 0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    toOptions.on('pointerup', () => {
      this.scene.pause();
      this.scene.launch('Options', { from: 'Inventory' });
    });

    const toBestiary = this.add
      .text(84, h - 44, '📖 図鑑', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9aa0b5',
      })
      .setOrigin(0, 0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    toBestiary.on('pointerup', () => {
      this.scene.pause();
      this.scene.launch('Bestiary');
    });

    const toPets = this.add
      .text(w - 112, h - 44, '🐾 ペット', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9aa0b5',
      })
      .setOrigin(0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    toPets.on('pointerup', () => {
      this.scene.pause();
      this.scene.launch('PetScreen');
    });

    const toTitle = this.add
      .text(w - 16, h - 44, 'タイトルへ', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9aa0b5',
      })
      .setOrigin(1, 0.5)
      .setDepth(3)
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

  private setupScroll(): void {
    let startPointerY = 0;
    let startScroll = 0;
    let inList = false;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startPointerY = p.y;
      startScroll = this.scrollY;
      this.dragged = false;
      // Header/footer taps must never turn into a drag (they ate button taps).
      inList = p.y >= this.viewTop && p.y <= this.viewBottom;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !inList) return;
      const d = startPointerY - p.y;
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
    this.updateEquipWindow();
  }

  /** Recompute scrollable range from the laid-out rows and re-clamp. */
  private updateScrollBounds(): void {
    let bottom = this.viewTop;
    for (const o of this.content.list) {
      const go = o as unknown as { y?: number; height?: number };
      bottom = Math.max(bottom, (go.y ?? 0) + (go.height ?? 0));
    }
    this.maxScroll = Math.max(0, bottom + 16 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  private refreshGold(): void {
    this.goldText.setText(`${gameState.gold} Gold`);
  }

  /**
   * Stat difference between an item and whatever occupies its slot right now
   * (raw item stats — contributions are additive so this equals the real
   * derived-stat change). Top 3 by magnitude, "…" when more differ.
   */
  private equipDiff(def: NonNullable<ReturnType<typeof getEquipment>>): { text: string; up: boolean }[] {
    const curId = gameState.equipment[def.slot as EquipSlot];
    const curD = (curId ? getEquipment(curId)?.derived : undefined) ?? {};
    const newD = def.derived ?? {};
    const keys = new Set([...Object.keys(newD), ...Object.keys(curD)]);
    const diffs: { key: string; d: number }[] = [];
    for (const k of keys) {
      const d =
        ((newD as Record<string, number>)[k] ?? 0) - ((curD as Record<string, number>)[k] ?? 0);
      if (d !== 0) diffs.push({ key: k, d });
    }
    diffs.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const out = diffs.slice(0, 3).map(({ key, d }) => {
      const val =
        key === 'critRate' || key === 'dropRate' || key === 'lifesteal' || key === 'goldRate'
          ? `${Math.round(d * 100)}%`
          : key === 'atkSpeed'
            ? d.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
            : `${Math.round(d)}`;
      return { text: `${DIFF_LABEL[key] ?? key}${d > 0 ? '+' : ''}${val}`, up: d > 0 };
    });
    if (diffs.length > 3) out.push({ text: '…', up: true });
    return out;
  }

  private renderTab(): void {
    this.viewTop = this.tab === 'skill' ? (this.skillView === 'loadout' ? 274 : 150) : 86;
    this.content.removeAll(true);
    this.eqQueue = [];
    this.eqLive.clear();
    this.scrollY = 0;
    this.content.y = 0;
    for (const o of this.slotChipObjs) o.destroy();
    this.slotChipObjs = [];
    for (const o of this.profileObjs) o.destroy();
    this.profileObjs = [];
    for (const tb of this.tabButtons) {
      tb.tab.setActive(tb.id === this.tab);
    }
    if (this.tab === 'items') this.renderItems();
    else if (this.tab === 'consumables') this.renderConsumables();
    else if (this.tab === 'equipment') this.renderEquipment();
    else if (this.tab === 'status') this.renderStatus();
    else this.renderSkills();
    this.updateScrollBounds();
  }

  /** Two fixed rows keep every equipment slot visible on a 360px screen. */
  private buildSlotChips(): void {
    const w = this.scale.width;
    const strip = this.add.rectangle(0, 180, w, 72, 0x11182b, 0.98).setOrigin(0).setDepth(2);
    this.slotChipObjs.push(strip);
    const defs: [string | null, string][] = [
      [null, '全部'], ['main_hand', '武器'], ['head', '頭'], ['torso', '胴'], ['hands', '手'],
      ['waist', '腰'], ['feet', '足'], ['back', '背'], ['accessory', 'アクセ'],
    ];
    const rows = [defs.slice(0, 5), defs.slice(5)];
    rows.forEach((row, rowIndex) => {
      const gap = 4;
      const chipW = Math.floor((w - 12 - gap * (row.length - 1)) / row.length);
      row.forEach(([value, label], column) => {
        const x = 6 + column * (chipW + gap) + chipW / 2;
        const tab = tabChip(this, x, 198 + rowIndex * 36, chipW, label, () => {
          if (this.dragged) return;
          this.slotFilter = value;
          this.renderTab();
        });
        tab.setActive(value === this.slotFilter);
        tab.root.setDepth(3);
        this.slotChipObjs.push(tab.root);
      });
    });
  }

  private renderProfileCard(y: number, height: number): void {
    const w = this.scale.width;
    const gs = gameState;
    const job = getJob(gs.jobId);
    const tierLabel = job ? (job.tier === 0 ? '初期職' : `${job.tier}次職`) : '';
    const art = appearanceTexKey(job?.appearance);
    const texture = art && this.textures.exists(art) ? art : TEX.playerBody;
    const panel = this.add.graphics();
    panel.fillStyle(0x142342, 0.94);
    panel.fillRoundedRect(8, y, w - 16, height, 8);
    panel.lineStyle(1.5, 0xd8b45b, 0.72);
    panel.strokeRoundedRect(8, y, w - 16, height, 8);
    panel.fillStyle(0xffffff, 0.06);
    panel.fillRoundedRect(10, y + 2, w - 20, 24, { tl: 7, tr: 7, bl: 0, br: 0 });
    panel.setDepth(2);
    this.profileObjs.push(panel);

    const portrait = this.add
      .sprite(60, y + height - 7, texture, frameIndex('down', 'idle', 0))
      .setOrigin(0.5, 0.875)
      .setScale(0.72)
      .setDepth(3);
    const name = this.add.text(108, y + 12, job?.name ?? gs.jobId, {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffe5a3',
      }).setDepth(3);
    const level = this.add.text(108, y + 36, `Lv ${gs.level}  ${tierLabel}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#cdd8ef',
      }).setDepth(3);
    const resources = this.add.text(108, y + 56, `HP ${gs.hp}/${gs.derived.maxHp}   MP ${gs.mp}/${gs.derived.maxMp}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9fe3d0',
      }).setDepth(3);
    const combat = this.add.text(w - 16, y + 16, `物攻 ${gs.derived.physAtk}\n防御 ${gs.derived.def}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#c9d6f0',
        align: 'right',
        lineSpacing: 5,
      }).setOrigin(1, 0).setDepth(3);
    this.profileObjs.push(portrait, name, level, resources, combat);
  }

  private emptyNote(kind: 'items' | 'consumables' | 'equipment', y = 118): void {
    const info = kind === 'items'
      ? { icon: TEX.iconGem, title: '素材はまだありません', body: '敵を倒したり、採集するとここに並びます。' }
      : kind === 'consumables'
        ? { icon: TEX.iconFlask, title: '消耗品はまだありません', body: '道具屋やクエスト報酬で入手できます。' }
        : { icon: TEX.iconArmor, title: '装備はまだありません', body: '鍛冶屋で素材から装備を作ってみましょう。' };
    const card = this.add.graphics();
    card.fillStyle(0x162440, 0.9);
    card.fillRoundedRect(16, y, this.scale.width - 32, 156, 8);
    card.lineStyle(1, 0xd8b45b, 0.52);
    card.strokeRoundedRect(16, y, this.scale.width - 32, 156, 8);
    this.content.add(card);
    this.content.add(this.add.image(this.scale.width / 2, y + 42, info.icon).setDisplaySize(32, 32).setTint(0xffd86b));
    this.content.add(
      this.add.text(this.scale.width / 2, y + 70, info.title, {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#ffffff',
      }).setOrigin(0.5, 0),
    );
    this.content.add(
      this.add.text(this.scale.width / 2, y + 101, info.body, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#b9c3d9',
        align: 'center',
        wordWrap: { width: this.scale.width - 72 },
      }).setOrigin(0.5, 0),
    );
  }

  /** Framed icon cell (rarity-coloured border) at the left of a row. */
  private iconCell(rowY: number, height: number, tex: string, iconTint: number, border: number): void {
    const cx = 26;
    const cy = rowY + height / 2;
    this.content.add(
      this.add
        .rectangle(cx, cy, 30, 30, 0x1c2036, 1)
        .setStrokeStyle(2, border, 0.95),
    );
    if (this.textures.exists(tex)) {
      this.content.add(this.add.image(cx, cy, tex).setTint(iconTint));
    }
  }

  /** Icon + tint for an equipment piece (by weapon tag / slot). */
  private equipIcon(def: NonNullable<ReturnType<typeof getEquipment>>): string {
    if (def.slot === 'main_hand') {
      const tag = def.weaponTags?.[0];
      if (tag === 'staff' || tag === 'wand') return TEX.iconStaff;
      if (tag === 'bow' || tag === 'shuriken') return TEX.iconBow;
      if (tag === 'shield') return TEX.iconShield;
      return TEX.iconSword;
    }
    if (def.slot === 'head') return TEX.iconHelm;
    if (def.slot.startsWith('accessory')) return TEX.iconRing;
    return TEX.iconArmor;
  }

  private renderItems(): void {
    const entries = Object.entries(gameState.materials).filter(([, q]) => q > 0);
    if (entries.length === 0) return this.emptyNote('items');
    let y = 100;
    let band = 0;
    const rowH = 40;
    for (const [id, qty] of entries) {
      this.content.add(rowBand(this, y, rowH, band++));
      const rarity = getMaterial(id)?.rarity;
      this.iconCell(y, rowH, TEX.iconGem, rarityColor(rarity), rarityColor(rarity));
      this.content.add(
        this.add.text(48, y + rowH / 2, itemDisplayName(id), {
          fontFamily: FONT,
          fontSize: '14px',
          color: rarityColorHex(rarity),
        }).setOrigin(0, 0.5),
      );
      this.content.add(
        this.add
          .text(this.scale.width - 16, y + rowH / 2, `×${qty}`, {
            fontFamily: FONT,
            fontSize: '14px',
            color: '#cfd3e6',
          })
          .setOrigin(1, 0.5),
      );
      y += rowH + 4;
    }
  }

  private renderConsumables(): void {
    const entries = Object.entries(gameState.consumables).filter(([, q]) => q > 0);
    if (entries.length === 0) return this.emptyNote('consumables');
    let y = 100;
    let band = 0;
    const rowH = 46;
    const w = this.scale.width;
    for (const [id, qty] of entries) {
      const def = getConsumable(id);
      this.content.add(rowBand(this, y, rowH, band++));
      // Flask tinted by what it restores (HP red / MP blue / both gold).
      const hp = def?.effect.hp ?? 0;
      const mp = def?.effect.mp ?? 0;
      const tint = hp && mp ? 0xffd86b : mp ? 0x7ad0ff : 0xff8a9a;
      this.iconCell(y, rowH, TEX.iconFlask, tint, 0x3f9a6e);
      this.content.add(
        this.add.text(48, y + 8, `${itemDisplayName(id)}  ×${qty}`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#fff',
        }),
      );
      if (def) {
        this.content.add(
          this.add.text(48, y + 26, def.description, {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#9aa0b5',
          }),
        );
      }
      const use = this.add
        .text(w - 16, y + rowH / 2, 'つかう', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#9fe3a0',
          backgroundColor: '#2a3050',
          padding: { x: 10, y: 5 },
        })
        .setOrigin(1, 0.5)
        .setInteractive({ useHandCursor: true });
      use.on('pointerup', () => {
        if (this.dragged) return;
        gameState.useConsumable(id);
        this.renderTab();
      });
      this.content.add(use);
      y += rowH + 4;
    }
  }

  private renderEquipment(): void {
    this.renderProfileCard(94, 82);
    this.buildSlotChips();
    // Group identical owned pieces into one row with a count (no random
    // options yet, so duplicates are fungible).
    const counts = new Map<string, number>();
    for (const id of gameState.equipmentOwned) {
      if (getEquipment(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let y = 258;
    // 部位ごとのセクションに分け、各セクション内は「装備中 → 今そうび
    // できる強い順（レア度→Lv）→ 職業/段階で装備不可」。取得順のごちゃ
    // 混ぜをやめて、常に同じ場所に同じ部位が並ぶ。
    // Display order: weapon first (the slot players re-check most), then
    // armour top-to-bottom, then accessories — independent of EQUIP_SLOTS.
    const DISPLAY_ORDER = [
      'main_hand', 'head', 'torso', 'hands', 'waist', 'feet', 'back', 'accessory_1', 'accessory_2',
    ];
    const slots = DISPLAY_ORDER.filter((s) =>
      this.slotFilter === null
        ? true
        : this.slotFilter === 'accessory'
          ? s.startsWith('accessory')
          : s === this.slotFilter,
    );
    this.eqQueue = [];
    let band = 0;
    let total = 0;
    for (const slot of slots) {
      const ids = [...counts.entries()].filter(([id]) => getEquipment(id)!.slot === slot);
      if (ids.length === 0) continue;
      total += ids.length;
      ids.sort(([a], [b]) => {
        const da = getEquipment(a)!;
        const db = getEquipment(b)!;
        const eqA = gameState.equipment[slot as EquipSlot] === a ? 1 : 0;
        const eqB = gameState.equipment[slot as EquipSlot] === b ? 1 : 0;
        const canA = eqA || gameState.canEquip(a) ? 1 : 0;
        const canB = eqB || gameState.canEquip(b) ? 1 : 0;
        return (
          eqB - eqA ||
          canB - canA ||
          (db.rarity ?? 1) - (da.rarity ?? 1) ||
          (db.levelRequirement ?? 1) - (da.levelRequirement ?? 1) ||
          a.localeCompare(b)
        );
      });
      this.eqQueue.push({ kind: 'header', slot, count: ids.length, y, h: 26 });
      y += 26;
      for (const [id, count] of ids) {
        this.eqQueue.push({ kind: 'row', id, count, y, h: 44, band: band++ });
        y += 44;
      }
      y += 6;
    }
    if (total === 0) {
      this.emptyNote('equipment', 264);
      y = 430;
    }

    const d = gameState.derived;
    this.content.add(
      this.add.text(16, y + 12, `物理攻撃 ${d.physAtk}   防御 ${d.def}   最大HP ${d.maxHp}`, {
        fontFamily: 'system-ui, monospace',
        fontSize: '12px',
        color: '#cfe',
      }),
    );
    this.updateEquipWindow();
  }

  /**
   * Create/destroy equipment entries so only those near the viewport are
   * live (a god-mode inventory froze the phone when every row was built up
   * front). Heights vary (header 26 / row 44) so visibility is per entry.
   */
  private updateEquipWindow(): void {
    if (this.eqQueue.length === 0) return;
    const top = this.scrollY + this.viewTop - 120;
    const bottom = this.scrollY + this.viewBottom + 120;
    for (const [idx, objs] of this.eqLive) {
      const q = this.eqQueue[idx];
      if (!q || q.y + q.h < top || q.y > bottom) {
        for (const o of objs) o.destroy();
        this.eqLive.delete(idx);
      }
    }
    for (let i = 0; i < this.eqQueue.length; i++) {
      if (this.eqLive.has(i)) continue;
      const q = this.eqQueue[i];
      if (q.y + q.h < top || q.y > bottom) continue;
      const before = this.content.length;
      if (q.kind === 'header') this.renderSlotHeader(q.slot, q.count, q.y);
      else this.renderEquipRow(q.id, q.count, q.y, q.band);
      this.eqLive.set(i, this.content.list.slice(before) as Phaser.GameObjects.GameObject[]);
    }
  }

  /** Section divider for one slot: label, count, and what's equipped there. */
  private renderSlotHeader(slot: string, count: number, y: number): void {
    const w = this.scale.width;
    this.content.add(
      this.add.text(16, y + 12, `― ${SLOT_LABEL[slot] ?? slot} (${count}) ―`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#c9b27a',
      }).setOrigin(0, 0.5),
    );
    const curId = gameState.equipment[slot as EquipSlot];
    const curName = curId ? getEquipment(curId)?.name : null;
    this.content.add(
      this.add
        .text(w - 16, y + 12, curName ? `装備中: ${curName}` : '装備なし', {
          fontFamily: FONT,
          fontSize: '11px',
          color: curName ? '#9fe3a0' : '#7e8499',
        })
        .setOrigin(1, 0.5),
    );
  }

  /** One equipment row at absolute y (used by the virtual window). */
  private renderEquipRow(id: string, count: number, y: number, band: number): void {
    const w = this.scale.width;
    const rowH = 40;
    {
      this.content.add(rowBand(this, y, rowH, band));
      const def = getEquipment(id)!;
      const slot = def.slot as EquipSlot;
      const equipped = gameState.equipment[slot] === id;
      const canEq = equipped || gameState.canEquip(id);
      const qty = count > 1 ? ` ×${count}` : '';
      // Icon cell: greyed border when the piece can't be equipped, else rarity.
      const border = canEq ? rarityColor(def.rarity) : 0x4a4f5c;
      this.iconCell(y, rowH, this.equipIcon(def), canEq ? rarityColor(def.rarity) : 0x666a78, border);
      // Equipped pieces get a small green corner tick.
      if (equipped) this.content.add(this.add.circle(38, y + 4, 4, 0x9fe3a0).setDepth(1));
      this.content.add(
        this.add.text(48, y + 3, `${def.name}${qty}${equipped ? '（装備中）' : ''}`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: equipped ? '#9fe3a0' : canEq ? rarityColorHex(def.rarity) : '#666a78',
        }),
      );
      // Rarity label (R-number + band name), coloured by rank.
      const rarityText = this.add.text(48, y + 21, rarityLabel(def.rarity), {
        fontFamily: FONT,
        fontSize: '11px',
        color: rarityColorHex(def.rarity),
      });
      this.content.add(rarityText);
      // Element badge for elemental weapons (e.g. 属性:火), coloured to match.
      let lineX = rarityText.x + rarityText.width + 8;
      if (isElement(def.element) && def.element !== 'none') {
        const hex = `#${ELEMENT_COLOR[def.element].toString(16).padStart(6, '0')}`;
        const badge = this.add.text(lineX, y + 21, `属性:${ELEMENT_LABEL[def.element]}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: hex,
        });
        this.content.add(badge);
        lineX = badge.x + badge.width + 8;
      }
      // Stat diff vs the currently equipped piece (green up / red down), so
      // "should I switch?" is answerable without doing mental math.
      if (!equipped) {
        for (const seg of this.equipDiff(def)) {
          const t = this.add.text(lineX, y + 21, seg.text, {
            fontFamily: FONT,
            fontSize: '11px',
            color: seg.up ? '#9fe3a0' : '#e07a7a',
          });
          this.content.add(t);
          lineX = t.x + t.width + 6;
        }
      }
      if (canEq) {
        const btn = this.add
          .text(w - 16, y + rowH / 2, equipped ? 'はずす' : 'そうび', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#9fd0ff',
            backgroundColor: '#2a3050',
            padding: { x: 10, y: 5 },
          })
          .setOrigin(1, 0.5)
          .setInteractive({ useHandCursor: true });
        btn.on('pointerup', () => {
          if (this.dragged) return;
          gameState.equip(slot, equipped ? null : id);
          this.renderTab();
        });
        this.content.add(btn);
      } else {
        // Can't equip: distinguish a progression-tier gate from a job/weapon
        // restriction so the player knows whether to advance or switch jobs.
        const reason = gameState.equipBlock(id);
        const label = reason === 'tier' ? '段階不足' : '職業不可';
        this.content.add(
          this.add
            .text(w - 16, y + rowH / 2, label, {
              fontFamily: FONT,
              fontSize: '12px',
              color: '#a86a6a',
            })
            .setOrigin(1, 0.5),
        );
      }
    }
  }

  private renderStatus(): void {
    const w = this.scale.width;
    const gs = gameState;
    this.renderProfileCard(94, 92);
    this.content.add(
      this.add.text(16, 198, 'ステータス振り分け', {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#ffe5a3',
      }),
    );
    this.content.add(
      this.add.text(w - 16, 199, `EXP ${gs.exp}/${expToNext(gs.level)}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9aa0b5',
      }).setOrigin(1, 0),
    );
    this.content.add(
      this.add.text(16, 220, `余りポイント: ${gs.statPoints}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: gs.statPoints > 0 ? '#ffe9a8' : '#9aa0b5',
      }),
    );

    const stats: { key: keyof BaseStats; label: string }[] = [
      { key: 'STR', label: '力 STR' },
      { key: 'VIT', label: '体 VIT' },
      { key: 'INT', label: '知 INT' },
      { key: 'DEX', label: '器 DEX' },
      { key: 'LUK', label: '運 LUK' },
    ];
    let y = 248;
    let band = 0;
    for (const s of stats) {
      this.content.add(rowBand(this, y, 30, band++));
      this.content.add(
        this.add.text(16, y + 15, `${s.label}`, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#cfd3e6',
        }).setOrigin(0, 0.5),
      );
      this.content.add(
        this.add.text(gs.statPoints > 0 ? w - 70 : w - 16, y + 15, `${gs.base[s.key]}`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#fff',
          fontStyle: 'bold',
        }).setOrigin(1, 0.5),
      );
      if (gs.statPoints > 0) {
        const plus = this.add
          .text(w - 16, y + 15, '＋', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#bfffce',
            backgroundColor: '#274a30',
            padding: { x: 9, y: 4 },
          })
          .setOrigin(1, 0.5)
          .setInteractive({ useHandCursor: true });
        plus.on('pointerup', () => {
          if (this.dragged) return;
          gs.allocateStat(s.key, 1);
          this.renderTab();
        });
        this.content.add(plus);
      }
      y += 34;
    }

    // Derived stats in a framed panel (reads as a "sheet", not loose text).
    const d = gs.derived;
    const panelY = y + 10;
    this.content.add(
      this.add.rectangle(8, panelY, w - 16, 96, 0x14172a, 0.9).setOrigin(0, 0).setStrokeStyle(1, 0x333a5a, 0.8),
    );
    this.content.add(
      this.add.text(16, panelY + 6, '派生ステータス', { fontFamily: FONT, fontSize: '11px', color: '#c9b27a' }),
    );
    const lines = [
      `最大HP ${d.maxHp}   最大MP ${d.maxMp}`,
      `物攻 ${d.physAtk}   魔攻 ${d.magAtk}   防御 ${d.def}`,
      `命中 ${d.accuracy}   回避 ${d.evasion}   会心 ${Math.round(d.critRate * 100)}%`,
      `攻速 ${d.atkSpeed.toFixed(2)}   移動 ${d.moveSpeed}   ドロ率 +${Math.round(d.dropRate * 100)}%`,
    ];
    this.content.add(
      this.add.text(16, panelY + 24, lines.join('\n'), {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#cfe',
        lineSpacing: 4,
      }),
    );
  }

  private compactSkillText(text: string, max = 23): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  private skillMeta(def: SkillDef): string {
    const parts: string[] = [];
    if (isElement(def.element) && def.element !== 'none') parts.push(`${ELEMENT_LABEL[def.element]}属性`);
    if (def.mpCost != null) parts.push(`MP ${def.mpCost}`);
    if (def.cooldown) {
      const sec = def.cooldown / 1000;
      parts.push(`再使用 ${Number.isInteger(sec) ? sec.toFixed(0) : sec.toFixed(1)}秒`);
    }
    return parts.join('  ');
  }

  private skillBlockText(def: SkillDef, block: string | null): string {
    if (block === 'tier') return `${def.minTier}次職から`;
    if (block === 'level') return `Lv${def.requiredLevel}から`;
    if (block === 'requires') return '前提技が必要';
    if (block === 'points') return '技P不足';
    if (block === 'job') return '現職では習得不可';
    return '習得不可';
  }

  /** Coalesce taps and rebuild after Phaser has finished dispatching input. */
  private refreshSkillTab(): void {
    if (this.skillRefreshPending) return;
    this.skillRefreshPending = true;
    this.time.delayedCall(16, () => {
      this.skillRefreshPending = false;
      if (this.scene.isActive()) this.renderTab();
    });
  }

  private renderSkillModeBar(): void {
    const w = this.scale.width;
    const strip = this.add
      .rectangle(0, 86, w, 64, 0x111d36, 0.99)
      .setOrigin(0)
      .setDepth(2)
      .setInteractive();
    const divider = this.add.rectangle(0, 149, w, 1, 0xffffff, 0.1).setOrigin(0).setDepth(3);
    const loadout = tabChip(this, 60, 116, 104, 'セット', () => {
      if (this.skillView === 'loadout') return;
      this.skillView = 'loadout';
      this.refreshSkillTab();
    });
    const learn = tabChip(this, 168, 116, 104, '習得', () => {
      if (this.skillView === 'learn') return;
      this.skillView = 'learn';
      this.refreshSkillTab();
    });
    loadout.setActive(this.skillView === 'loadout');
    learn.setActive(this.skillView === 'learn');
    loadout.root.setDepth(3);
    learn.root.setDepth(3);
    const points = this.add
      .text(w - 12, 116, `技P ${gameState.skillPoints}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: gameState.skillPoints > 0 ? '#ffe9a8' : '#9aa0b5',
        backgroundColor: '#202943',
        padding: { x: 9, y: 6 },
      })
      .setOrigin(1, 0.5)
      .setDepth(3);
    this.profileObjs.push(strip, divider, loadout.root, learn.root, points);
  }

  private renderSkillLoadout(): void {
    const w = this.scale.width;
    const gs = gameState;
    const myFamily = getJob(gs.jobId)?.family;
    const fixed = this.add
      .rectangle(0, 150, w, 124, 0x10182b, 0.99)
      .setOrigin(0)
      .setDepth(2)
      .setInteractive();
    const title = this.add
      .text(12, 158, '使用する技', { fontFamily: FONT, fontSize: '11px', color: '#c9b27a' })
      .setDepth(3);
    this.profileObjs.push(fixed, title);

    const gap = 8;
    const cardW = Math.floor((w - 24) / 2);
    const cardY = 178;
    const cardH = 82;
    for (let i = 0; i < 2; i++) {
      const x = 8 + i * (cardW + gap);
      const selected = this.selectedSkillSlot === i;
      const def = gs.skillSlots[i] ? getSkill(gs.skillSlots[i]!) : undefined;
      const card = this.add
        .rectangle(
          x + cardW / 2,
          cardY + cardH / 2,
          cardW,
          cardH,
          selected ? 0x213d5a : 0x191e31,
          1,
        )
        .setStrokeStyle(selected ? 2 : 1, selected ? 0xf5c542 : 0xffffff, selected ? 0.95 : 0.12)
        .setDepth(3)
        .setInteractive({ useHandCursor: true });
      const slot = this.add
        .text(x + 10, cardY + 9, `S${i + 1}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#ffffff',
          fontStyle: 'bold',
          backgroundColor: i === 0 ? '#365a9b' : '#624ba0',
          padding: { x: 6, y: 3 },
        })
        .setDepth(3);
      const state = this.add
        .text(x + cardW - 9, cardY + 13, selected ? '選択中' : '', {
          fontFamily: FONT,
          fontSize: '8px',
          color: '#ffe9a8',
        })
        .setOrigin(1, 0)
        .setDepth(3);
      const name = this.add
        .text(x + 10, cardY + 38, this.compactSkillText(def?.name ?? '未設定', 11), {
          fontFamily: FONT,
          fontSize: '12px',
          color: def ? '#ffffff' : '#7e8499',
          fontStyle: 'bold',
        })
        .setDepth(3);
      const meta = this.add
        .text(x + 10, cardY + 61, this.compactSkillText(def ? this.skillMeta(def) : '－', 18), {
          fontFamily: FONT,
          fontSize: '9px',
          color: '#9fb5cf',
        })
        .setDepth(3);
      card.on('pointerup', () => {
        if (this.selectedSkillSlot === i) return;
        this.selectedSkillSlot = i;
        this.refreshSkillTab();
      });
      this.profileObjs.push(card, slot, state, name, meta);
    }
    const fixedDivider = this.add.rectangle(0, 273, w, 1, 0xffffff, 0.1).setOrigin(0).setDepth(3);
    this.profileObjs.push(fixedDivider);

    const available = allSkills().filter(
      (def) =>
        def.type === 'active'
        && !!gs.skills[def.id]
        && (!def.family || def.family === myFamily || gs.skillSlots.includes(def.id)),
    );
    let y = 284;
    this.content.add(
      this.add.text(16, y, `S${this.selectedSkillSlot + 1}にセット`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
      }),
    );
    this.content.add(
      this.add
        .text(w - 16, y + 1, `${available.length}個`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#7e8499',
        })
        .setOrigin(1, 0),
    );
    y += 24;

    if (available.length === 0) {
      this.content.add(
        this.add.rectangle(8, y, w - 16, 84, 0x191e31, 0.95).setOrigin(0).setStrokeStyle(1, 0x333a5a, 0.8),
      );
      this.content.add(
        this.add
          .text(w / 2, y + 24, 'セットできる技がありません', {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#9aa0b5',
          })
          .setOrigin(0.5),
      );
      const learn = pillButton(this, w / 2, y + 60, '技を習得', () => {
        this.skillView = 'learn';
        this.refreshSkillTab();
      }, { size: 12, bg: '#304b70', color: '#ffffff' });
      this.content.add(learn);
      return;
    }

    const rowH = 66;
    for (const def of available) {
      const slot = gs.skillSlots.indexOf(def.id);
      const equippedHere = slot === this.selectedSkillSlot;
      const bg = this.add
        .rectangle(w / 2, y + (rowH - 4) / 2, w - 16, rowH - 4, equippedHere ? 0x1f3a3b : 0x191e31, 0.96)
        .setStrokeStyle(1, equippedHere ? 0x79d6ad : 0xffffff, equippedHere ? 0.72 : 0.08)
        .setInteractive({ useHandCursor: true });
      this.content.add(bg);
      this.content.add(
        this.add.text(18, y + 8, def.name, {
          fontFamily: FONT,
          fontSize: '13px',
          color: equippedHere ? '#bff4d4' : '#ffffff',
          fontStyle: 'bold',
        }),
      );
      this.content.add(
        this.add.text(18, y + 27, this.compactSkillText(def.description), {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#9aa0b5',
        }),
      );
      this.content.add(
        this.add.text(18, y + 46, this.skillMeta(def), {
          fontFamily: FONT,
          fontSize: '9px',
          color: isElement(def.element) && def.element !== 'none'
            ? `#${ELEMENT_COLOR[def.element].toString(16).padStart(6, '0')}`
            : '#9fb5cf',
        }),
      );
      const action = equippedHere ? 'セット中' : slot >= 0 ? '入れ替え' : 'セット';
      this.content.add(
        this.add
          .text(w - 16, y + 31, action, {
            fontFamily: FONT,
            fontSize: '11px',
            color: equippedHere ? '#bff4d4' : '#ffffff',
            backgroundColor: equippedHere ? '#244b42' : '#304b70',
            padding: { x: 9, y: 6 },
          })
          .setOrigin(1, 0.5),
      );
      bg.on('pointerup', () => {
        if (this.dragged || equippedHere) return;
        gs.assignSkill(this.selectedSkillSlot, def.id);
        this.refreshSkillTab();
      });
      y += rowH;
    }
  }

  private renderSkillLearning(): void {
    const w = this.scale.width;
    const gs = gameState;
    const myFamily = getJob(gs.jobId)?.family;
    const visible = allSkills().filter((def) => !def.family || def.family === myFamily);
    const groups: { title: string; defs: SkillDef[] }[] = [
      { title: 'アクティブ技', defs: visible.filter((def) => def.type === 'active') },
      { title: 'パッシブ', defs: visible.filter((def) => def.type === 'passive') },
    ];
    let y = 160;
    for (const group of groups) {
      if (group.defs.length === 0) continue;
      this.content.add(
        this.add.text(16, y, group.title, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#c9b27a',
          fontStyle: 'bold',
        }),
      );
      y += 22;
      for (const def of group.defs) {
        const learned = !!gs.skills[def.id];
        const block = learned ? 'known' : gs.skillLearnBlock(def.id);
        const rowH = 64;
        const bg = this.add
          .rectangle(w / 2, y + (rowH - 4) / 2, w - 16, rowH - 4, learned ? 0x1c3032 : 0x191e31, 0.96)
          .setStrokeStyle(1, learned ? 0x66b58f : 0xffffff, learned ? 0.4 : 0.08);
        this.content.add(bg);
        this.content.add(
          this.add.text(18, y + 8, def.name, {
            fontFamily: FONT,
            fontSize: '13px',
            color: learned ? '#bff4d4' : '#ffffff',
            fontStyle: 'bold',
          }),
        );
        this.content.add(
          this.add.text(18, y + 28, this.compactSkillText(def.description), {
            fontFamily: FONT,
            fontSize: '10px',
            color: '#9aa0b5',
          }),
        );
        if (def.type === 'active') {
          this.content.add(
            this.add.text(18, y + 45, this.skillMeta(def), {
              fontFamily: FONT,
              fontSize: '9px',
              color: '#9fb5cf',
            }),
          );
        }
        const label = learned ? '習得済' : block === null ? '覚える' : this.skillBlockText(def, block);
        this.content.add(
          this.add
            .text(w - 16, y + 30, label, {
              fontFamily: FONT,
              fontSize: '11px',
              color: learned ? '#bff4d4' : block === null ? '#ffffff' : '#7e8499',
              backgroundColor: block === null ? '#304b70' : undefined,
              padding: block === null ? { x: 9, y: 6 } : undefined,
            })
            .setOrigin(1, 0.5),
        );
        if (!learned && block === null) {
          bg.setInteractive({ useHandCursor: true });
          bg.on('pointerup', () => {
            if (this.dragged) return;
            gs.learnSkill(def.id);
            this.refreshSkillTab();
          });
        }
        y += rowH;
      }
      y += 8;
    }
  }

  private renderSkills(): void {
    this.renderSkillModeBar();
    if (this.skillView === 'loadout') this.renderSkillLoadout();
    else this.renderSkillLearning();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
