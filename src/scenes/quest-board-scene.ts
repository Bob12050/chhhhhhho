import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { itemDisplayName } from '@/data/items';
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
import { bus } from '@/core/event-bus';
import { FONT, UI, addPanelChrome } from '@/ui/theme';

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
  private tab: 'normal' | 'hunt' = 'normal';
  private tabButtons: { id: 'normal' | 'hunt'; text: Phaser.GameObjects.Text }[] = [];
  /** In the 大型狩猟 tab: null = show the ★rank list, else the picked rank's quests. */
  private selectedRank: number | null = null;

  constructor() {
    super('QuestBoard');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add
      .text(16, 24, 'クエストボード', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fff',
      })
      .setDepth(3);

    // Category tabs: 通常クエスト / 大型狩猟 (MH style).
    this.tabButtons = [];
    const tabs: { id: 'normal' | 'hunt'; label: string }[] = [
      { id: 'normal', label: '通常クエスト' },
      { id: 'hunt', label: '大型狩猟' },
    ];
    tabs.forEach((t, i) => {
      const tb = this.add
        .text(16 + i * 130, 56, t.label, {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#fff',
          backgroundColor: UI.tabIdleBg,
          padding: { x: 12, y: 8 },
        })
        .setDepth(3)
        .setInteractive({ useHandCursor: true });
      tb.on('pointerup', () => {
        if (this.dragged) return;
        this.tab = t.id;
        this.selectedRank = null;
        this.scrollY = 0;
        this.render();
      });
      this.tabButtons.push({ id: t.id, text: tb });
    });

    this.content = this.add.container(0, 0).setDepth(1);
    this.viewBottom = h - 72;
    // Opaque header/footer bars (depth 2) hide the scrolling list (depth 1).
    addPanelChrome(this, this.viewTop, this.viewBottom);
    this.setupScroll();

    const close = this.add
      .text(w / 2, h - 40, '[ とじる ]', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffd86b',
      })
      .setOrigin(0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render();
  }

  private setupScroll(): void {
    let startPointerY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startPointerY = p.y;
      startScroll = this.scrollY;
      this.dragged = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const d = startPointerY - p.y;
      if (Math.abs(d) > 6) this.dragged = true;
      this.scrollTo(startScroll + d);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.scrollTo(this.scrollY + dy * 0.5);
    });
  }

  private scrollTo(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  /** A quest belongs to the 大型狩猟 tab if it spawns a boss in an arena. */
  private inTab(q: QuestDef): boolean {
    const isHunt = !!q.huntMap;
    return this.tab === 'hunt' ? isHunt : !isHunt;
  }

  private byRank = (a: QuestDef, b: QuestDef): number =>
    (a.rank ?? 1) - (b.rank ?? 1) || a.name.localeCompare(b.name);

  private render(): void {
    this.content.removeAll(true);
    const w = this.scale.width;
    for (const tb of this.tabButtons)
      tb.text.setBackgroundColor(tb.id === this.tab ? UI.tabActiveBg : UI.tabIdleBg);

    let y = this.viewTop + 8;
    // 大型狩猟 tab, no rank picked yet: show the ★rank menu (drill-down).
    if (this.tab === 'hunt' && this.selectedRank === null) {
      y = this.renderRankList(y, w);
    } else {
      y = this.renderQuestList(y, w);
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  /** ★1〜★7 selector rows for the 大型狩猟 tab. Tapping a rank drills in. */
  private renderRankList(y: number, w: number): number {
    const hunts = allQuests().filter((q) => !!q.huntMap);
    const availSet = new Set(availableQuests(gameState).map((q) => q.id));
    const ranks = [...new Set(hunts.map((q) => q.rank ?? 1))].sort((a, b) => a - b);
    for (const r of ranks) {
      const inRank = hunts.filter((q) => (q.rank ?? 1) === r);
      const availCount = inRank.filter((q) => availSet.has(q.id)).length;
      const row = this.add
        .rectangle(w / 2, y + 22, w - 24, 48, 0x20233a, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(1, 0x39406a);
      this.content.add(row);
      this.content.add(
        this.add.text(24, y + 12, '★'.repeat(r), { fontFamily: FONT, fontSize: '18px', color: '#ffcf5a' }),
      );
      this.content.add(
        this.add.text(24, y + 38, `受注できる ${availCount} / 全${inRank.length}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: availCount > 0 ? '#9fe3a0' : '#9aa0b5',
        }),
      );
      this.content.add(
        this.add.text(w - 28, y + 22, '[ 見る ]', { fontFamily: FONT, fontSize: '14px', color: '#9fd0ff' }).setOrigin(1, 0.5),
      );
      row.setInteractive({ useHandCursor: true });
      row.on('pointerup', () => {
        if (this.dragged) return;
        this.selectedRank = r;
        this.scrollY = 0;
        this.render();
      });
      y += 60;
    }
    return y;
  }

  /** Flat quest list for the 通常 tab, or a single ★rank inside the 大型狩猟 tab. */
  private renderQuestList(y: number, w: number): number {
    if (this.tab === 'hunt' && this.selectedRank !== null) {
      const back = this.add
        .text(16, y, `← ★${this.selectedRank} 一覧へ戻る`, { fontFamily: FONT, fontSize: '13px', color: '#9fd0ff' })
        .setInteractive({ useHandCursor: true });
      back.on('pointerup', () => {
        if (this.dragged) return;
        this.selectedRank = null;
        this.scrollY = 0;
        this.render();
      });
      this.content.add(back);
      y += 30;
    }

    const inScope = (q: QuestDef): boolean => {
      if (!this.inTab(q)) return false;
      if (this.tab === 'hunt' && this.selectedRank !== null) return (q.rank ?? 1) === this.selectedRank;
      return true;
    };
    const active = (gameState.activeQuests.map((id) => getQuest(id)).filter(Boolean) as QuestDef[])
      .filter(inScope)
      .sort(this.byRank);
    const avail = availableQuests(gameState).filter(inScope).sort(this.byRank);
    const done = (gameState.completedQuests.map((id) => getQuest(id)).filter(Boolean) as QuestDef[])
      .filter(inScope)
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
      const msg = this.tab === 'hunt' ? 'このランクの狩猟はまだありません。' : '今は受けられるクエストがありません。';
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
    const parts: string[] = [];
    if (r.gold) parts.push(`${r.gold}G`);
    if (r.exp) parts.push(`EXP ${r.exp}`);
    for (const [id, qty] of Object.entries(r.items ?? {})) parts.push(`${itemDisplayName(id)}×${qty}`);
    if (r.setFlags?.length) parts.push('★職業解放');
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

  private renderQuest(q: QuestDef, y: number, w: number, state: 'active' | 'available' | 'done'): number {
    const titleColor = state === 'done' ? '#6b7088' : q.type === 'unlock' ? '#ffe9a8' : '#ffffff';
    // MH-style star rank prefix (☆ for done keeps it subtle).
    const stars = `★${q.rank ?? 1} `;
    this.content.add(
      this.add.text(16, y, stars + q.name, {
        fontFamily: FONT,
        fontSize: '15px',
        color: titleColor,
      }),
    );
    this.content.add(
      this.add.text(16, y + 20, this.objectiveText(q, state === 'active'), {
        fontFamily: FONT,
        fontSize: '11px',
        color: state === 'done' ? '#6b7088' : '#cfe0a0',
      }),
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
      const label = q.huntMap ? '[ 受けて出発 ]' : '[ 受ける ]';
      this.actionButton(w - 16, y + 10, label, '#9fe3a0', () => {
        if (this.dragged) return;
        if (acceptQuest(gameState, q.id) && q.huntMap) this.departTo(q.huntMap);
        else this.render();
      });
    } else if (state === 'active') {
      if (isComplete(gameState, q.id)) {
        this.actionButton(w - 16, y + 10, '[ 報酬を受取る ]', '#ffd86b', () => {
          if (this.dragged) return;
          if (turnInQuest(gameState, q.id)) this.flash(`「${q.name}」達成！`);
          this.render();
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
    } else {
      this.content.add(
        this.add
          .text(w - 16, y + 10, '済', {
            fontFamily: FONT,
            fontSize: '12px',
            color: '#6b7088',
          })
          .setOrigin(1, 0),
      );
    }

    this.content.add(this.add.rectangle(w / 2, y + 58, w - 32, 1, 0x262c44).setOrigin(0.5));
    return y + 66;
  }

  private actionButton(x: number, y: number, label: string, color: string, fn: () => void): void {
    const btn = this.add
      .text(x, y, label, { fontFamily: FONT, fontSize: '14px', color })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerup', fn);
    this.content.add(btn);
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
    this.tweens.add({ targets: t, alpha: 0, delay: 800, duration: 500, onComplete: () => t.destroy() });
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
