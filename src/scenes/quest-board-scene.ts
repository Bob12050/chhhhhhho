import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { itemDisplayName } from '@/data/items';
import { getEnemyDef } from '@/enemies/enemy-defs';
import { getQuest, type QuestDef } from '@/quests/quest-defs';
import {
  availableQuests,
  acceptQuest,
  isComplete,
  turnInQuest,
  objectiveProgress,
} from '@/quests/quests';
import { bus } from '@/core/event-bus';

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
  private viewTop = 60;
  private viewBottom = 0;

  constructor() {
    super('QuestBoard');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    this.add.rectangle(0, 0, w, h, 0x0e0f1a, 0.94).setOrigin(0).setDepth(0);
    this.add
      .text(16, 24, 'クエストボード', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#fff',
      })
      .setDepth(1);

    this.content = this.add.container(0, 0).setDepth(1);
    this.viewBottom = h - 60;
    const maskG = this.make.graphics({}, false);
    maskG.fillStyle(0xffffff);
    maskG.fillRect(0, this.viewTop, w, this.viewBottom - this.viewTop);
    this.content.setMask(maskG.createGeometryMask());
    this.setupScroll();

    const close = this.add
      .text(w / 2, h - 40, '[ とじる ]', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#ffd86b',
      })
      .setOrigin(0.5)
      .setDepth(1)
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

  private render(): void {
    this.content.removeAll(true);
    const w = this.scale.width;
    let y = 70;

    const active = gameState.activeQuests.map((id) => getQuest(id)).filter(Boolean) as QuestDef[];
    const avail = availableQuests(gameState);
    const done = gameState.completedQuests.map((id) => getQuest(id)).filter(Boolean) as QuestDef[];

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
      this.content.add(
        this.add.text(16, y, '今は受けられるクエストがありません。', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          color: '#9aa0b4',
        }),
      );
      y += 28;
    }

    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  private heading(text: string, y: number, w: number): number {
    this.content.add(
      this.add.text(16, y, text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#8fa0ff',
        fontStyle: 'bold',
      }),
    );
    this.content.add(this.add.rectangle(w / 2, y + 18, w - 32, 1, 0x333a5a).setOrigin(0.5));
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
    this.content.add(
      this.add.text(16, y, q.name, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: titleColor,
      }),
    );
    this.content.add(
      this.add.text(16, y + 20, this.objectiveText(q, state === 'active'), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: state === 'done' ? '#6b7088' : '#cfe0a0',
      }),
    );
    const rt = this.rewardText(q);
    if (rt) {
      this.content.add(
        this.add.text(16, y + 36, rt, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '10px',
          color: state === 'done' ? '#5a607a' : '#bda9e0',
        }),
      );
    }

    if (state === 'available') {
      this.actionButton(w - 16, y + 10, '[ 受ける ]', '#9fe3a0', () => {
        if (this.dragged) return;
        acceptQuest(gameState, q.id);
        this.render();
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
              fontFamily: 'system-ui, sans-serif',
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
            fontFamily: 'system-ui, sans-serif',
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
      .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerup', fn);
    this.content.add(btn);
  }

  private flash(msg: string): void {
    const t = this.add
      .text(this.scale.width / 2, this.scale.height - 70, msg, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#ffe9a8',
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.tweens.add({ targets: t, alpha: 0, delay: 800, duration: 500, onComplete: () => t.destroy() });
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
