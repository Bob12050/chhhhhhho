import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getEquipment, itemDisplayName } from '@/data/items';
import { rarityColorHex, rarityLabel } from '@/data/rarity';
import { getEnemyDef } from '@/enemies/enemy-defs';
import { getQuest, allQuests, type QuestDef } from '@/quests/quest-defs';
import {
  availableQuests,
  acceptQuest,
  isComplete,
  turnInQuest,
  objectiveProgress,
} from '@/quests/quests';
import { getMap, spawnPoint } from '@/maps/map-def';
import { getJob } from '@/jobs/job-defs';
import { bus } from '@/core/event-bus';
import { FONT, UI, addPanelChrome, tabChip, pillButton, ninePanel, type TabHandle } from '@/ui/theme';
import { INVESTIGATION_SEAL_ID } from '@/endgame/investigations';
import { affixSummary } from '@/endgame/investigation-loot';
import { getInvestigationCondition } from '@/endgame/investigation-conditions';
import { KineticScroll } from '@/ui/kinetic-scroll';

type BoardTab = 'main' | 'job' | 'investigation';
type QuestViewState = 'active' | 'available' | 'done' | 'locked';

/**
 * Quest Board overlay (opened by the town board NPC). Lists active quests (with
 * kill progress and a turn-in button when complete), then acceptable quests,
 * then completed ones. The world is paused while open.
 */
