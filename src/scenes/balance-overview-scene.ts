import Phaser from 'phaser';
import {
  BALANCE_RUN_OPTIONS,
  DEFAULT_BALANCE_RUNS,
  simulateHuntBatch,
  type HuntBatchSimulationResult,
  type HuntDiagnostic,
  type HuntDiagnosticStatus,
} from '@/balance/hunt-simulator';
import { FONT, addPanelChrome, rowBand } from '@/ui/theme';

interface ToggleHandle {
  root: Phaser.GameObjects.Container;
  setActive(active: boolean): void;
}

interface OverviewInitData {
  runs?: number;
}

const STATUS: Record<HuntDiagnosticStatus, { label: string; fill: number; text: string }> = {
  critical: { label: '危険', fill: 0x742f3d, text: '#ffc0ca' },
  adjust: { label: '要調整', fill: 0x694725, text: '#ffd397' },
  watch: { label: '確認', fill: 0x625b2c, text: '#f8eca0' },
  good: { label: '基準内', fill: 0x265d50, text: '#b8f2d6' },
};

/** All-hunt ranking view for quickly finding the next tuning target. */
export class BalanceOverviewScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private runLabel!: Phaser.GameObjects.Text;
  private rankButtons: { rank: number; handle: ToggleHandle }[] = [];
  private runButtons: { runs: number; handle: ToggleHandle }[] = [];
  private batch: HuntBatchSimulationResult | null = null;
  private runs = DEFAULT_BALANCE_RUNS;
  private selectedRank = 0;
  private scrollY = 0;
  private maxScroll = 0;
  private viewTop = 170;
  private dragged = false;
  private running = false;
  private readonly rowHeight = 72;
  private readonly rowSnapStart = 114;

  constructor() {
    super('BalanceOverview');
  }

  init(data: OverviewInitData): void {
    if (data.runs !== undefined && BALANCE_RUN_OPTIONS.some((runs) => runs === data.runs)) {
      this.runs = data.runs;
    }
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.rankButtons = [];
    this.runButtons = [];
    this.selectedRank = 0;
    this.scrollY = 0;
    this.maxScroll = 0;
    this.batch = null;
    this.scene.bringToTop();
    addPanelChrome(this, this.viewTop, h, { chromeColor: 0x111827 });
    this.add.rectangle(0, this.viewTop, w, 20, 0x111827, 1).setOrigin(0).setDepth(2);
    this.add.rectangle(0, this.viewTop + 19, w, 1, 0xffffff, 0.08).setOrigin(0).setDepth(3);
    this.content = this.add.container(0, 0).setDepth(1);

    this.iconButton(25, 26, '‹', () => this.close(), 18);
    this.add
      .text(52, 17, '全クエスト診断', { fontFamily: FONT, fontSize: '17px', color: '#ffffff' })
      .setDepth(3);
    this.add
      .text(w - 14, 24, '最低Lv基準', { fontFamily: FONT, fontSize: '9px', color: '#6fd3bd' })
      .setOrigin(1, 0.5)
      .setDepth(3);

    const rankLabels = ['全', '1', '2', '3', '4', '5', '6', '7'];
    rankLabels.forEach((label, index) => {
      const handle = this.toggleChip(24 + index * 44, 69, 38, label, () => this.selectRank(index));
      handle.root.setDepth(3);
      this.rankButtons.push({ rank: index, handle });
    });

    this.add
      .text(14, 111, '周回数', { fontFamily: FONT, fontSize: '10px', color: '#9aa8c4' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    BALANCE_RUN_OPTIONS.forEach((runs, index) => {
      const handle = this.toggleChip(112 + index * 76, 111, 70, `${runs}`, () => this.selectRuns(runs));
      handle.root.setDepth(3);
      this.runButtons.push({ runs, handle });
    });

    this.createRunButton(w / 2, 148);
    this.setupScroll();
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.selectRank(0);
    this.refreshControls();
    this.runBatch(true);
  }

  private selectRank(rank: number): void {
    this.selectedRank = rank;
    for (const button of this.rankButtons) button.handle.setActive(button.rank === rank);
    if (this.batch) this.renderBatch();
  }

  private selectRuns(runs: number): void {
    this.runs = runs;
    this.refreshControls();
  }

  private refreshControls(): void {
    for (const button of this.runButtons) button.handle.setActive(button.runs === this.runs);
    this.runLabel?.setText(`${this.runs}周 × 全狩猟を診断`);
  }

  private runBatch(immediate = false): void {
    if (this.running) return;
    const calculate = (): void => {
      this.batch = simulateHuntBatch({ runs: this.runs });
      this.renderBatch();
      this.running = false;
      this.refreshControls();
    };
    if (immediate) {
      calculate();
      return;
    }
    this.running = true;
    this.runLabel.setText('全クエスト計算中...');
    this.time.delayedCall(20, calculate);
  }

  private filteredEntries(): HuntDiagnostic[] {
    const entries = this.batch?.entries ?? [];
    if (this.selectedRank === 0) return entries;
    return entries.filter((entry) => entry.result.rank === this.selectedRank);
  }

  private renderBatch(): void {
    if (!this.batch) return;
    this.content.removeAll(true);
    this.scrollY = 0;
    const w = this.scale.width;
    const entries = this.filteredEntries();
    const counts: Record<HuntDiagnosticStatus, number> = { critical: 0, adjust: 0, watch: 0, good: 0 };
    for (const entry of entries) counts[entry.status]++;
    let y = this.viewTop + 28;

    this.content.add(
      this.add.text(14, y, `${entries.length}件 × ${this.batch.runsPerQuest}周`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#aeb8cf',
      }),
    );
    this.content.add(
      this.add
        .text(w - 14, y, `${(entries.length * this.batch.runsPerQuest).toLocaleString()}試行`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#7f8aa4',
        })
        .setOrigin(1, 0),
    );
    y += 24;

    this.addSummary(8, y, 82, '危険', counts.critical, STATUS.critical);
    this.addSummary(96, y, 82, '要調整', counts.adjust, STATUS.adjust);
    this.addSummary(184, y, 82, '確認', counts.watch, STATUS.watch);
    this.addSummary(272, y, 82, '基準内', counts.good, STATUS.good);
    y += 58;

    this.content.add(
      this.add.text(14, y, '優先度順', { fontFamily: FONT, fontSize: '13px', color: '#ffffff' }),
    );
    this.content.add(
      this.add
        .text(w - 14, y + 1, 'タップで個別診断', { fontFamily: FONT, fontSize: '10px', color: '#9fd0ff' })
        .setOrigin(1, 0),
    );
    y += 24;

    entries.forEach((entry, index) => {
      const rowHeight = 66;
      const style = STATUS[entry.status];
      const band = rowBand(this, y, rowHeight, index);
      this.content.add(band);
      this.content.add(
        this.add.text(18, y + 5, `★${entry.result.rank}  ${this.shortName(entry.result.questName)}`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#edf0f7',
        }),
      );
      const statusBox = this.add.graphics();
      statusBox.fillStyle(style.fill, 1);
      statusBox.fillRoundedRect(w - 65, y + 4, 47, 20, 6);
      this.content.add(statusBox);
      this.content.add(
        this.add
          .text(w - 41.5, y + 8, style.label, { fontFamily: FONT, fontSize: '9px', color: style.text })
          .setOrigin(0.5, 0),
      );
      this.content.add(
        this.add.text(18, y + 28, entry.issue, {
          fontFamily: FONT,
          fontSize: '10px',
          color: style.text,
        }),
      );
      const rare = entry.rarestRunsPerItem === null
        ? '-'
        : entry.rarestRunsPerItem < 10
          ? entry.rarestRunsPerItem.toFixed(1)
          : `${Math.round(entry.rarestRunsPerItem)}`;
      this.content.add(
        this.add.text(
          18,
          y + 47,
          `クリア ${Math.round(entry.result.clearRate * 100)}%   討伐 ${this.seconds(entry.result.averageTtkSec)}/${entry.result.target.ttkSec}秒   レア ${rare}周`,
          { fontFamily: FONT, fontSize: '9px', color: '#8995ae' },
        ),
      );
      const hit = this.add
        .rectangle(w / 2, y - 4, w - 16, rowHeight, 0x000000, 0.001)
        .setOrigin(0.5, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (!this.dragged) this.openIndividual(entry.result.questId);
      });
      this.content.add(hit);
      y += this.rowHeight;
    });

    if (entries.length === 0) {
      this.content.add(
        this.add.text(w / 2, y + 30, '対象なし', { fontFamily: FONT, fontSize: '12px', color: '#7f8aa4' }).setOrigin(0.5),
      );
      y += 60;
    }
    y += 6;
    this.content.add(
      this.add.text(14, y, '剣・入手可能な最良装備 / 最低Lv / 通常攻撃 / 回復なし', {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#66718a',
      }),
    );
    y += 24;
    this.maxScroll = Math.max(0, y + 12 - this.scale.height);
    this.scrollTo(0);
  }

  private addSummary(
    x: number,
    y: number,
    width: number,
    label: string,
    value: number,
    style: { fill: number; text: string },
  ): void {
    const box = this.add.graphics();
    box.fillStyle(style.fill, 0.78);
    box.fillRoundedRect(x, y, width, 48, 7);
    box.lineStyle(1, 0xffffff, 0.08);
    box.strokeRoundedRect(x, y, width, 48, 7);
    this.content.add(box);
    this.content.add(
      this.add
        .text(x + width / 2, y + 7, label, { fontFamily: FONT, fontSize: '9px', color: style.text })
        .setOrigin(0.5, 0),
    );
    this.content.add(
      this.add
        .text(x + width / 2, y + 23, `${value}`, { fontFamily: FONT, fontSize: '16px', color: '#ffffff' })
        .setOrigin(0.5, 0),
    );
  }

  private createRunButton(x: number, y: number): void {
    const width = 328;
    const height = 32;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x27665e, 1);
    graphics.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    graphics.lineStyle(1, 0xa7eadc, 0.3);
    graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    this.runLabel = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '13px', color: '#e8fff9' })
      .setOrigin(0.5);
    const button = this.add.container(x, y, [graphics, this.runLabel]).setDepth(3);
    button.setSize(width, height).setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => button.setScale(0.98));
    button.on('pointerout', () => button.setScale(1));
    button.on('pointerup', () => {
      button.setScale(1);
      if (!this.dragged) this.runBatch();
    });
  }

  private toggleChip(
    x: number,
    y: number,
    width: number,
    label: string,
    onTap: () => void,
  ): ToggleHandle {
    const height = 28;
    const graphics = this.add.graphics();
    const text = this.add
      .text(0, 0, label, { fontFamily: FONT, fontSize: '11px', color: '#aeb8cf' })
      .setOrigin(0.5);
    const root = this.add.container(x, y, [graphics, text]);
    root.setSize(width, height).setInteractive({ useHandCursor: true });
    root.on('pointerup', () => {
      if (!this.dragged) onTap();
    });
    const setActive = (active: boolean): void => {
      graphics.clear();
      graphics.fillStyle(active ? 0x394c68 : 0x171d2f, 1);
      graphics.fillRoundedRect(-width / 2, -height / 2, width, height, 7);
      graphics.lineStyle(1, active ? 0xf2cd67 : 0xffffff, active ? 0.6 : 0.07);
      graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, 7);
      text.setColor(active ? '#ffffff' : '#8995ae');
    };
    setActive(false);
    return { root, setActive };
  }

  private iconButton(
    x: number,
    y: number,
    label: string,
    onTap: () => void,
    radius: number,
  ): Phaser.GameObjects.Container {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x1f2940, 1);
    graphics.fillCircle(0, 0, radius);
    graphics.lineStyle(1, 0xffffff, 0.12);
    graphics.strokeCircle(0, 0, radius);
    const text = this.add
      .text(0, -2, label, { fontFamily: FONT, fontSize: `${Math.max(14, radius)}px`, color: '#dce4f3' })
      .setOrigin(0.5);
    const button = this.add.container(x, y, [graphics, text]).setDepth(3);
    button.setSize(radius * 2, radius * 2).setInteractive({ useHandCursor: true });
    button.on('pointerup', () => {
      if (!this.dragged) onTap();
    });
    return button;
  }

  private setupScroll(): void {
    let startY = 0;
    let startScroll = 0;
    let inList = false;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      startY = pointer.y;
      startScroll = this.scrollY;
      this.dragged = false;
      inList = pointer.y >= this.viewTop;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !inList) return;
      const distance = startY - pointer.y;
      if (Math.abs(distance) > 10) this.dragged = true;
      if (this.dragged) this.scrollTo(startScroll + distance);
    });
    this.input.on('pointerup', () => {
      if (this.dragged && inList) this.snapScrollToRows();
      inList = false;
    });
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      this.scrollTo(this.scrollY + dy * 0.5);
      this.snapScrollToRows();
    });
  }

  private scrollTo(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  private snapScrollToRows(): void {
    if (this.scrollY < this.rowSnapStart / 2) {
      this.scrollTo(0);
      return;
    }
    const row = Math.max(0, Math.round((this.scrollY - this.rowSnapStart) / this.rowHeight));
    this.scrollTo(this.rowSnapStart + row * this.rowHeight);
  }

  private openIndividual(questId: string): void {
    const lab = this.scene.get('BalanceLab') as Phaser.Scene & { showQuest(questId: string): void };
    lab.showQuest(questId);
    this.scene.stop();
    this.scene.resume('BalanceLab');
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('BalanceLab');
  }

  private shortName(name: string): string {
    return name.length > 18 ? `${name.slice(0, 17)}…` : name;
  }

  private seconds(value: number): string {
    return value < 100 ? value.toFixed(1) : `${Math.round(value)}`;
  }
}
