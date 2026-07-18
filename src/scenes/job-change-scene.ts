import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getJob, type JobDef } from '@/jobs/job-defs';
import { bus } from '@/core/event-bus';
import { expToNext } from '@/stats/leveling';
import { FONT, pillButton } from '@/ui/theme';
import { KineticScroll } from '@/ui/kinetic-scroll';

type JobStatus = 'current' | 'unlocked' | 'available' | 'locked';

const TIER_COLUMNS = [
  ['fighter', 'mage', 'priest', 'thief', 'pet_raiser'],
  ['samurai', 'sorcerer', 'holy_knight', 'ninja', 'ranger'],
  ['sword_kaiser', 'grand_magia', 'shield_saber', 'avengista', 'dual_star'],
  ['aramikagura', 'alvride', 'nirvadio', 'noxtia', 'oltarie'],
] as const;

const TIER_STYLE = [
  { label: '1次職業', color: 0x68c6e5, roman: '#55c9ed' },
  { label: '2次職業', color: 0xce58e2, roman: '#d155e8' },
  { label: '3次職業', color: 0x647fee, roman: '#6d83f3' },
  { label: '4次職業', color: 0xf27072, roman: '#f47778' },
] as const;

const JOB_ROMAN: Record<string, string> = {
  fighter: 'FIGHTER',
  mage: 'MAGE',
  priest: 'PRIEST',
  thief: 'THIEF',
  pet_raiser: 'PETRISER',
  samurai: 'SAMURAI',
  sorcerer: 'SORCERER',
  holy_knight: 'HOLYKNIGHT',
  ninja: 'NINJA',
  ranger: 'RANGER',
  sword_kaiser: 'SWORDKAISER',
  grand_magia: 'GRANDMAGIA',
  shield_saber: 'SILDSAVIOR',
  avengista: 'AVENGISTA',
  dual_star: 'DUALSTAR',
  aramikagura: 'ARAMIKAGURA',
  alvride: 'ULVLAID',
  nirvadio: 'NIRVADIO',
  noxtia: 'NOXTIA',
  oltarie: 'ALTELIER',
};

const NAVY = 0x19275f;
const CREAM = 0xffedca;
const BOARD = 0xead2ad;
const COL_W = 150;
const COL_GAP = 10;
const COL_STEP = COL_W + COL_GAP;
const BOARD_PAD = 10;

/** Interactive four-column job tree based on the supplied progression board. */
export class JobChangeScene extends Phaser.Scene {
  private treeContent!: Phaser.GameObjects.Container;
  private headerContent!: Phaser.GameObjects.Container;
  private scrollX = 0;
  private maxScroll = 0;
  private dragged = false;
  private selectedJobId = gameState.jobId;
  private viewTop = 108;
  private viewBottom = 0;
  private detailOpen = false;

