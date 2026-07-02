import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allJobs, getJob, type JobDef } from '@/jobs/job-defs';
import { bus } from '@/core/event-bus';
import { FONT, addPanelChrome, rowBand } from '@/ui/theme';
import { TEX } from '@/assets/gen/textures';

/** Emblem (icon + colour) per class family for the job list. */
const FAMILY_EMBLEM: Record<string, { tex: string; color: number }> = {
  warrior: { tex: TEX.iconSword, color: 0xcc5a5a },
  mage: { tex: TEX.iconStaff, color: 0x5a9ad0 },
  cleric: { tex: TEX.iconShield, color: 0xf5c542 },
  thief: { tex: TEX.iconBow, color: 0x6db06a },
  tamer: { tex: TEX.iconRing, color: 0xb07ad0 },
};

/**
 * Job-change overlay (opened by the guild NPC). Lists jobs with their unlock
 * requirements and a change button when eligible. Changing recomputes stats.
 */
export class JobChangeScene extends Phaser.Scene {
  private content!: Phaser.GameObjects.Container;
  private scrollY = 0;
  private maxScroll = 0;
  private dragged = false;
  private viewTop = 56;
  private viewBottom = 0;

  constructor() {
    super('JobChange');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.viewBottom = h - 64;
    this.add
      .text(16, 24, '転職', { fontFamily: FONT, fontSize: '18px', color: '#fff' })
      .setDepth(3);

    const treeBtn = this.add
      .text(w - 16, 24, 'ツリーを見る', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#c8b6ff',
        backgroundColor: '#2a3050',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(1, 0)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    treeBtn.on('pointerup', () => {
      if (this.dragged) return;
      this.scene.pause();
      this.scene.launch('JobTree');
    });

    this.content = this.add.container(0, 0).setDepth(1);
    // Opaque header/footer bars (depth 2) hide the scrolling list (depth 1).
    addPanelChrome(this, this.viewTop, this.viewBottom);
    this.setupScroll();

    const close = this.add
      .text(w / 2, h - 36, 'とじる', {
        fontFamily: FONT,
        fontSize: '16px',
        color: '#ffd86b',
        backgroundColor: '#2a3050',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(3)
      .setInteractive({ useHandCursor: true });
    close.on('pointerup', () => {
      if (this.dragged) return;
      this.close();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.render();
  }

  private render(): void {
    this.content.removeAll(true);
    const w = this.scale.width;
    const cur = getJob(gameState.jobId);
    this.content.add(
      this.add.text(16, this.viewTop + 4, `現在の職業: ${cur?.name ?? gameState.jobId} (Lv${gameState.level})`, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#9fd0ff',
      }),
    );

    let y = this.viewTop + 30;
    let band = 0;
    for (const job of this.relevantJobs()) {
      this.renderJob(job, y, w, band++);
      y += 64;
    }
    this.maxScroll = Math.max(0, y + 8 - this.viewBottom);
    this.scrollTo(this.scrollY);
  }

  private setupScroll(): void {
    let startY = 0;
    let startScroll = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      startY = p.y;
      startScroll = this.scrollY;
      this.dragged = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      const d = startY - p.y;
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

  private renderJob(job: JobDef, y: number, w: number, band: number): void {
    const rowH = 60;
    const cy = y + rowH / 2;
    this.content.add(rowBand(this, y, rowH, band));
    const isCurrent = gameState.jobId === job.id;
    const block = gameState.jobChangeBlock(job.id);
    const lvl = gameState.jobLevelOf(job.id);
    // Family emblem cell (icon + colour), gold ring when it's the active job.
    const em = FAMILY_EMBLEM[job.family ?? ''] ?? { tex: TEX.iconGem, color: 0x888ea0 };
    this.content.add(
      this.add.rectangle(26, cy, 32, 32, 0x1c2036, 1).setStrokeStyle(2, isCurrent ? 0xf5c542 : em.color, 0.95),
    );
    this.content.add(this.add.image(26, cy, em.tex).setTint(em.color));
    this.content.add(
      this.add.text(50, y + 8, `${job.name}  Lv${lvl}${isCurrent ? '  ★現在' : ''}`, {
        fontFamily: FONT,
        fontSize: '15px',
        color: isCurrent ? '#9fe3a0' : '#fff',
      }),
    );
    // Tier chip.
    this.content.add(
      this.add
        .text(50, y + 30, `Tier ${job.tier}`, {
          fontFamily: FONT,
          fontSize: '10px',
          color: '#cfd3e6',
          backgroundColor: '#2a2d44',
          padding: { x: 5, y: 1 },
        }),
    );
    this.content.add(
      this.add.text(96, y + 31, job.description, {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#9aa0b5',
      }),
    );

    if (!isCurrent) {
      if (block === null) {
        const btn = this.add
          .text(w - 16, cy, '転職する', {
            fontFamily: FONT,
            fontSize: '13px',
            color: '#bfffce',
            backgroundColor: '#274a30',
            padding: { x: 10, y: 5 },
          })
          .setOrigin(1, 0.5)
          .setInteractive({ useHandCursor: true });
        btn.on('pointerup', () => {
          if (this.dragged) return;
          gameState.changeJob(job.id);
          bus.emit('sfx:play', { id: 'level_up' });
          this.render();
        });
        this.content.add(btn);
      } else {
        const note = job.unlockConditions.length > 0 ? `要: ${this.conditionsText(job)}` : '条件未達';
        this.content.add(
          this.add
            .text(w - 16, cy, note, { fontFamily: FONT, fontSize: '10px', color: '#7e8499' })
            .setOrigin(1, 0.5),
        );
      }
    }
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
