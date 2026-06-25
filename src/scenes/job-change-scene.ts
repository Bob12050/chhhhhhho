import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allJobs, getJob, type JobDef } from '@/jobs/job-defs';
import { bus } from '@/core/event-bus';

/**
 * Job-change overlay (opened by the guild NPC). Lists jobs with their unlock
 * requirements and a change button when eligible. Changing recomputes stats.
 */
export class JobChangeScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;

  constructor() {
    super('JobChange');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, 0x0e0f1a, 0.94).setOrigin(0).setDepth(0);
    this.add
      .text(16, 24, '転職', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#fff' })
      .setDepth(1);

    const treeBtn = this.add
      .text(w - 16, 26, '[ ツリーを見る ]', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#c8b6ff',
      })
      .setOrigin(1, 0)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    treeBtn.on('pointerup', () => {
      this.scene.pause();
      this.scene.launch('JobTree');
    });

    this.content = this.add.container(0, 0).setDepth(1);

    const close = this.add
      .text(w / 2, h - 44, '[ とじる ]', {
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

  private render(): void {
    this.content.removeAll(true);
    const w = this.scale.width;
    const cur = getJob(gameState.jobId);
    this.content.add(
      this.add.text(16, 60, `現在の職業: ${cur?.name ?? gameState.jobId} (Lv${gameState.level})`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: '#9fd0ff',
      }),
    );

    let y = 96;
    for (const job of this.relevantJobs()) {
      this.renderJob(job, y, w);
      y += 76;
    }
  }

  /**
   * Only jobs worth showing: the current job, already-unlocked jobs, and the
   * immediate next step (a job whose parent is unlocked). Avoids dumping the
   * whole 21-job tree on a phone screen. Ordered by tier.
   */
  private relevantJobs(): JobDef[] {
    const unlocked = new Set(gameState.unlockedJobs);
    return allJobs()
      .filter(
        (j) =>
          j.id === gameState.jobId ||
          unlocked.has(j.id) ||
          j.parentJobIds.some((p) => unlocked.has(p)),
      )
      .sort((a, b) => a.tier - b.tier);
  }

  private renderJob(job: JobDef, y: number, w: number): void {
    const isCurrent = gameState.jobId === job.id;
    const block = gameState.jobChangeBlock(job.id);
    this.content.add(
      this.add.text(16, y, `${job.name}  (Tier ${job.tier})${isCurrent ? '  ★現在' : ''}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: isCurrent ? '#9fe3a0' : '#fff',
      }),
    );
    this.content.add(
      this.add.text(16, y + 20, job.description, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#9aa0b5',
      }),
    );

    if (!isCurrent) {
      if (block === null) {
        const btn = this.add
          .text(w - 16, y + 6, '[ 転職する ]', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '14px',
            color: '#9fd0ff',
          })
          .setOrigin(1, 0)
          .setInteractive({ useHandCursor: true });
        btn.on('pointerup', () => {
          gameState.changeJob(job.id);
          this.render();
        });
        this.content.add(btn);
      } else {
        const note = job.unlockConditions.length > 0 ? `要: ${this.conditionsText(job)}` : '条件未達';
        this.content.add(
          this.add
            .text(w - 16, y + 6, note, {
              fontFamily: 'system-ui, sans-serif',
              fontSize: '11px',
              color: '#7e8499',
            })
            .setOrigin(1, 0),
        );
      }
    }
    this.content.add(this.add.rectangle(w / 2, y + 62, w - 32, 1, 0x333a5a).setOrigin(0.5));
  }

  /** Human-readable transfer requirements built from data-driven conditions. */
  private conditionsText(job: JobDef): string {
    return job.unlockConditions
      .map((c) => {
        switch (c.type) {
          case 'jobLevel': {
            const have = gameState.jobLevelOf(c.jobId);
            return `${getJob(c.jobId)?.name ?? c.jobId} Lv${have}/${c.level}`;
          }
          case 'charLevel':
            return `Lv${gameState.level}/${c.level}`;
          case 'skill':
            return `スキル「${c.skillId}」`;
          case 'flag':
            return '特定条件';
          case 'quest':
            return '高難度クエスト踏破';
        }
      })
      .join('・');
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