  constructor() {
    super('JobChange');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewBottom = h - 64;
    this.selectedJobId = gameState.jobId;

    this.add.rectangle(0, 0, w, h, 0xf1ddb9, 1).setOrigin(0).setDepth(0).setInteractive();
    this.add.rectangle(0, this.viewTop, w, this.viewBottom - this.viewTop, BOARD, 1).setOrigin(0).setDepth(0.5);

    this.treeContent = this.add.container(0, 0).setDepth(1);
    this.headerContent = this.add.container(0, 0).setDepth(31);
    this.add.rectangle(0, 0, w, this.viewTop, 0xf1ddb9, 1).setOrigin(0).setDepth(30);
    this.add.rectangle(0, this.viewBottom, w, h - this.viewBottom, 0x17265b, 1).setOrigin(0).setDepth(30);

    pillButton(this, w / 2, h - 32, 'とじる', () => {
      if (!this.dragged && !this.detailOpen) this.close();
    }, { color: '#fff2cb', bg: '#24346f', size: 15 }).setDepth(32);
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.detailOpen) return;
      this.close();
    });

    this.renderHeader();
    this.renderTree();
    this.setupScroll();

    const currentTier = getJob(gameState.jobId)?.tier ?? 1;
    const initial = Phaser.Math.Clamp((currentTier - 1) * COL_STEP - 14, 0, this.maxScroll);
    this.setScrollX(initial);
  }

  private setupScroll(): void {
    new KineticScroll(this, {
      axis: 'x',
      viewport: () => new Phaser.Geom.Rectangle(
        0,
        this.viewTop,
        this.scale.width,
        this.viewBottom - this.viewTop,
      ),
      getValue: () => this.scrollX,
      getMax: () => this.maxScroll,
      setValue: (value) => this.setScrollX(value),
      enabled: () => !this.detailOpen,
      onDragState: (dragged) => {
        this.dragged = dragged;
      },
      indicatorDepth: 29,
    });
  }

  private renderHeader(): void {
    this.headerContent.removeAll(true);
    const w = this.scale.width;
    const job = getJob(this.selectedJobId) ?? getJob(gameState.jobId);
    if (!job) return;

    const panel = this.add.graphics();
    panel.fillStyle(0xf8e7c8, 1);
    panel.fillRoundedRect(8, 7, w - 16, 94, 9);
    panel.lineStyle(2, 0xffffff, 0.55);
    panel.strokeRoundedRect(8, 7, w - 16, 94, 9);
    this.headerContent.add(panel);

    const labelW = 48;
    const actionW = 78;
    const infoX = 14 + labelW;
    const actionX = w - actionW - 14;
    const infoW = actionX - infoX - 6;
    this.headerContent.add([
      this.add.rectangle(14, 15, labelW, 34, 0xb7a5a8, 1).setOrigin(0),
      this.add.rectangle(14, 53, labelW, 40, 0xb7a5a8, 1).setOrigin(0),
      this.add.rectangle(infoX + 3, 15, infoW - 3, 34, 0xffefd2, 1).setOrigin(0),
      this.add.rectangle(infoX + 3, 53, infoW - 3, 40, 0xe7d2b7, 1).setOrigin(0),
      this.add.text(38, 32, '職 業', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#fff7df',
        fontStyle: 'bold',
      }).setOrigin(0.5),
      this.add.text(38, 73, '条 件', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#fff7df',
        fontStyle: 'bold',
      }).setOrigin(0.5),
      this.add.text(infoX + 10, 31, job.name, {
        fontFamily: FONT,
        fontSize: '17px',
        color: '#27315d',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5),
      this.add.text(infoX + 10, 72, this.conditionSummary(job), {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#5d5870',
        wordWrap: { width: infoW - 17 },
        lineSpacing: 2,
      }).setOrigin(0, 0.5),
    ]);

    const button = this.add.graphics();
    button.fillStyle(0x1470d6, 1);
    button.fillRoundedRect(actionX, 18, actionW, 70, 12);
    button.fillStyle(0x5fa5ff, 0.85);
    button.fillRoundedRect(actionX + 4, 22, actionW - 8, 27, { tl: 8, tr: 8, bl: 0, br: 0 });
    button.lineStyle(3, 0xffffff, 0.9);
    button.strokeRoundedRect(actionX, 18, actionW, 70, 12);
    const buttonLabel = this.add.text(actionX + actionW / 2, 53, '詳細をみる', {
      fontFamily: FONT,
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5);
    const hit = this.add.zone(actionX + actionW / 2, 53, actionW, 70)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => this.openDetail(job));
    this.headerContent.add([button, buttonLabel, hit]);
  }

  private renderTree(): void {
    this.treeContent.removeAll(true);
    const rowGap = Phaser.Math.Clamp((this.viewBottom - 252) / 4, 66, 92);
    const cardH = Math.min(74, rowGap - 7);
    const firstRowY = 248;
    const headerY = 198;
    const boardBottom = firstRowY + rowGap * 4 + cardH / 2 + 12;
    const boardHeight = boardBottom - this.viewTop;
    const totalWidth = BOARD_PAD * 2 + COL_W * 4 + COL_GAP * 3;
    this.maxScroll = Math.max(0, totalWidth - this.scale.width);

    const columnBacks = this.add.graphics();
    for (let tierIndex = 0; tierIndex < 4; tierIndex++) {
      const x = BOARD_PAD + tierIndex * COL_STEP;
      columnBacks.fillStyle(tierIndex % 2 === 0 ? 0xf7dfb8 : 0xf1d8b5, 1);
      columnBacks.fillRoundedRect(x, this.viewTop + 5, COL_W, boardHeight - 8, 8);
      columnBacks.lineStyle(2, 0xffffff, 0.42);
      columnBacks.strokeRoundedRect(x, this.viewTop + 5, COL_W, boardHeight - 8, 8);
    }
    this.treeContent.add(columnBacks);

    const positions = new Map<string, { x: number; y: number }>();
    positions.set('adventurer', { x: BOARD_PAD + COL_W / 2, y: 140 });
    TIER_COLUMNS.forEach((ids, tierIndex) => {
      ids.forEach((id, row) => {
        positions.set(id, {
          x: BOARD_PAD + tierIndex * COL_STEP + COL_W / 2,
          y: firstRowY + row * rowGap,
        });
      });
    });

    const links = this.add.graphics();
    links.lineStyle(3, NAVY, 0.78);
    for (const [id, pos] of positions) {
      if (id === 'adventurer') continue;
      const job = getJob(id);
      const parent = job?.parentJobIds[0];
      const from = parent ? positions.get(parent) : undefined;
      if (!from) continue;
      const elbow = from.x + (pos.x - from.x) / 2;
      links.beginPath();
      links.moveTo(from.x + (parent === 'adventurer' ? 0 : 67), from.y);
      links.lineTo(elbow, from.y);
      links.lineTo(elbow, pos.y);
      links.lineTo(pos.x - 67, pos.y);
      links.strokePath();
    }
    this.treeContent.add(links);

    const root = getJob('adventurer');
    if (root) this.treeContent.add(this.jobCard(root, positions.get(root.id)!, 118, 60, 0));

    TIER_COLUMNS.forEach((ids, tierIndex) => {
      const x = BOARD_PAD + tierIndex * COL_STEP;
      const style = TIER_STYLE[tierIndex];
      const header = this.add.graphics();
      header.fillStyle(style.color, 1);
      header.fillRoundedRect(x + 5, headerY - 20, COL_W - 10, 40, 8);
      header.fillStyle(0xffffff, 0.16);
      header.fillRoundedRect(x + 8, headerY - 17, COL_W - 16, 17, { tl: 5, tr: 5, bl: 0, br: 0 });
      this.treeContent.add([
        header,
        this.add.text(x + COL_W / 2, headerY, style.label, {
          fontFamily: FONT,
          fontSize: '16px',
          color: '#fff8e9',
          fontStyle: 'bold',
        }).setOrigin(0.5),
      ]);

      ids.forEach((id) => {
        const job = getJob(id);
        const pos = positions.get(id);
        if (job && pos) this.treeContent.add(this.jobCard(job, pos, 134, cardH, tierIndex + 1));
      });
    });
    this.setScrollX(this.scrollX);
  }

  private jobCard(
    job: JobDef,
    pos: { x: number; y: number },
    width: number,
    height: number,
    tier: number,
  ): Phaser.GameObjects.Container {
    const status = this.status(job);
    const selected = this.selectedJobId === job.id;
    const level = gameState.jobLevelOf(job.id);
    const card = this.add.container(pos.x, pos.y);
    const g = this.add.graphics();
    const half = Math.floor(height * 0.48);
    const alpha = status === 'locked' ? 0.6 : 1;

    g.fillStyle(0x6e6171, 0.24);
    g.fillRoundedRect(-width / 2 + 3, -height / 2 + 4, width, height, 7);
    g.fillStyle(NAVY, alpha);
    g.fillRoundedRect(-width / 2, -height / 2, width, half + 4, { tl: 7, tr: 7, bl: 0, br: 0 });
    g.fillStyle(CREAM, alpha);
    g.fillRoundedRect(-width / 2, -height / 2 + half, width, height - half, { tl: 0, tr: 0, bl: 7, br: 7 });
    g.lineStyle(selected ? 3 : 2, status === 'current' ? 0xf57973 : selected ? 0xffcf55 : NAVY, 1);
    g.strokeRoundedRect(-width / 2, -height / 2, width, height, 7);
    if (status === 'current') {
      g.lineStyle(2, 0xfff1bd, 0.9);
      g.strokeRoundedRect(-width / 2 - 3, -height / 2 - 3, width + 6, height + 6, 9);
    }
    card.add(g);

    if (tier <= 2 && level > 0) {
      const exp = job.id === gameState.jobId ? gameState.exp : gameState.jobExp[job.id] ?? 0;
      const ratio = Phaser.Math.Clamp(exp / Math.max(1, expToNext(level)), 0, 1);
      const accent = tier === 0 ? 0xffcf55 : TIER_STYLE[Math.max(0, tier - 1)].color;
      card.add([
        this.add.rectangle(-width / 2 + 15, -height / 2 + 13, 15, 7, accent, alpha).setOrigin(0.5),
        this.add.text(-width / 2 + 25, -height / 2 + 21, 'EXP', {
          fontFamily: FONT,
          fontSize: '8px',
          color: '#ffd86b',
          fontStyle: 'bold',
        }).setOrigin(0, 0.5),
        this.add.rectangle(-width / 2 + 51, -height / 2 + 21, 43, 3, 0x897a65, alpha).setOrigin(0, 0.5),
        this.add.rectangle(-width / 2 + 51, -height / 2 + 21, 43 * ratio, 3, 0xffe15b, alpha).setOrigin(0, 0.5),
        this.add.text(width / 2 - 7, -height / 2 + 15, `Lv.${level}`, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#f7d57e',
          fontStyle: 'bold',
        }).setOrigin(1, 0.5),
      ]);
    } else {
      card.add(
        this.add.text(0, -height / 2 + half / 2, JOB_ROMAN[job.id] ?? `TIER ${tier}`, {
          fontFamily: FONT,
          fontSize: tier === 4 ? '10px' : '9px',
          color: tier === 0 ? '#ffd86b' : TIER_STYLE[Math.max(0, tier - 1)].roman,
          fontStyle: 'bold',
        }).setOrigin(0.5),
      );
    }

    card.add(
      this.add.text(0, height / 2 - (height - half) / 2 - 1, job.name, {
        fontFamily: FONT,
        fontSize: job.name.length >= 8 ? '12px' : '15px',
        color: status === 'locked' ? '#77727d' : '#1c285a',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
    card.setSize(width, height).setInteractive({ useHandCursor: true });
    card.on('pointerdown', () => card.setScale(0.985));
    card.on('pointerout', () => card.setScale(1));
    card.on('pointerup', () => {
      card.setScale(1);
      if (this.dragged) return;
      this.selectedJobId = job.id;
      this.renderHeader();
      this.renderTree();
      bus.emit('sfx:play', { id: 'ui_tap' });
    });
    return card;
  }

  private status(job: JobDef): JobStatus {
    if (job.id === gameState.jobId) return 'current';
    if (gameState.unlockedJobs.includes(job.id)) return 'unlocked';
    if (gameState.jobChangeBlock(job.id) === null) return 'available';
    return 'locked';
  }

  private conditionSummary(job: JobDef): string {
    if (job.unlockConditions.length === 0) return '最初から選べる職業です。';
    return job.unlockConditions.map((condition) => {
      switch (condition.type) {
        case 'jobLevel':
          return `${getJob(condition.jobId)?.name ?? condition.jobId} Lv.${condition.level}以上`;
        case 'charLevel':
          return `冒険者Lv.${condition.level}以上`;
        case 'skill':
          return '指定スキルを習得';
        case 'flag':
          return '特定条件を達成';
        case 'quest':
          return '極みの試練をクリア';
      }
    }).join(' / ');
  }

  private openDetail(job: JobDef): void {
    if (this.detailOpen) return;
    this.detailOpen = true;
    const w = this.scale.width;
    const h = this.scale.height;
    const modal = this.add.container(0, 0).setDepth(100);
    const dim = this.add.rectangle(0, 0, w, h, 0x10152b, 0.82).setOrigin(0).setInteractive();
    const panel = this.add.graphics();
    panel.fillStyle(0xffedcf, 1);
    panel.fillRoundedRect(16, h / 2 - 188, w - 32, 376, 10);
    panel.lineStyle(3, NAVY, 1);
    panel.strokeRoundedRect(16, h / 2 - 188, w - 32, 376, 10);
    const status = this.status(job);
    const block = gameState.jobChangeBlock(job.id);
    const statusText = status === 'current'
      ? '現在の職業'
      : block === null
        ? '転職できます'
        : status === 'unlocked'
          ? '解放済み'
          : '条件未達成';

    modal.add([
      dim,
      panel,
      this.add.rectangle(22, h / 2 - 181, w - 44, 58, NAVY, 1).setOrigin(0),
      this.add.text(w / 2, h / 2 - 151, job.name, {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#fff2ca',
        fontStyle: 'bold',
      }).setOrigin(0.5),
      this.add.text(34, h / 2 - 103, `${job.tier === 0 ? '初期職' : `${job.tier}次職`}  /  Lv.${gameState.jobLevelOf(job.id)}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#6d5670',
        fontStyle: 'bold',
      }),
      this.add.text(34, h / 2 - 73, job.description, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#27315d',
        wordWrap: { width: w - 68 },
        lineSpacing: 4,
      }),
      this.add.text(34, h / 2 + 5, '転職条件', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#9a695a',
        fontStyle: 'bold',
      }),
      this.add.text(34, h / 2 + 31, this.conditionSummary(job), {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#4f4b61',
        wordWrap: { width: w - 68 },
        lineSpacing: 3,
      }),
      this.add.text(w / 2, h / 2 + 100, statusText, {
        fontFamily: FONT,
        fontSize: '14px',
        color: block === null ? '#2f7d49' : '#8a5960',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    ]);

    const close = pillButton(this, block === null ? w / 2 - 66 : w / 2, h / 2 + 151, 'もどる', () => {
      modal.destroy(true);
      this.detailOpen = false;
    }, { color: '#fff2cb', bg: '#35416f', size: 14 }).setDepth(101);
    modal.add(close);

    if (block === null) {
      const change = pillButton(this, w / 2 + 66, h / 2 + 151, '転職する', () => {
        if (!gameState.changeJob(job.id)) return;
        bus.emit('sfx:play', { id: 'level_up' });
        modal.destroy(true);
        this.detailOpen = false;
        this.selectedJobId = job.id;
        this.renderHeader();
        this.renderTree();
      }, { color: '#fff4ca', bg: '#1f70b9', size: 14 }).setDepth(101);
      modal.add(change);
    }
  }

  private setScrollX(value: number): void {
    this.scrollX = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.treeContent.x = -this.scrollX;
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
