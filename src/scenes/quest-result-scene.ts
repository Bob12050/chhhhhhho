import Phaser from 'phaser';
import { allRecipes } from '@/crafting/recipes';
import { craftBlock } from '@/crafting/crafting';
import { getEquipment, getMaterial, itemDisplayName } from '@/data/items';
import { rarityColorHex, rarityRank } from '@/data/rarity';
import { gameState } from '@/player/game-state';
import { getMap, spawnPoint } from '@/maps/map-def';
import { saveManager } from '@/save/save-manager';
import { FONT, HUD_DEPTH, UI, ninePanel, pillButton } from '@/ui/theme';

export interface QuestResultItem {
  itemId: string;
  qty: number;
}

export interface QuestResultData {
  questName: string;
  rank?: number;
  veteran?: boolean;
  investigationThreat?: number;
  investigationRewardRank?: number;
  combatGold: number;
  combatExp: number;
  drops: QuestResultItem[];
  reportGold: number;
  reportExp: number;
  reportItems: QuestResultItem[];
  craftableEquipment: string[];
  jobUnlock?: boolean;
  ending?: boolean;
}

export class QuestResultScene extends Phaser.Scene {
  private resultData!: QuestResultData;

  constructor() {
    super('QuestResult');
  }

  init(data: QuestResultData): void {
    this.resultData = data;
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const depth = HUD_DEPTH + 3000;
    this.add.rectangle(0, 0, w, h, 0x050711, 0.72).setOrigin(0).setDepth(depth).setInteractive();

    const panelW = Math.min(332, w - 22);
    const panelH = Math.min(520, h - 72);
    const cx = w / 2;
    const cy = h / 2 - 6;
    ninePanel(this, cx, cy, panelW, panelH, { active: true }).setDepth(depth + 1);

    const top = cy - panelH / 2;
    const left = cx - panelW / 2;
    const right = cx + panelW / 2;
    let y = top + 22;

    this.add
      .text(cx, y, this.resultData.investigationThreat ? 'INVESTIGATION CLEAR' : 'QUEST CLEAR', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffd86b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(depth + 2);
    y += 28;

    const rank = this.resultData.investigationThreat
      ? `調査危険度 ${this.resultData.investigationThreat}`
      : this.resultData.rank
        ? `★${this.resultData.rank}`
        : '';
    const prefix = this.resultData.veteran ? '歴戦 ' : '';
    this.add
      .text(cx, y, `${rank} ${prefix}${this.resultData.questName}`.trim(), {
        fontFamily: FONT,
        fontSize: '13px',
        color: UI.white,
      })
      .setOrigin(0.5)
      .setDepth(depth + 2);
    y += 26;

    this.statStrip(left + 18, right - 18, y, depth + 2);
    y += 56;

    y = this.section(left + 18, y, '戦利品', depth + 2);
    y = this.itemRows(left + 18, right - 18, y, this.resultData.drops, depth + 2, 'ドロップなし');

    y += 6;
    y = this.section(left + 18, y, 'クリア報酬', depth + 2);
    const report = [
      ...(this.resultData.jobUnlock ? [{ label: '4次職への道 解放', color: '#ffe98f' }] : []),
      ...(this.resultData.reportGold > 0 ? [{ label: `${this.resultData.reportGold}G`, color: UI.gold }] : []),
      ...(this.resultData.reportExp > 0 ? [{ label: `EXP ${this.resultData.reportExp}`, color: '#9fd0ff' }] : []),
      ...(this.resultData.investigationRewardRank
        ? [{
            label: `R${this.resultData.investigationRewardRank} ランダム装備 x1`,
            color: rarityColorHex(this.resultData.investigationRewardRank),
          }]
        : []),
      ...this.resultData.reportItems.map((i) => ({
        label: `${itemDisplayName(i.itemId)} x${i.qty}`,
        color: rarityColorHex(this.itemRarity(i.itemId)),
      })),
    ];
    y = this.chipRows(left + 18, right - 18, y, report, depth + 2, '追加報酬なし');

    y += 8;
    y = this.section(left + 18, y, 'クラフト解放', depth + 2);
    const craftRows = this.resultData.craftableEquipment.slice(0, 3).map((id) => ({
      label: itemDisplayName(id),
      color: rarityColorHex(getEquipment(id)?.rarity),
    }));
    y = this.chipRows(left + 18, right - 18, y, craftRows, depth + 2, '新しく作れる装備はまだなし');

    this.add
      .text(
        cx,
        Math.min(y + 16, top + panelH - 86),
        this.resultData.jobUnlock ? '4次職への道が開かれました' : '報酬は受け取り済みです',
        {
          fontFamily: FONT,
          fontSize: '10px',
          color: UI.sub,
        },
      )
      .setOrigin(0.5)
      .setDepth(depth + 2);

    pillButton(
      this,
      cx,
      top + panelH - 38,
      this.resultData.ending ? 'エンディングへ' : '町へ戻る',
      () => this.returnToTown(),
      { color: '#ffe9a8', bg: '#7a4d22', size: 14 },
    ).setDepth(depth + 2);

    this.input.keyboard?.on('keydown-ESC', () => this.returnToTown());
  }

  private statStrip(left: number, right: number, y: number, depth: number): void {
    const gap = 8;
    const boxW = (right - left - gap) / 2;
    this.statBox(left + boxW / 2, y, boxW, 'EXP', `${this.resultData.combatExp}`, '#9fd0ff', depth);
    this.statBox(left + boxW + gap + boxW / 2, y, boxW, 'GOLD', `${this.resultData.combatGold}G`, UI.gold, depth);
  }

  private statBox(cx: number, y: number, width: number, label: string, value: string, color: string, depth: number): void {
    this.add.rectangle(cx, y + 18, width, 38, 0x151a2e, 0.96).setStrokeStyle(1, 0xffffff, 0.12).setDepth(depth);
    this.add.text(cx, y + 8, label, { fontFamily: FONT, fontSize: '9px', color: UI.sub }).setOrigin(0.5).setDepth(depth + 1);
    this.add.text(cx, y + 24, value, { fontFamily: FONT, fontSize: '14px', color, fontStyle: 'bold' }).setOrigin(0.5).setDepth(depth + 1);
  }

  private section(x: number, y: number, label: string, depth: number): number {
    this.add.text(x, y, label, { fontFamily: FONT, fontSize: '12px', color: '#8fa0ff', fontStyle: 'bold' }).setDepth(depth);
    this.add.rectangle(x, y + 18, 88, 2, 0xf5c542, 0.65).setOrigin(0, 0.5).setDepth(depth);
    return y + 24;
  }

  private itemRows(
    left: number,
    right: number,
    y: number,
    items: QuestResultItem[],
    depth: number,
    empty: string,
  ): number {
    if (items.length === 0) {
      this.add.text(left, y, empty, { fontFamily: FONT, fontSize: '11px', color: UI.sub }).setDepth(depth);
      return y + 20;
    }
    for (const item of items.slice(0, 4)) {
      const rarity = this.itemRarity(item.itemId);
      const rank = rarityRank(rarity);
      const color = rarityColorHex(rarity);
      this.add.rectangle((left + right) / 2, y + 11, right - left, 22, 0x171c30, 0.92).setStrokeStyle(1, 0xffffff, 0.07).setDepth(depth);
      this.add.circle(left + 10, y + 11, rank >= 5 ? 5 : 4, parseInt(color.slice(1), 16), 0.95).setDepth(depth + 1);
      this.add.text(left + 22, y + 4, itemDisplayName(item.itemId), { fontFamily: FONT, fontSize: '12px', color }).setDepth(depth + 1);
      this.add.text(right - 8, y + 4, `x${item.qty}`, { fontFamily: FONT, fontSize: '12px', color: UI.white }).setOrigin(1, 0).setDepth(depth + 1);
      y += 25;
    }
    if (items.length > 4) {
      this.add.text(right, y, `ほか ${items.length - 4} 種`, { fontFamily: FONT, fontSize: '10px', color: UI.sub }).setOrigin(1, 0).setDepth(depth);
      y += 16;
    }
    return y;
  }

  private chipRows(
    left: number,
    right: number,
    y: number,
    rows: { label: string; color?: string }[],
    depth: number,
    empty: string,
  ): number {
    if (rows.length === 0) {
      this.add.text(left, y, empty, { fontFamily: FONT, fontSize: '11px', color: UI.sub }).setDepth(depth);
      return y + 20;
    }
    let x = left;
    for (const row of rows) {
      const t = this.add
        .text(0, 0, row.label, {
          fontFamily: FONT,
          fontSize: '11px',
          color: row.color ?? UI.white,
          backgroundColor: '#1b2036',
          padding: { x: 7, y: 4 },
        })
        .setDepth(depth);
      if (x + t.width > right) {
        x = left;
        y += 25;
      }
      t.setPosition(x, y);
      x += t.width + 6;
    }
    return y + 26;
  }

  private itemRarity(itemId: string): number | undefined {
    return getMaterial(itemId)?.rarity ?? getEquipment(itemId)?.rarity;
  }

  private returnToTown(): void {
    const town = getMap('town');
    const sp = town ? spawnPoint(town, 'respawn') : { x: 320, y: 735 };
    gameState.mapId = 'town';
    gameState.x = sp.x;
    gameState.y = sp.y;
    void saveManager.write(gameState.toSave(gameState.slot));
    this.scene.stop();
    const world = this.scene.get('World');
    world.scene.resume();
    world.scene.restart();
    if (this.resultData.ending) this.scene.launch('Ending');
  }
}

export function craftableEquipmentIds(): string[] {
  return allRecipes()
    .filter((r) => getEquipment(r.resultItemId) && craftBlock(gameState, r) === null)
    .map((r) => r.resultItemId);
}
