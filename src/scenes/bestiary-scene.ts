import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allEnemyDefs, type EnemyDef } from '@/enemies/enemy-defs';
import { getDropTable, type DropEntry } from '@/loot/drop-table';
import {
  BOSS_RARE_EXCHANGE_COST,
  getBossRareExchangeForDropTable,
} from '@/crafting/boss-rare-exchange';
import { itemDisplayName, getEquipment } from '@/data/items';
import { FONT, addPanelChrome, pillButton, ninePanel } from '@/ui/theme';
import { ELEMENT_LABEL, elementColorHex, isElement } from '@/combat/elements';
import {
  BESTIARY_REGIONS,
  bestiaryEquipmentGuide,
  bestiaryHabitatGuide,
  bestiaryRegionEnemies,
  bestiaryRegionForEnemy,
  bestiaryRegionProgress,
  bestiaryRewardFlag,
  bestiaryRewardLabel,
  claimBestiaryRegionReward,
  type BestiaryRegionDef,
} from '@/bestiary/bestiary-catalog';

interface DisplayDrop {
  itemId: string;
  rateText: string;
  rateColor: string;
}

/**
 * Region-based monster collection. Each chapter exposes discovery progress,
 * a one-time completion reward, actionable unknown-entry hints, and a compact
 * link from known drops to the equipment they create.
 */
