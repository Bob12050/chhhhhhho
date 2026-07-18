import Phaser from 'phaser';
import {
  BALANCE_RUN_OPTIONS,
  DEFAULT_BALANCE_RUNS,
  huntSimulationQuests,
  simulateHunt,
  type BalanceVerdict,
  type HuntSimulationResult,
} from '@/balance/hunt-simulator';
import type { QuestDef } from '@/quests/quest-defs';
import { FONT, addPanelChrome, rowBand } from '@/ui/theme';
import { KineticScroll } from '@/ui/kinetic-scroll';

interface ToggleHandle {
  root: Phaser.GameObjects.Container;
  setActive(active: boolean): void;
}

interface StepperHandle {
  value: Phaser.GameObjects.Text;
}

const VERDICT: Record<BalanceVerdict, { label: string; color: number; text: string }> = {
  comfortable: { label: '快適', color: 0x28604f, text: '#b8f2d6' },
  tense: { label: '緊張感', color: 0x6b5a28, text: '#ffe8a3' },
  potion: { label: '回復前提', color: 0x74472b, text: '#ffd1aa' },
  wall: { label: '壁', color: 0x762f3d, text: '#ffc0ca' },
};

/** Debug-only, save-independent simulator for repeated hunt balance checks. */
export class BalanceLabScene extends Phaser.Scene {
  private readonly quests = huntSimulationQuests();
  private content!: Phaser.GameObjects.Container;
  private questTitle!: Phaser.GameObjects.Text;
  private questMeta!: Phaser.GameObjects.Text;
  private runLabel!: Phaser.GameObjects.Text;
  private rankButtons: ToggleHandle[] = [];
  private runButtons: { runs: number; handle: ToggleHandle }[] = [];
  private levelStepper!: StepperHandle;
  private hpStepper!: StepperHandle;
  private damageStepper!: StepperHandle;
  private dropStepper!: StepperHandle;
  private selectedRank = 1;
  private questIndex = 0;
  private runs = DEFAULT_BALANCE_RUNS;
  private playerLevel = 1;
  private hpScale = 1;
  private damageScale = 1;
  private dropScale = 1;
  private scrollY = 0;
  private maxScroll = 0;
  private viewTop = 304;
  private dragged = false;
  private running = false;
  private restoreDebugOverlay = false;

