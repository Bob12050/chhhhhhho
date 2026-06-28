import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allJobs, getJob, type JobDef } from '@/jobs/job-defs';
import { FONT, UI } from '@/ui/theme';

type JobStatus = 'current' | 'unlocked' | 'reachable' | 'locked';

const TIER_LABEL = ['初期職', '1次職', '2次職', '3次職', '4次職'];

/**
 * Read-only overview of the whole job tree (all tiers), grouped by tier with
 * each job's status and unlock conditions. Opened from the job-change screen so
 * players can see the full progression even before it's reachable. Scrolls.
 */
export class JobTreeScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private viewTop = 56;
  private viewBottom = 0;

  constructor() {
    super('JobTree');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewBottom = h - 56;

    // Fully opaque, interactive backdrop hides the paused screen behind and
    // swallows its clicks.
    this.add
      .rectangle(0, 0, w, h, UI.overlay, 1)
      .setOrigin(0)
      .setDepth(0)
      .setInteractive();
    this.add
      .text(16, 22, '職業ツリー', {
        fontFamily: FONT,
        fontSize: '18px',
        color: '#fff',
      })
      .setDepth(3);

    this.content = this.add.container(0, 0).setDepth(1);
    // Opaque header/footer bars (depth 2) hide the scrolling list (depth 1).
    this.add.rectangle(0, 0, w, this.viewTop, UI.overlay, 1).setOrigin(0).setDepth(2);
    this.add.rectangle(0, this.viewBottom, w, h - this.viewBottom, UI.overlay, 1).setOrigin(0).setDepth(2);

    const close = this.add
      .text(w / 2, h - 30, '[ とじる ]', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffd86b',
      })
      .setOrigin(0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    close.on('pointerup', () => this.close());
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render(w);
    this.setupScroll();
  }

  private status(job: JobDef): JobStatus {
    if (job.id === gameState.jobId) return 'current';
    if (gameState.unlockedJobs.includes(job.id)) return 'unlocked';
    if (job.parentJobIds.some((p) => gameState.unlockedJobs.includes(p))) return 'reachable';
    return 'locked';
  }

  private conditionText(job: JobDef): string {
    if (job.unlockConditions.length === 0) return '無条件';
    return job.unlockConditions
      .map((c) => {
        switch (c.type) {
          case 'jobLevel':
            return `${getJob(c.jobId)?.name ?? c.jobId} Lv${gameState.jobLevelOf(c.jobId)}/${c.level}`;
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

  private render(w: number): void {
    let y = this.viewTop + 8;
    for (let tier = 0; tier <= 4; tier++) {
      const jobs = allJobs().filter((j) => j.tier === tier);
      if (jobs.length === 0) continue;
      this.content.add(
        this.add.text(12, y, TIER_LABEL[tier], {
          fontFamily: FONT,
          fontSize: '13px',
          color: '#ffd86b',
        }),
      );
      y += 22;
      for (const job of jobs) {
        const st = this.status(job);
        const tag =
          st === 'current'
            ? '  ★現在'
            : st === 'unlocked'
              ? '  ✓解放済み'
              : '';
        const color =
          st === 'current'
            ? '#9fe3a0'
            : st === 'unlocked'
              ? '#9fd0ff'
              : st === 'reachable'
                ? '#ffffff'
                : '#6f7488';
        this.content.add(
          this.add.text(20, y, `${job.name}${tag}`, {
            fontFamily: FONT,
            fontSize: '14px',
            color,
          }),
        );
        // Show the unlock condition for jobs not yet entered/unlocked.
        if (st === 'reachable' || st === 'locked') {
          this.content.add(
            this.add
              .text(w - 16, y + 2, this.conditionText(job), {
                fontFamily: FONT,
                fontSize: '10px',
                color: st === 'reachable' ? '#9aa0b5' : '#6f7488',
              })
              .setOrigin(1, 0),
          );
        }
        y += 22;
      }
      y += 6;
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
  }

  private setupScroll(): void {
    let startPointerY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startPointerY = p.y;
      startScroll = this.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      this.scrollTo(startScroll + (startPointerY - p.y));
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.scrollTo(this.scrollY + dy * 0.5);
    });
  }

  private scrollTo(y: number): void {
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll);
    this.content.y = -this.scrollY;
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('JobChange');
  }
}