export class BestiaryScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 84;
  private viewBottom = 0;
  private detail: Phaser.GameObjects.Container | null = null;
  private expanded = new Set<string>();
  private toast: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Bestiary');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewBottom = h - 64;
    this.scrollY = 0;
    this.detail = null;
    this.toast = null;
    this.expanded.clear();

    ninePanel(this, 112, 24, 208, 40).setDepth(2.5);
    this.add
      .text(22, 24, 'モンスター図鑑', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    const all = allEnemyDefs();
    const found = all.filter((enemy) => (gameState.killCounts[enemy.id] ?? 0) > 0).length;
    ninePanel(this, w - 54, 24, 92, 40).setDepth(2.5);
    this.add
      .text(w - 54, 24, `${found} / ${all.length}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffd86b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(3);

    const globalRatio = all.length > 0 ? found / all.length : 0;
    this.add
      .rectangle(16, 57, w - 32, 8, 0x07111f, 0.94)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, 0xb9cad9, 0.2)
      .setDepth(3);
    this.add
      .rectangle(17, 57, Math.max(2, (w - 34) * globalRatio), 6, 0xf2cf63, 0.96)
      .setOrigin(0, 0.5)
      .setDepth(3);
    this.add
      .text(17, 67, `発見率 ${Math.round(globalRatio * 100)}%`, {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#bfc9d8',
      })
      .setDepth(3);
    this.add
      .text(w - 17, 67, '地域別収集', {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#8795a9',
      })
      .setOrigin(1, 0)
      .setDepth(3);

    const firstIncomplete = BESTIARY_REGIONS.find(
      (region) => !bestiaryRegionProgress(region, gameState.killCounts).complete,
    );
    this.expanded.add((firstIncomplete ?? BESTIARY_REGIONS[0]).id);

    this.content = this.add.container(0, 0).setDepth(1);
    addPanelChrome(this, this.viewTop, this.viewBottom);
    this.setupScroll();

    pillButton(this, w / 2, h - 34, 'とじる', () => {
      if (!this.dragged) this.close();
    }, { color: '#ffe9a8', bg: '#39406a', size: 15 }).setDepth(3);
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.detail) this.closeDetail();
      else this.close();
    });

    this.render();
  }

  private render(): void {
    this.content.removeAll(true);
    const w = this.scale.width;
    let y = this.viewTop + 8;

    for (const region of BESTIARY_REGIONS) {
      this.renderRegionHeader(region, y, w);
      y += 62;
      if (!this.expanded.has(region.id)) continue;
      for (const def of bestiaryRegionEnemies(region)) {
        this.renderEnemyRow(def, y, w);
        y += 60;
      }
      y += 6;
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  private renderRegionHeader(region: BestiaryRegionDef, y: number, w: number): void {
    const progress = bestiaryRegionProgress(region, gameState.killCounts);
    const claimed = !!gameState.flags[bestiaryRewardFlag(region.id)];
    const open = this.expanded.has(region.id);
    const rowW = w - 16;
    const g = this.add.graphics();
    g.fillStyle(0x07111f, 0.96);
    g.fillRoundedRect(8, y, rowW, 56, 6);
    g.fillStyle(region.accent, 0.94);
    g.fillRoundedRect(8, y + 5, 3, 46, 2);
    g.lineStyle(1, region.accent, open ? 0.58 : 0.26);
    g.strokeRoundedRect(8, y, rowW, 56, 6);
    g.fillStyle(0x02060c, 0.92);
    g.fillRoundedRect(21, y + 45, w - 116, 5, 2);
    g.fillStyle(progress.complete ? 0xf2cf63 : region.accent, 0.96);
    g.fillRoundedRect(21, y + 45, Math.max(2, (w - 116) * progress.ratio), 5, 2);
    this.content.add(g);

    this.content.add(
      this.add.text(21, y + 7, region.name, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      }),
    );
    this.content.add(
      this.add
        .text(w - 20, y + 8, `${progress.found}/${progress.total}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: progress.complete ? '#ffe184' : '#b9c5d5',
          fontStyle: 'bold',
        })
        .setOrigin(1, 0),
    );
    const rewardText = this.add.text(21, y + 27, `達成報酬 ${bestiaryRewardLabel(region)}`, {
      fontFamily: FONT,
      fontSize: '9px',
      color: progress.complete ? '#e8d89b' : '#7f8b9f',
    });
    this.fitText(rewardText, rewardText.text, w - 116);
    this.content.add(rewardText);

    if (progress.complete && !claimed) {
      const bx = w - 47;
      const by = y + 35;
      const bg = this.add.graphics();
      bg.fillStyle(0x4b6334, 1);
      bg.fillRoundedRect(bx - 33, by - 13, 66, 26, 6);
      bg.lineStyle(1, 0xf2cf63, 0.8);
      bg.strokeRoundedRect(bx - 33, by - 13, 66, 26, 6);
      const label = this.add
        .text(bx, by, '受け取る', {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#fff3bd',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      const claimHit = this.add
        .zone(bx, by, 72, 34)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', () => {
          if (this.dragged) return;
          if (!claimBestiaryRegionReward(gameState, region)) return;
          this.render();
          this.showToast(`${region.name}の達成報酬を獲得`);
        });
      this.content.add([bg, label, claimHit]);
    } else {
      this.content.add(
        this.add
          .text(w - 20, y + 33, claimed ? '受取済' : open ? '▲' : '▼', {
            fontFamily: FONT,
            fontSize: claimed ? '9px' : '10px',
            color: claimed ? '#79c895' : '#9eacc0',
          })
          .setOrigin(1, 0.5),
      );
    }

    const headerHitW = progress.complete && !claimed ? w - 94 : w - 16;
    const headerHit = this.add
      .rectangle(8, y, headerHitW, 56, 0x000000, 0.001)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (this.dragged) return;
        if (this.expanded.has(region.id)) this.expanded.delete(region.id);
        else this.expanded.add(region.id);
        this.render();
      });
    this.content.add(headerHit);
  }

  private thumb(
    x: number,
    y: number,
    def: EnemyDef,
    size: number,
    known: boolean,
  ): Phaser.GameObjects.Image {
    const tex = this.textures.get(def.textureKey);
    const frame = tex.has('1') ? 1 : undefined;
    const img = this.add.image(x, y, def.textureKey, frame).setScale(size / 96);
    if (!known) {
      img.setTint(0x33445b).setTintMode(Phaser.TintModes.FILL).setAlpha(0.9);
    } else if (def.tint) {
      img.setTint(Phaser.Display.Color.HexStringToColor(def.tint).color);
    }
    return img;
  }

  private renderEnemyRow(def: EnemyDef, y: number, w: number): void {
    const kills = gameState.killCounts[def.id] ?? 0;
    const known = kills > 0;
    const habitat = bestiaryHabitatGuide(def.id);
    const region = bestiaryRegionForEnemy(def.id);
    const cy = y + 28;
    const g = this.add.graphics();
    g.fillStyle(known ? 0x10253a : 0x0d1b2c, known ? 0.94 : 0.88);
    g.fillRoundedRect(12, y, w - 24, 56, 5);
    g.fillStyle(def.isBoss ? 0xc99d53 : region?.accent ?? 0x6482a2, known ? 0.72 : 0.32);
    g.fillRoundedRect(12, y + 6, 2, 44, 1);
    g.lineStyle(1, 0xb9cad9, known ? 0.14 : 0.08);
    g.strokeRoundedRect(12, y, w - 24, 56, 5);
    this.content.add(g);
    this.content.add(this.thumb(40, cy, def, def.isBoss ? 44 : 40, known));

    const name = this.add.text(70, y + 7, known ? def.name : '？？？', {
      fontFamily: FONT,
      fontSize: '13px',
      color: known ? '#ffffff' : '#a9b2c2',
      fontStyle: known ? 'bold' : 'normal',
    });
    this.fitText(name, name.text, w - 108);
    this.content.add(name);

    const bits = known
      ? [def.isBoss ? '大型' : '通常', `討伐 ${kills}`, habitat.short]
      : ['未発見', habitat.short];
    const meta = this.add.text(70, y + 31, bits.join('・'), {
      fontFamily: FONT,
      fontSize: '10px',
      color: known ? '#9eb0c3' : '#8290a3',
    });
    this.fitText(meta, meta.text, w - 108);
    this.content.add(meta);
    this.content.add(
      this.add
        .text(w - 22, cy, '›', {
          fontFamily: FONT,
          fontSize: '17px',
          color: known ? '#90a5bf' : '#66758b',
        })
        .setOrigin(1, 0.5),
    );

    const hit = this.add
      .rectangle(12, y, w - 24, 56, 0x000000, 0.001)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        if (!this.dragged) this.openDetail(def, kills, known);
      });
    this.content.add(hit);
  }

  private rateLabel(rate: number, guaranteedFirst: boolean): { text: string; color: string } {
    if (guaranteedFirst) return { text: '初回確定', color: '#ffd86b' };
    if (rate >= 1) return { text: '確定', color: '#9fe3a0' };
    if (rate >= 0.5) return { text: 'よく落ちる', color: '#cfe0a0' };
    if (rate >= 0.15) return { text: 'たまに', color: '#9fd0ff' };
    return { text: 'レア', color: '#e8a0ff' };
  }

  private detailDrops(def: EnemyDef): DisplayDrop[] {
    if (!def.dropTableId) return [];
    const table = getDropTable(def.dropTableId);
    if (!table) return [];
    const exchange = getBossRareExchangeForDropTable(def.dropTableId);
    const entries = [...table.entries].sort((a, b) => {
      const score = (entry: DropEntry): number => {
        if (entry.bossFirstGuaranteed) return 100;
        if (entry.itemId === exchange?.rareMaterialId) return 90;
        if (getEquipment(entry.itemId)) return 80;
        return entry.dropRate * 10;
      };
      return score(b) - score(a);
    });
    const out: DisplayDrop[] = [];
    if (exchange) {
      out.push({ itemId: exchange.proofItemId, rateText: '確定', rateColor: '#8fd6a5' });
    }
    for (const entry of entries) {
      if (out.some((shown) => shown.itemId === entry.itemId)) continue;
      const rate = this.rateLabel(entry.dropRate, !!entry.bossFirstGuaranteed && entry.dropRate <= 0);
      out.push({ itemId: entry.itemId, rateText: rate.text, rateColor: rate.color });
      if (out.length >= 4) break;
    }
    if (exchange && !out.some((entry) => entry.itemId === exchange.rareMaterialId)) {
      out[out.length >= 4 ? 3 : out.length] = {
        itemId: exchange.rareMaterialId,
        rateText: `${BOSS_RARE_EXCHANGE_COST}枚交換`,
        rateColor: '#e8a0ff',
      };
    }
    return out.filter(Boolean);
  }

  private openDetail(def: EnemyDef, kills: number, known: boolean): void {
    this.closeDetail();
    const w = this.scale.width;
    const h = this.scale.height;
    const panelW = w - 24;
    const panelH = Math.min(550, h - 104);
    const cx = w / 2;
    const cy = h / 2;
    const top = cy - panelH / 2;
    const region = bestiaryRegionForEnemy(def.id);
    const habitat = bestiaryHabitatGuide(def.id);
    const c = this.add.container(0, 0).setDepth(10);

    const shade = this.add.rectangle(0, 0, w, h, 0x030711, 0.76).setOrigin(0).setInteractive();
    shade.on('pointerup', () => this.closeDetail());
    c.add(shade);
    const panel = this.add
      .rectangle(cx, cy, panelW, panelH, 0x111b2c, 1)
      .setStrokeStyle(1.5, region?.accent ?? 0x5b6c86, 0.8)
      .setInteractive();
    c.add(panel);
    c.add(this.add.rectangle(cx - panelW / 2 + 3, top + 8, 3, 78, region?.accent ?? 0x7690ae, 0.92));

    c.add(this.thumb(cx - panelW / 2 + 48, top + 54, def, 76, known));
    const title = this.add.text(cx - panelW / 2 + 92, top + 24, known ? def.name : '？？？', {
      fontFamily: FONT,
      fontSize: '16px',
      color: known ? '#ffffff' : '#bac3d1',
      fontStyle: 'bold',
    });
    this.fitText(title, title.text, panelW - 116);
    c.add(title);
    c.add(
      this.add.text(cx - panelW / 2 + 92, top + 50, region?.name ?? '未分類', {
        fontFamily: FONT,
        fontSize: '11px',
        color: region ? `#${region.accent.toString(16).padStart(6, '0')}` : '#9aa0b5',
      }),
    );
    c.add(
      this.add.text(cx - panelW / 2 + 92, top + 69, known ? `討伐数 ${kills}` : '未発見', {
        fontFamily: FONT,
        fontSize: '10px',
        color: known ? '#aeb9c9' : '#8896a9',
      }),
    );
    c.add(this.add.rectangle(cx, top + 101, panelW - 32, 1, 0xffffff, 0.1));

    const left = cx - panelW / 2 + 18;
    c.add(this.add.text(left, top + 112, '出現場所', {
      fontFamily: FONT,
      fontSize: '10px',
      color: '#d9c47e',
      fontStyle: 'bold',
    }));
    c.add(
      this.add.text(left, top + 130, known ? habitat.discovered : habitat.undiscovered, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#e0e5ee',
        wordWrap: { width: panelW - 36, useAdvancedWrap: true },
      }),
    );

    if (!known) {
      c.add(
        this.add
          .text(cx, top + 206, 'この地域で一度討伐すると\n弱点・素材・対応装備が記録されます', {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#aeb9c9',
            align: 'center',
            lineSpacing: 6,
          })
          .setOrigin(0.5),
      );
      if (region) {
        c.add(
          this.add
            .text(cx, top + 278, `地域達成報酬\n${bestiaryRewardLabel(region)}`, {
              fontFamily: FONT,
              fontSize: '11px',
              color: '#d8c98e',
              align: 'center',
              lineSpacing: 5,
            })
            .setOrigin(0.5),
        );
      }
    } else {
      let infoY = top + 163;
      const elementBits: string[] = [];
      if (isElement(def.weakness)) elementBits.push(`弱点 ${ELEMENT_LABEL[def.weakness]}`);
      if (isElement(def.resist)) elementBits.push(`耐性 ${ELEMENT_LABEL[def.resist]}`);
      if (elementBits.length > 0) {
        c.add(
          this.add.text(left, infoY, elementBits.join('　'), {
            fontFamily: FONT,
            fontSize: '11px',
            color: isElement(def.weakness) ? elementColorHex(def.weakness) : '#cfd6e1',
            fontStyle: 'bold',
          }),
        );
      } else {
        c.add(this.add.text(left, infoY, '弱点情報なし', {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#8290a3',
        }));
      }
      infoY += 22;
      if (def.description) {
        c.add(
          this.add.text(left, infoY, def.description, {
            fontFamily: FONT,
            fontSize: '10px',
            color: '#b8c2d1',
            wordWrap: { width: panelW - 36, useAdvancedWrap: true },
            lineSpacing: 3,
          }),
        );
      }

      const dropsY = top + 238;
      c.add(this.add.text(left, dropsY, '主な入手素材', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#d9c47e',
        fontStyle: 'bold',
      }));
      let rowY = dropsY + 20;
      for (const entry of this.detailDrops(def)) {
        const gear = !!getEquipment(entry.itemId);
        const dropName = this.add.text(left + 4, rowY, `${itemDisplayName(entry.itemId)}${gear ? '（装備）' : ''}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#e4e9f1',
        });
        this.fitText(dropName, dropName.text, panelW - 120);
        c.add(dropName);
        c.add(
          this.add
            .text(cx + panelW / 2 - 18, rowY, entry.rateText, {
              fontFamily: FONT,
              fontSize: '10px',
              color: entry.rateColor,
            })
            .setOrigin(1, 0),
        );
        rowY += 20;
      }

      const equipmentY = top + 354;
      const guide = bestiaryEquipmentGuide(def);
      c.add(this.add.text(left, equipmentY, '対応装備', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#d9c47e',
        fontStyle: 'bold',
      }));
      if (guide) {
        c.add(this.add.text(left + 4, equipmentY + 19, guide.title, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#9fd0ff',
          fontStyle: 'bold',
        }));
        const shown = guide.itemIds.slice(0, 3).map((id) => itemDisplayName(id));
        const rest = guide.itemIds.length - shown.length;
        c.add(
          this.add.text(left + 4, equipmentY + 39, `${shown.join('・')}${rest > 0 ? ` ほか${rest}種` : ''}`, {
            fontFamily: FONT,
            fontSize: '10px',
            color: '#c3cedc',
            wordWrap: { width: panelW - 40, useAdvancedWrap: true },
            lineSpacing: 3,
          }),
        );
      } else {
        c.add(this.add.text(left + 4, equipmentY + 20, 'この素材を使う装備は未発見', {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#7f8b9f',
        }));
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

  private fitText(text: Phaser.GameObjects.Text, value: string, maxWidth: number): void {
    let shown = value;
    text.setText(shown);
    while (text.width > maxWidth && shown.length > 2) {
      shown = shown.slice(0, -2);
      text.setText(`${shown}…`);
    }
  }

  private showToast(message: string): void {
    this.toast?.destroy();
    const w = this.scale.width;
    const h = this.scale.height;
    const back = this.add
      .rectangle(0, 0, Math.min(292, w - 32), 38, 0x07111f, 0.96)
      .setStrokeStyle(1, 0xf2cf63, 0.55);
    const label = this.add
      .text(0, 0, message, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#fff0b8',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const toast = this.add.container(w / 2, h - 88, [back, label]).setDepth(20).setAlpha(0);
    this.toast = toast;
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: h - 96,
      duration: 150,
      onComplete: () => {
        this.time.delayedCall(1200, () => {
          this.tweens.add({
            targets: toast,
            alpha: 0,
            duration: 180,
            onComplete: () => {
              if (this.toast === toast) this.toast = null;
              toast.destroy();
            },
          });
        });
      },
    });
  }

  private closeDetail(): void {
    this.detail?.destroy();
    this.detail = null;
  }

  private setupScroll(): void {
    let startY = 0;
    let startScroll = 0;
    let inList = false;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      startY = pointer.y;
      startScroll = this.scrollY;
      this.dragged = false;
      inList = pointer.y >= this.viewTop && pointer.y <= this.viewBottom && !this.detail;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !inList) return;
      const delta = startY - pointer.y;
      if (Math.abs(delta) > 12) this.dragged = true;
      if (this.dragged) this.scrollTo(startScroll + delta);
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      if (!this.detail) this.scrollTo(this.scrollY + dy * 0.5);
    });
  }

  private scrollTo(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  private close(): void {
    this.closeDetail();
    this.toast?.destroy();
    this.toast = null;
    this.scene.stop();
    this.scene.resume('Inventory');
  }
}