  constructor() {
    super('BalanceLab');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.rankButtons = [];
    this.runButtons = [];
    this.scrollY = 0;
    this.maxScroll = 0;
    this.restoreDebugOverlay = this.scene.isActive('DebugOverlay');
    if (this.restoreDebugOverlay) this.scene.sleep('DebugOverlay');
    this.scene.bringToTop();
    addPanelChrome(this, this.viewTop, h, { chromeColor: 0x111827 });
    this.content = this.add.container(0, 0).setDepth(1);

    this.iconButton(25, 26, '‹', () => this.close(), 18);
    this.add
      .text(52, 17, '周回バランスラボ', { fontFamily: FONT, fontSize: '17px', color: '#ffffff' })
      .setDepth(3);
    const overview = this.add
      .text(w - 14, 24, '全体診断 ›', { fontFamily: FONT, fontSize: '10px', color: '#9fd0ff' })
      .setOrigin(1, 0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    overview.on('pointerup', () => {
      if (!this.dragged) this.openOverview();
    });

    this.add
      .text(14, 67, '★', { fontFamily: FONT, fontSize: '12px', color: '#e4c96c' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    for (let rank = 1; rank <= 7; rank++) {
      const handle = this.toggleChip(72 + (rank - 1) * 40, 67, 36, `${rank}`, () => this.selectRank(rank));
      handle.root.setDepth(3);
      this.rankButtons.push(handle);
    }

    this.iconButton(25, 117, '‹', () => this.moveQuest(-1), 16);
    this.iconButton(w - 25, 117, '›', () => this.moveQuest(1), 16);
    this.questTitle = this.add
      .text(w / 2, 100, '', {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 270, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0)
      .setDepth(3);
    this.questMeta = this.add
      .text(w / 2, 135, '', { fontFamily: FONT, fontSize: '10px', color: '#9aa8c4' })
      .setOrigin(0.5)
      .setDepth(3);

    this.add
      .text(14, 166, '周回数', { fontFamily: FONT, fontSize: '10px', color: '#9aa8c4' })
      .setOrigin(0, 0.5)
      .setDepth(3);
    BALANCE_RUN_OPTIONS.forEach((runs, index) => {
      const handle = this.toggleChip(112 + index * 76, 166, 70, `${runs}`, () => this.selectRuns(runs));
      handle.root.setDepth(3);
      this.runButtons.push({ runs, handle });
    });

    this.levelStepper = this.stepper(49, 218, 76, '想定Lv', () => this.adjustLevel(-1), () => this.adjustLevel(1));
    this.hpStepper = this.stepper(136, 218, 76, '敵HP', () => this.adjustScale('hp', -0.1), () => this.adjustScale('hp', 0.1));
    this.damageStepper = this.stepper(223, 218, 76, '敵攻撃', () => this.adjustScale('damage', -0.1), () => this.adjustScale('damage', 0.1));
    this.dropStepper = this.stepper(310, 218, 76, 'ドロップ', () => this.adjustScale('drop', -0.1), () => this.adjustScale('drop', 0.1));

    this.createRunButton(w / 2, 276);
    this.setupScroll();
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.selectRank(this.defaultRank());
  }

  private defaultRank(): number {
    const available = new Set(this.quests.map((quest) => quest.rank ?? 1));
    for (let rank = 1; rank <= 7; rank++) if (available.has(rank)) return rank;
    return 1;
  }

  private questsForRank(): QuestDef[] {
    return this.quests.filter((quest) => (quest.rank ?? 1) === this.selectedRank);
  }

  private currentQuest(): QuestDef | undefined {
    return this.questsForRank()[this.questIndex];
  }

  private selectRank(rank: number): void {
    this.selectedRank = rank;
    this.questIndex = 0;
    this.rankButtons.forEach((button, index) => button.setActive(index + 1 === rank));
    this.selectQuest();
  }

  private moveQuest(direction: number): void {
    const quests = this.questsForRank();
    if (quests.length === 0) return;
    this.questIndex = Phaser.Math.Wrap(this.questIndex + direction, 0, quests.length);
    this.selectQuest();
  }

  private selectQuest(): void {
    const quest = this.currentQuest();
    if (!quest) {
      this.questTitle.setText('対象クエストなし');
      this.questMeta.setText('');
      return;
    }
    this.playerLevel = quest.require?.minLevel ?? 1;
    this.hpScale = 1;
    this.damageScale = 1;
    this.dropScale = 1;
    this.questTitle.setText(quest.name);
    const index = this.questIndex + 1;
    const total = this.questsForRank().length;
    this.questMeta.setText(`Lv${this.playerLevel}  ${index}/${total}${quest.veteran ? '  歴戦' : ''}`);
    this.refreshControls();
    this.runSimulation(true);
  }

  showQuest(questId: string): void {
    const quest = this.quests.find((entry) => entry.id === questId);
    if (!quest) return;
    this.selectedRank = quest.rank ?? 1;
    this.rankButtons.forEach((button, index) => button.setActive(index + 1 === this.selectedRank));
    this.questIndex = this.questsForRank().findIndex((entry) => entry.id === questId);
    if (this.questIndex < 0) this.questIndex = 0;
    this.selectQuest();
  }

  private selectRuns(runs: number): void {
    this.runs = runs;
    this.refreshControls();
  }

  private adjustLevel(delta: number): void {
    this.playerLevel = Phaser.Math.Clamp(this.playerLevel + delta, 1, 99);
    this.refreshControls();
  }

  private adjustScale(key: 'hp' | 'damage' | 'drop', delta: number): void {
    const next = (value: number): number => Phaser.Math.Clamp(Math.round((value + delta) * 10) / 10, 0.1, 5);
    if (key === 'hp') this.hpScale = next(this.hpScale);
    else if (key === 'damage') this.damageScale = next(this.damageScale);
    else this.dropScale = next(this.dropScale);
    this.refreshControls();
  }

  private refreshControls(): void {
    this.runButtons.forEach(({ runs, handle }) => handle.setActive(runs === this.runs));
    this.levelStepper?.value.setText(`${this.playerLevel}`);
    this.hpStepper?.value.setText(this.percent(this.hpScale));
    this.damageStepper?.value.setText(this.percent(this.damageScale));
    this.dropStepper?.value.setText(this.percent(this.dropScale));
    this.runLabel?.setText(`${this.runs}周 実行`);
  }

  private runSimulation(immediate = false): void {
    if (this.running) return;
    const quest = this.currentQuest();
    if (!quest) return;
    const calculate = (): void => {
      const result = simulateHunt({
        questId: quest.id,
        runs: this.runs,
        playerLevel: this.playerLevel,
        enemyHpScale: this.hpScale,
        enemyDamageScale: this.damageScale,
        dropScale: this.dropScale,
      });
      this.renderResult(result);
      this.running = false;
      this.runLabel.setText(`${this.runs}周 実行`);
    };
    if (immediate) {
      calculate();
      return;
    }
    this.running = true;
    this.runLabel.setText('計算中...');
    this.time.delayedCall(20, calculate);
  }

  private renderResult(result: HuntSimulationResult): void {
    this.content.removeAll(true);
    this.scrollY = 0;
    const w = this.scale.width;
    const encounterLabel = {
      mob: '通常討伐',
      boss: '大型単体',
      prelude: '露払い付き',
      multiBoss: '連続狩猟',
    }[result.encounter.kind];
    let y = this.viewTop + 12;

    this.content.add(
      this.add.text(14, y, `結果  ${result.runs}周`, { fontFamily: FONT, fontSize: '12px', color: '#aeb8cf' }),
    );
    this.content.add(
      this.add
        .text(w - 14, y, `クリア ${result.clears}/${result.runs}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#d8deed',
        })
        .setOrigin(1, 0),
    );
    y += 22;

    const verdict = VERDICT[result.verdict];
    const verdictBox = this.add.graphics();
    verdictBox.fillStyle(verdict.color, 0.9);
    verdictBox.fillRoundedRect(8, y, w - 16, 52, 8);
    verdictBox.lineStyle(1, 0xffffff, 0.12);
    verdictBox.strokeRoundedRect(8, y, w - 16, 52, 8);
    this.content.add(verdictBox);
    this.content.add(
      this.add.text(20, y + 8, verdict.label, { fontFamily: FONT, fontSize: '17px', color: verdict.text }),
    );
    this.content.add(
      this.add
        .text(w - 20, y + 9, `${Math.round(result.clearRate * 100)}%`, {
          fontFamily: FONT,
          fontSize: '17px',
          color: '#ffffff',
        })
        .setOrigin(1, 0),
    );
    this.content.add(
      this.add.text(20, y + 33, result.notes.join(' / '), {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#d8deed',
        wordWrap: { width: w - 40, useAdvancedWrap: true },
      }),
    );
    y += 64;

    const metricWidth = 82;
    this.addMetric(8, y, metricWidth, '平均討伐', this.seconds(result.averageTtkSec));
    this.addMetric(96, y, metricWidth, 'P90', this.seconds(result.p90TtkSec));
    this.addMetric(184, y, metricWidth, '耐久', `${result.hitsToDie}発`);
    this.addMetric(272, y, metricWidth, '危険度', result.danger.toFixed(2));
    y += 58;

    this.content.add(
      this.add.text(14, y, '対象', { fontFamily: FONT, fontSize: '10px', color: '#7f8aa4' }),
    );
    this.content.add(
      this.add.text(48, y - 1, result.targetName, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#e6eaf4',
        wordWrap: { width: w - 112, useAdvancedWrap: true },
      }),
    );
    this.content.add(
      this.add
        .text(w - 14, y, `${encounterLabel} / ${result.encounter.enemyCount}体`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#9aa8c4',
        })
        .setOrigin(1, 0),
    );
    y += result.targetName.length > 25 ? 38 : 26;

    const rewardBox = this.add.graphics();
    rewardBox.fillStyle(0x18233a, 0.95);
    rewardBox.fillRoundedRect(8, y, w - 16, 38, 7);
    this.content.add(rewardBox);
    this.content.add(
      this.add.text(20, y + 11, `平均  ${Math.round(result.rewards.averageGoldPerRun).toLocaleString()} G`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#f3d773',
      }),
    );
    this.content.add(
      this.add
        .text(w - 20, y + 11, `${Math.round(result.rewards.averageExpPerRun).toLocaleString()} EXP`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#85d7c5',
        })
        .setOrigin(1, 0),
    );
    y += 54;

    this.content.add(
      this.add.text(14, y, '調整目安', { fontFamily: FONT, fontSize: '13px', color: '#ffffff' }),
    );
    this.content.add(
      this.add
        .text(w - 14, y + 1, `目標 ${result.target.ttkSec}秒 / ${result.target.hitsToDie}発`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#9aa8c4',
        })
        .setOrigin(1, 0),
    );
    y += 24;
    y = this.addTuningRow(
      y,
      '敵HP',
      this.percent(this.hpScale),
      this.percent(result.target.suggestedHpScale),
      `${Math.round(result.encounter.adjustedTotalHp).toLocaleString()} HP`,
    );
    y = this.addTuningRow(
      y,
      '敵攻撃',
      this.percent(this.damageScale),
      this.percent(result.target.suggestedDamageScale),
      `${Math.round(result.encounter.adjustedMaxContactDamage)} dmg`,
    );
    y += 8;

    this.content.add(
      this.add.text(14, y, `ドロップ  ${this.percent(this.dropScale)}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffffff',
      }),
    );
    this.content.add(
      this.add
        .text(w - 14, y + 1, '失敗周も含む', { fontFamily: FONT, fontSize: '10px', color: '#7f8aa4' })
        .setOrigin(1, 0),
    );
    y += 24;
    if (result.drops.length === 0) {
      this.content.add(
        this.add.text(18, y, 'ドロップ設定なし', { fontFamily: FONT, fontSize: '11px', color: '#7f8aa4' }),
      );
      y += 34;
    } else {
      result.drops.forEach((drop, index) => {
        const band = rowBand(this, y, 50, index);
        this.content.add(band);
        this.content.add(
          this.add.text(18, y + 5, drop.name, { fontFamily: FONT, fontSize: '12px', color: '#edf0f7' }),
        );
        this.content.add(
          this.add
            .text(w - 18, y + 5, `×${drop.total.toLocaleString()}`, {
              fontFamily: FONT,
              fontSize: '12px',
              color: '#ffffff',
            })
            .setOrigin(1, 0),
        );
        const frequency = drop.runsPerItem === null
          ? `${result.runs}周内で未取得`
          : `1個 / ${drop.runsPerItem < 10 ? drop.runsPerItem.toFixed(1) : Math.round(drop.runsPerItem)}周`;
        this.content.add(
          this.add.text(18, y + 28, frequency, {
            fontFamily: FONT,
            fontSize: '10px',
            color: drop.runsPerItem === null ? '#ef9aa6' : '#9fd0ff',
          }),
        );
        this.content.add(
          this.add
            .text(w - 18, y + 28, `未獲得 ${Math.round(drop.noDropRate * 100)}%`, {
              fontFamily: FONT,
              fontSize: '10px',
              color: '#8995ae',
            })
            .setOrigin(1, 0),
        );
        y += 56;
      });
    }

    y += 4;
    this.content.add(
      this.add.text(14, y, 'ベンチマーク', { fontFamily: FONT, fontSize: '12px', color: '#aeb8cf' }),
    );
    y += 22;
    this.content.add(
      this.add.text(
        18,
        y,
        `剣・入手可能な最良装備 / 通常攻撃 / 回復なし\nLv${result.playerLevel}  HP ${result.player.maxHp}  攻撃 ${result.player.physAtk}  防御 ${result.player.defense}\n実効DPS ${result.player.effectiveDps.toFixed(1)}  装備 ${result.player.gearNames.length}点\nセット ${result.player.setBonuses.join(' / ') || 'なし'}`,
        {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#7f8aa4',
          lineSpacing: 4,
        },
      ),
    );
    y += 74;

    this.maxScroll = Math.max(0, y + 14 - this.scale.height);
    this.scrollTo(0);
  }

  private addMetric(x: number, y: number, width: number, label: string, value: string): void {
    const box = this.add.graphics();
    box.fillStyle(0x171d2f, 1);
    box.fillRoundedRect(x, y, width, 48, 7);
    box.lineStyle(1, 0xffffff, 0.06);
    box.strokeRoundedRect(x, y, width, 48, 7);
    this.content.add(box);
    this.content.add(
      this.add
        .text(x + width / 2, y + 8, label, { fontFamily: FONT, fontSize: '9px', color: '#8995ae' })
        .setOrigin(0.5, 0),
    );
    this.content.add(
      this.add
        .text(x + width / 2, y + 25, value, { fontFamily: FONT, fontSize: '13px', color: '#ffffff' })
        .setOrigin(0.5, 0),
    );
  }

  private addTuningRow(y: number, label: string, current: string, suggested: string, detail: string): number {
    const w = this.scale.width;
    this.content.add(
      this.add.text(18, y + 8, label, { fontFamily: FONT, fontSize: '11px', color: '#b8c0d4' }),
    );
    this.content.add(
      this.add.text(92, y + 7, current, { fontFamily: FONT, fontSize: '12px', color: '#ffffff' }),
    );
    this.content.add(
      this.add.text(142, y + 7, '→', { fontFamily: FONT, fontSize: '12px', color: '#6f7b95' }),
    );
    this.content.add(
      this.add.text(168, y + 7, suggested, { fontFamily: FONT, fontSize: '12px', color: '#f3d773' }),
    );
    this.content.add(
      this.add
        .text(w - 18, y + 8, detail, { fontFamily: FONT, fontSize: '10px', color: '#7f8aa4' })
        .setOrigin(1, 0),
    );
    return y + 30;
  }

  private createRunButton(x: number, y: number): void {
    const width = 328;
    const height = 38;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x27665e, 1);
    graphics.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    graphics.fillStyle(0xffffff, 0.08);
    graphics.fillRoundedRect(-width / 2 + 2, -height / 2 + 2, width - 4, height / 2 - 2, {
      tl: 7,
      tr: 7,
      bl: 0,
      br: 0,
    });
    graphics.lineStyle(1, 0xa7eadc, 0.3);
    graphics.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    this.runLabel = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#e8fff9' })
      .setOrigin(0.5);
    const button = this.add.container(x, y, [graphics, this.runLabel]).setDepth(3);
    button.setSize(width, height).setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => button.setScale(0.98));
    button.on('pointerout', () => button.setScale(1));
    button.on('pointerup', () => {
      button.setScale(1);
      if (!this.dragged) this.runSimulation();
    });
    this.refreshControls();
  }

  private stepper(
    x: number,
    y: number,
    width: number,
    label: string,
    onMinus: () => void,
    onPlus: () => void,
  ): StepperHandle {
    const box = this.add.graphics().setDepth(3);
    box.fillStyle(0x171d2f, 1);
    box.fillRoundedRect(x - width / 2, y - 25, width, 52, 7);
    box.lineStyle(1, 0xffffff, 0.07);
    box.strokeRoundedRect(x - width / 2, y - 25, width, 52, 7);
    this.add
      .text(x, y - 18, label, { fontFamily: FONT, fontSize: '9px', color: '#8995ae' })
      .setOrigin(0.5, 0)
      .setDepth(3);
    const value = this.add
      .text(x, y + 4, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(3);
    this.iconButton(x - 26, y + 5, '−', onMinus, 11, 0x242c45);
    this.iconButton(x + 26, y + 5, '+', onPlus, 11, 0x242c45);
    return { value };
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
    color = 0x1f2940,
  ): Phaser.GameObjects.Container {
    const graphics = this.add.graphics();
    graphics.fillStyle(color, 1);
    graphics.fillCircle(0, 0, radius);
    graphics.lineStyle(1, 0xffffff, 0.12);
    graphics.strokeCircle(0, 0, radius);
    const text = this.add
      .text(0, label === '+' ? -1 : -2, label, { fontFamily: FONT, fontSize: `${Math.max(14, radius)}px`, color: '#dce4f3' })
      .setOrigin(0.5);
    const button = this.add.container(x, y, [graphics, text]).setDepth(3);
    button.setSize(radius * 2, radius * 2).setInteractive({ useHandCursor: true });
    button.on('pointerup', () => {
      if (!this.dragged) onTap();
    });
    return button;
  }

  private setupScroll(): void {
    new KineticScroll(this, {
      viewport: () => new Phaser.Geom.Rectangle(
        0,
        this.viewTop,
        this.scale.width,
        this.scale.height - this.viewTop,
      ),
      getValue: () => this.scrollY,
      getMax: () => this.maxScroll,
      setValue: (value) => this.scrollTo(value),
      enabled: () => !this.running,
      onDragState: (dragged) => {
        this.dragged = dragged;
      },
    });
  }

  private scrollTo(value: number): void {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  private percent(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  private seconds(value: number): string {
    return value < 100 ? `${value.toFixed(1)}秒` : `${Math.round(value)}秒`;
  }

  private close(): void {
    if (this.restoreDebugOverlay) this.scene.wake('DebugOverlay');
    this.scene.stop();
    this.scene.resume('Debug');
  }

  private openOverview(): void {
    if (this.scene.isActive('BalanceOverview')) return;
    this.scene.pause();
    this.scene.launch('BalanceOverview', { runs: this.runs });
  }
}