export class QuestBoardScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 92;
  private viewBottom = 0;
  private tab: BoardTab = 'main';
  private tabButtons: { id: BoardTab; tab: TabHandle }[] = [];
  /** In メインクエスト: null = overview, otherwise the selected ★rank. */
  private selectedRank: number | null = null;

  constructor() {
    super('QuestBoard');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    ninePanel(this, 112, 24, 208, 40).setDepth(2.5);
    this.add
      .text(22, 24, 'クエストボード', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setDepth(3);

    // Standard quests share the ★1〜★7 main list. Job trials stay separate.
    this.tabButtons = [];
    const tabs: { id: BoardTab; label: string }[] = [
      { id: 'main', label: 'メインクエスト' },
      { id: 'job', label: '職業専用' },
    ];
    if (gameState.flags['main_story_complete']) tabs.push({ id: 'investigation', label: '調査' });
    this.tab = 'main';
    const tabW = (w - 12) / tabs.length;
    tabs.forEach((t, i) => {
      const tab = tabChip(this, 6 + tabW * (i + 0.5), 68, tabW, t.label, () => {
        if (this.dragged) return;
        this.tab = t.id;
        this.selectedRank = null;
        this.scrollY = 0;
        this.render();
      });
      tab.root.setDepth(3);
      this.tabButtons.push({ id: t.id, tab });
    });

    this.content = this.add.container(0, 0).setDepth(1);
    this.viewBottom = h - 72;
    // Opaque header/footer bars (depth 2) hide the scrolling list (depth 1).
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
  }

  private scrollTo(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  /** Main owns story + all ★ranked standard quests; exact-job trials are separate. */
  private inTab(q: QuestDef): boolean {
    if (this.tab === 'investigation') return !!q.investigation;
    if (q.investigation) return false;
    if (this.tab === 'job') return q.require?.jobId === gameState.jobId;
    return !q.require?.jobId;
  }

  private byRank = (a: QuestDef, b: QuestDef): number =>
    (a.rank ?? 1) - (b.rank ?? 1) || a.name.localeCompare(b.name);

  /** Star color per rank (★1 pale → ★7 red), MH-style escalation. */
  private static readonly RANK_COLORS = [
    '#c9d0e0', '#9fe3a0', '#7fb0ff', '#c89bff', '#ffcf5a', '#ff8a5a', '#ff5a7a',
  ];
  private static readonly RANK_NAMES = [
    '旅立ち', '駆け出し', '熟練', '上位', '達人', '英雄', '神域',
  ];
  private rankColor(rank: number): string {
    return QuestBoardScene.RANK_COLORS[Phaser.Math.Clamp(rank, 1, 7) - 1];
  }

  private rankColorNumber(rank: number): number {
    return Phaser.Display.Color.HexStringToColor(this.rankColor(rank)).color;
  }

  private rankName(rank: number): string {
    return QuestBoardScene.RANK_NAMES[Phaser.Math.Clamp(rank, 1, 7) - 1];
  }

  private render(): void {
    this.content.removeAll(true);
    const w = this.scale.width;
    for (const tb of this.tabButtons) tb.tab.setActive(tb.id === this.tab);

    let y = this.viewTop + 8;
    if (this.tab === 'investigation') y = this.renderInvestigationStatus(y, w);
    if (this.tab === 'main' && this.selectedRank === null) {
      y = this.renderStorySection(y, w);
      y = this.renderRankList(y, w);
    } else if (this.tab === 'job') {
      y = this.renderJobQuestList(y, w);
    } else {
      y = this.renderQuestList(y, w);
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  private renderInvestigationStatus(y: number, w: number): number {
    const strip = this.add.graphics();
    strip.fillStyle(0x111d2d, 0.98);
    strip.fillRoundedRect(10, y, w - 20, 42, 5);
    strip.fillStyle(0x72d8dc, 0.78);
    strip.fillRect(10, y + 7, 3, 28);
    strip.lineStyle(1, 0xffffff, 0.08);
    strip.strokeRoundedRect(10, y, w - 20, 42, 5);
    this.content.add(strip);
    this.content.add(
      this.add.text(22, y + 7, '深層調査', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#bdeff0',
        fontStyle: 'bold',
      }),
    );
    this.content.add(
      this.add.text(22, y + 24, `完遂 ${gameState.investigationsCompleted}`, {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#aab8c8',
      }),
    );
    this.content.add(
      this.add
        .text(w - 22, y + 16, `調査の証 ${gameState.materials[INVESTIGATION_SEAL_ID] ?? 0}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#ffb8c2',
        })
        .setOrigin(1, 0),
    );
    return y + 52;
  }

  private renderStorySection(y: number, w: number): number {
    const stories = allQuests().filter((q) => q.type === 'main');
    const activeIds = new Set(gameState.activeQuests);
    const availableIds = new Set(availableQuests(gameState).map((q) => q.id));
    const completedIds = new Set(gameState.completedQuests);
    const active = stories.filter((q) => activeIds.has(q.id));
    const available = stories.filter((q) => availableIds.has(q.id));
    const current = [...active, ...available];
    const completed = stories.filter((q) => completedIds.has(q.id)).length;

    y = this.heading(`物語  ${completed}/${stories.length}章`, y, w);
    if (current.length) {
      for (const q of current) {
        y = this.renderQuest(q, y, w, activeIds.has(q.id) ? 'active' : 'available');
      }
      return y + 4;
    }

    const next = stories.find((q) => !completedIds.has(q.id));
    const strip = this.add.graphics();
    strip.fillStyle(0x151b2a, 0.96);
    strip.fillRoundedRect(12, y, w - 24, 46, 5);
    strip.lineStyle(1, 0xffffff, 0.08);
    strip.strokeRoundedRect(12, y, w - 24, 46, 5);
    this.content.add(strip);
    if (!next) {
      this.content.add(
        this.add.text(22, y + 14, '全章クリア', {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#ffd86b',
          fontStyle: 'bold',
        }),
      );
    } else {
      const activeHunt = gameState.activeQuests
        .map((id) => getQuest(id))
        .find((q): q is QuestDef => !!q?.huntMap);
      const requirement = activeHunt
        ? `「${activeHunt.name}」進行中`
        : next.require?.minLevel != null && gameState.level < next.require.minLevel
          ? `Lv${next.require.minLevel}で解放`
          : '前章クリアで解放';
      this.content.add(
        this.add.text(22, y + 7, next.name, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#d7dbea',
        }),
      );
      this.content.add(
        this.add.text(22, y + 26, requirement, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#9aa0b5',
        }),
      );
    }
    return y + 58;
  }

  /** ★1〜★7 selector for every standard quest formerly split across two tabs. */
  private renderRankList(y: number, w: number): number {
    const ranked = allQuests().filter((q) => this.inTab(q) && q.type !== 'main');
    const availSet = new Set(availableQuests(gameState).map((q) => q.id));
    const activeSet = new Set(gameState.activeQuests);
    const doneSet = new Set(gameState.completedQuests);
    for (let r = 1; r <= 7; r++) {
      const inRank = ranked.filter((q) => (q.rank ?? 1) === r);
      const availCount = inRank.filter((q) => availSet.has(q.id)).length;
      const activeCount = inRank.filter((q) => activeSet.has(q.id)).length;
      const doneCount = inRank.filter((q) => doneSet.has(q.id)).length;
      const color = this.rankColorNumber(r);
      const rowH = 66;
      const row = this.add
        .rectangle(w / 2, y, w - 24, rowH, 0x141b2b, 0.98)
        .setOrigin(0.5, 0)
        .setStrokeStyle(1, color, 0.48);
      this.content.add(row);
      const accent = this.add.graphics();
      accent.fillStyle(color, activeCount > 0 ? 0.95 : 0.72);
      accent.fillRect(12, y + 8, 3, rowH - 16);
      this.content.add(accent);
      this.renderRankCrest(43, y + rowH / 2, r, 19);
      this.content.add(
        this.add.text(74, y + 9, `${this.rankName(r)}クエスト`, {
          fontFamily: FONT,
          fontSize: '14px',
          color: '#f1f4fb',
          fontStyle: 'bold',
        }),
      );
      this.content.add(
        this.add.text(74, y + 29, `達成 ${doneCount}/${inRank.length}`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#aab5c8',
        }),
      );
      const progressW = 132;
      const progress = inRank.length > 0 ? Phaser.Math.Clamp(doneCount / inRank.length, 0, 1) : 0;
      this.content.add(this.add.rectangle(74, y + 51, progressW, 4, 0x293247, 1).setOrigin(0, 0.5));
      if (progress > 0) {
        this.content.add(
          this.add.rectangle(74, y + 51, progressW * progress, 4, color, 0.9).setOrigin(0, 0.5),
        );
      }
      const statusLabel = activeCount > 0
        ? '進行中'
        : availCount > 0
          ? `受注 ${availCount}`
          : doneCount >= inRank.length && inRank.length > 0
            ? '制覇'
            : '未解放';
      const statusColor = activeCount > 0 ? 0xffd86b : availCount > 0 ? 0x9fe3a0 : color;
      this.renderRankStatus(w - 62, y + 25, statusLabel, statusColor);
      this.content.add(
        this.add.text(w - 20, y + 49, '›', {
          fontFamily: FONT,
          fontSize: '19px',
          color: '#dbe7f8',
        }).setOrigin(1, 0.5),
      );
      row.setInteractive({ useHandCursor: true });
      row.on('pointerup', () => {
        if (this.dragged) return;
        this.selectedRank = r;
        this.scrollY = 0;
        this.render();
      });
      y += rowH + 7;
    }
    return y;
  }

  private renderRankCrest(x: number, y: number, rank: number, radius: number): void {
    const color = this.rankColorNumber(rank);
    const crest = this.add.graphics();
    crest.fillStyle(0x0a1120, 0.98);
    crest.fillCircle(x, y, radius);
    crest.lineStyle(2, color, 0.92);
    crest.strokeCircle(x, y, radius);
    crest.lineStyle(1, 0xe9f1ff, 0.18);
    crest.strokeCircle(x, y, radius - 4);
    crest.fillStyle(color, 0.9);
    crest.fillRect(x - 2, y - radius - 3, 4, 3);
    crest.fillRect(x - 2, y + radius, 4, 3);
    this.content.add(crest);
    this.content.add(
      this.add.text(x, y - 7, '★', {
        fontFamily: FONT,
        fontSize: '9px',
        color: this.rankColor(rank),
      }).setOrigin(0.5),
    );
    this.content.add(
      this.add.text(x, y + 7, String(rank), {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
  }

  private renderRankStatus(x: number, y: number, label: string, color: number): void {
    const width = Math.max(54, label.length * 11 + 14);
    this.content.add(
      this.add.rectangle(x, y, width, 24, 0x0d1422, 0.96)
        .setStrokeStyle(1, color, 0.58),
    );
    this.content.add(
      this.add.text(x, y, label, {
        fontFamily: FONT,
        fontSize: '11px',
        color: Phaser.Display.Color.IntegerToColor(color).rgba,
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );
  }

  private renderJobQuestList(y: number, w: number): number {
    const job = getJob(gameState.jobId);
    const quest = allQuests().find((q) => q.require?.jobId === gameState.jobId);
    const strip = this.add.graphics();
    strip.fillStyle(0x111d2d, 0.98);
    strip.fillRoundedRect(10, y, w - 20, 48, 5);
    strip.fillStyle(0xffd86b, 0.82);
    strip.fillRect(10, y + 8, 3, 32);
    strip.lineStyle(1, 0xffffff, 0.08);
    strip.strokeRoundedRect(10, y, w - 20, 48, 5);
    this.content.add(strip);
    this.content.add(
      this.add.text(22, y + 7, `現在職  ${job?.name ?? gameState.jobId}`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffe9a8',
        fontStyle: 'bold',
      }),
    );
    this.content.add(
      this.add.text(22, y + 27, quest ? `職装試練  ★${quest.rank ?? 1}  頭・胴・武器` : '専用試練なし', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#aab8c8',
      }),
    );
    y += 60;

    if (!quest) {
      this.content.add(
        this.add.text(16, y, 'この職業には専用クエストがありません。', {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#9aa0b4',
        }),
      );
      return y + 30;
    }

    const active = gameState.activeQuests.includes(quest.id);
    const done = gameState.completedQuests.includes(quest.id);
    const available = availableQuests(gameState).some((q) => q.id === quest.id);
    const state: QuestViewState = active ? 'active' : done ? 'done' : available ? 'available' : 'locked';
    y = this.heading(state === 'done' ? '獲得済み' : state === 'locked' ? '解放条件' : state === 'active' ? '進行中' : '受注できる', y, w);
    return this.renderQuest(quest, y, w, state, this.jobQuestLockReason(quest));
  }

  private jobQuestLockReason(q: QuestDef): string {
    if (q.require?.minLevel != null && gameState.level < q.require.minLevel) {
      return `Lv${q.require.minLevel}で解放`;
    }
    const activeHunt = gameState.activeQuests
      .map((id) => getQuest(id))
      .find((quest): quest is QuestDef => !!quest?.huntMap);
    if (activeHunt) return 'ほかの狩猟が進行中';
    return '条件未達成';
  }

  /** Quest list for a selected main rank or the post-story investigation board. */
  private renderQuestList(y: number, w: number): number {
    if (this.tab === 'main' && this.selectedRank !== null) {
      const back = this.add
        .text(16, y, '← ランク一覧へ戻る', { fontFamily: FONT, fontSize: '13px', color: '#9fd0ff' })
        .setInteractive({ useHandCursor: true });
      back.on('pointerup', () => {
        if (this.dragged) return;
        this.selectedRank = null;
        this.scrollY = 0;
        this.render();
      });
      this.content.add(back);
      y += 25;
      const selected = this.selectedRank;
      const rankQuests = allQuests().filter(
        (q) => this.inTab(q) && q.type !== 'main' && (q.rank ?? 1) === selected,
      );
      const done = rankQuests.filter((q) => gameState.completedQuests.includes(q.id)).length;
      const banner = this.add.graphics();
      const color = this.rankColorNumber(selected);
      banner.fillStyle(0x111a2b, 0.98);
      banner.fillRoundedRect(12, y, w - 24, 58, 5);
      banner.lineStyle(1, color, 0.58);
      banner.strokeRoundedRect(12, y, w - 24, 58, 5);
      this.content.add(banner);
      this.renderRankCrest(43, y + 29, selected, 19);
      this.content.add(
        this.add.text(74, y + 10, `${this.rankName(selected)}クエスト`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#ffffff',
          fontStyle: 'bold',
        }),
      );
      this.content.add(
        this.add.text(74, y + 33, `達成 ${done}/${rankQuests.length}`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#aab5c8',
        }),
      );
      y += 66;
    }

    const inScope = (q: QuestDef): boolean => {
      if (!this.inTab(q)) return false;
      if (this.tab === 'main') {
        if (q.type === 'main' || this.selectedRank === null) return false;
        return (q.rank ?? 1) === this.selectedRank;
      }
      return true;
    };
    const active = (gameState.activeQuests.map((id) => getQuest(id)).filter(Boolean) as QuestDef[])
      .filter(inScope)
      .sort(this.byRank);
    const avail = availableQuests(gameState).filter(inScope).sort(this.byRank);
    // Repeatable quests are recorded as completed AND re-offered; show them
    // only under 受注できる so the board doesn't list them twice.
    const shown = new Set([...active, ...avail].map((q) => q.id));
    const done = (gameState.completedQuests.map((id) => getQuest(id)).filter(Boolean) as QuestDef[])
      .filter((q) => inScope(q) && !shown.has(q.id))
      .sort(this.byRank);

    if (active.length) {
      y = this.heading('進行中', y, w);
      for (const q of active) y = this.renderQuest(q, y, w, 'active');
    }
    if (avail.length) {
      y = this.heading('受注できる', y, w);
      for (const q of avail) y = this.renderQuest(q, y, w, 'available');
    }
    if (done.length) {
      y = this.heading('達成済み', y, w);
      for (const q of done) y = this.renderQuest(q, y, w, 'done');
    }
    if (!active.length && !avail.length && !done.length) {
      const msg = this.tab === 'main' ? 'このランクのクエストはまだありません。' : '今は受けられるクエストがありません。';
      this.content.add(
        this.add.text(16, y, msg, { fontFamily: FONT, fontSize: '13px', color: '#9aa0b4' }),
      );
      y += 28;
    }
    return y;
  }

  private heading(text: string, y: number, w: number): number {
    this.content.add(
      this.add.text(16, y, text, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#8fa0ff',
        fontStyle: 'bold',
      }),
    );
    this.content.add(this.add.rectangle(w / 2, y + 18, w - 32, 1, UI.divider).setOrigin(0.5));
    return y + 26;
  }

  private rewardText(q: QuestDef): string {
    const r = q.rewards;
    if (q.investigation) {
      const seals = r.items?.[INVESTIGATION_SEAL_ID] ?? 0;
      return `報酬: R${q.investigation.rewardRank}ランダム装備×1 / 調査の証×${seals} / ${r.gold ?? 0}G`;
    }
    const parts: string[] = [];
    const itemEntries = Object.entries(r.items ?? {});
    if (q.require?.jobId && itemEntries.length === 3) parts.push('専用装備3点セット');
    if (r.gold) parts.push(`${r.gold}G`);
    if (r.exp) parts.push(`EXP ${r.exp}`);
    if (!(q.require?.jobId && itemEntries.length === 3)) {
      for (const [id, qty] of itemEntries) parts.push(`${itemDisplayName(id)}×${qty}`);
    }
    if (r.setFlags?.includes('main_story_complete')) parts.push('★エンディング');
    else if (r.setFlags?.length) parts.push('★職業解放');
    return parts.length ? `報酬: ${parts.join(' / ')}` : '';
  }

  private objectiveText(q: QuestDef, withProgress: boolean): string {
    return q.objectives
      .map((o) => {
        const name = getEnemyDef(o.enemyId)?.name ?? o.enemyId;
        return withProgress
          ? `${name} ${objectiveProgress(gameState, q.id, o.enemyId)}/${o.count}`
          : `${name} ×${o.count}`;
      })
      .join('  ');
  }

  private renderQuest(
    q: QuestDef,
    y: number,
    w: number,
    state: QuestViewState,
    lockedReason = '',
  ): number {
    const investigationCondition = q.investigation
      ? getInvestigationCondition(q.investigation.conditionId)
      : undefined;
    const titleColor = state === 'done' ? '#6b7088' : q.type === 'unlock' ? '#ffe9a8' : '#ffffff';
    // MH-style star rank prefix, colored by rank (dimmed once done).
    const rank = q.rank ?? 1;
    // Story chapters carry a book mark instead of a meaningless ★1.
    const marker = q.investigation
      ? `◆${q.investigation.threat}`
      : q.type === 'main'
        ? '📖'
        : '◆';
    const starTxt = this.add.text(16, y, marker, {
      fontFamily: FONT,
      fontSize: '15px',
      color: state === 'done' ? '#6b7088' : q.investigation ? '#72d8dc' : this.rankColor(rank),
    });
    this.content.add(starTxt);
    const nameTxt = this.add.text(16 + starTxt.width + 6, y, q.name, {
      fontFamily: FONT,
      fontSize: '15px',
      color: titleColor,
    });
    const statusSpace = state === 'available'
      ? 116
      : state === 'locked'
        ? 132
        : state === 'active'
          ? 74
          : 34;
    const maxTitleWidth = Math.max(100, w - nameTxt.x - statusSpace);
    for (let size = 14; nameTxt.width > maxTitleWidth && size >= 11; size--) {
      nameTxt.setFontSize(size);
    }
    this.content.add(nameTxt);
    if (q.veteran) {
      // 歴戦 badge: stronger target, better rewards — worth calling out.
      this.content.add(
        this.add.text(16 + starTxt.width + 6 + nameTxt.width + 6, y + 2, '歴戦', {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#ffb0c0',
          backgroundColor: '#5a2233',
          padding: { x: 5, y: 2 },
        }),
      );
    }
    this.content.add(
      this.add.text(
        16,
        y + 20,
        q.investigation
          ? `${investigationCondition?.boardHint ?? q.investigation.condition}・Lv${q.require?.minLevel ?? 94}`
          : this.objectiveText(q, state === 'active'),
        {
        fontFamily: FONT,
        fontSize: '11px',
        color: state === 'done' ? '#6b7088' : q.investigation ? '#a8cbd0' : '#cfe0a0',
        },
      ),
    );
    const rt = this.rewardText(q);
    if (rt) {
      this.content.add(
        this.add.text(16, y + 36, rt, {
          fontFamily: FONT,
          fontSize: '10px',
          color: state === 'done' ? '#5a607a' : '#bda9e0',
        }),
      );
    }

    if (state === 'available') {
      // Hunt quests "depart" to their arena on accept (MH style); others just
      // join the active list and are tracked wherever you fight.
      const label = q.investigation ? '[ 調査開始 ]' : q.huntMap ? '[ 受けて出発 ]' : '[ 受ける ]';
      this.actionButton(w - 16, y + 10, label, '#9fe3a0', () => {
        if (this.dragged) return;
        if (acceptQuest(gameState, q.id) && q.huntMap) this.departTo(q.huntMap);
        else this.render();
      });
    } else if (state === 'active') {
      if (isComplete(gameState, q.id)) {
        this.actionButton(w - 16, y + 10, '[ 報酬を受取る ]', '#ffd86b', () => {
          if (this.dragged) return;
          if (turnInQuest(gameState, q.id)) this.showResult(q);
          else this.render();
        });
      } else {
        this.content.add(
          this.add
            .text(w - 16, y + 10, '進行中', {
              fontFamily: FONT,
              fontSize: '12px',
              color: '#9aa0b4',
            })
            .setOrigin(1, 0),
        );
      }
    } else if (state === 'done') {
      this.content.add(
        this.add
          .text(w - 16, y + 10, '済', {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#6b7088',
          })
          .setOrigin(1, 0),
      );
    } else {
      this.content.add(
        this.add
          .text(w - 16, y + 10, lockedReason, {
            fontFamily: FONT,
            fontSize: '11px',
            color: '#ffcf79',
          })
          .setOrigin(1, 0),
      );
    }

    this.content.add(this.add.rectangle(w / 2, y + 58, w - 32, 1, 0x262c44).setOrigin(0.5));
    return y + 66;
  }

  private actionButton(x: number, y: number, label: string, color: string, fn: () => void): void {
    const btn = this.add
      .text(x, y, label.replace(/^\[ | \]$/g, ''), {
        fontFamily: FONT,
        fontSize: '13px',
        color,
        backgroundColor: '#2a3050',
        padding: { x: 9, y: 5 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerup', fn);
    this.content.add(btn);
  }

  /**
   * Reward ceremony after turn-in: rewards pop in one by one over a dimmed
   * panel (MH-style result). Tap to dismiss, then the list re-renders.
   */
  private showResult(q: QuestDef): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const rows: { label: string; color: string; size?: string }[] = [];
    if (q.rewards.exp) rows.push({ label: `EXP +${q.rewards.exp}`, color: '#9fe3a0' });
    if (q.rewards.gold) {
      // Show what was actually granted: turn-in applies the 金運 bonus.
      const granted = Math.round(q.rewards.gold * (1 + gameState.derived.goldRate));
      rows.push({ label: `ゴールド +${granted}`, color: '#ffd86b' });
    }
    for (const [id, qty] of Object.entries(q.rewards.items ?? {})) {
      rows.push({ label: `${itemDisplayName(id)} ×${qty}`, color: '#cfd3e6' });
    }
    const loot = q.investigation && gameState.lastInvestigationLootId
      ? getEquipment(gameState.lastInvestigationLootId)
      : undefined;
    if (loot) {
      rows.push({
        label: `NEW  ${loot.name}  ${rarityLabel(loot.rarity)}`,
        color: rarityColorHex(loot.rarity),
        size: '13px',
      });
      rows.push({
        label: `追加能力  ${affixSummary(loot, 3)}`,
        color: '#9af7ff',
        size: '12px',
      });
    }
    const panelH = 150 + rows.length * 30;
    const cy = Math.round(h * 0.42);
    const c = this.add.container(0, 0).setDepth(60);
    const dim = this.add.rectangle(0, 0, w, h, 0x000000, 0.62).setOrigin(0).setInteractive();
    const panel = this.add
      .rectangle(w / 2, cy, w - 44, panelH, UI.panel, 1)
      .setStrokeStyle(2, 0xffd86b, 0.85);
    const title = this.add
      .text(w / 2, cy - panelH / 2 + 26, q.investigation ? '調査完了！' : 'クエストクリア！', {
        fontFamily: FONT,
        fontSize: '20px',
        color: '#ffd86b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const name = this.add
      .text(w / 2, cy - panelH / 2 + 50, `「${q.name}」`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    c.add([dim, panel, title, name]);
    bus.emit('sfx:play', { id: 'fanfare' });

    rows.forEach((r, i) => {
      this.time.delayedCall(420 + i * 240, () => {
        const t = this.add
          .text(w / 2, cy - panelH / 2 + 84 + i * 30, r.label, {
            fontFamily: FONT,
            fontSize: r.size ?? '15px',
            color: r.color,
          })
          .setOrigin(0.5)
          .setScale(1.6)
          .setAlpha(0);
        c.add(t);
        this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 170, ease: 'Back.easeOut' });
        bus.emit('sfx:play', { id: 'pickup' });
      });
    });

    const hint = this.add
      .text(w / 2, cy + panelH / 2 - 22, '- タップで閉じる -', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#9aa0b5',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    c.add(hint);
    this.time.delayedCall(420 + rows.length * 240 + 150, () => hint.setAlpha(1));
    dim.on('pointerup', () => {
      c.destroy(true);
      // Finishing the story: roll the ending instead of returning to the list.
      if (q.rewards.setFlags?.includes('main_story_complete')) {
        this.scene.stop();
        this.scene.launch('Ending');
        return;
      }
      this.render();
    });
  }

  /** Warp to a hunt arena (mirrors fast-travel) and close the board. */
  private departTo(mapId: string): void {
    const target = getMap(mapId);
    if (!target) {
      this.render();
      return;
    }
    const sp = spawnPoint(target, 'default');
    gameState.mapId = mapId;
    gameState.x = sp.x;
    gameState.y = sp.y;
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('map:travel', {});
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
