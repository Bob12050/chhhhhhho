import Phaser from 'phaser';
import { gameState } from '@/player/game-state';

/**
 * Phase 1 walkthrough checklist (debug aid). Reads live progress flags from
 * game state so the 18-step run can be verified at a glance — and, crucially,
 * that the checks survive a reload (= "all state preserved").
 */
interface Step {
  label: string;
  done: () => boolean;
}

export class ChecklistScene extends Phaser.Scene {
  constructor() {
    super('Checklist');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const g = gameState;
    const f = g.flags;
    const bossDefeated = Object.keys(f).some((k) => k.endsWith('_defeated') && f[k]);

    const steps: Step[] = [
      { label: 'ゲーム開始', done: () => g.level >= 1 },
      { label: 'フィールド到達', done: () => !!f['visited_field'] },
      { label: '敵を倒す', done: () => !!f['killed_any'] },
      { label: '素材を入手', done: () => Object.keys(g.materials).length > 0 },
      { label: 'レベルアップ', done: () => g.level >= 2 },
      { label: 'STRを割り振り', done: () => g.base.STR > 5 },
      { label: 'スキル習得', done: () => Object.keys(g.skills).length > 1 },
      { label: '町で製作', done: () => !!f['crafted_any'] },
      { label: '装備を変更', done: () => !!f['equipped_any'] },
      { label: 'ペット同行', done: () => g.activePetId !== null },
      { label: 'ダンジョン到達', done: () => !!f['visited_dungeon'] },
      { label: 'ボス撃破', done: () => bossDefeated },
      { label: '転職', done: () => g.jobId !== 'adventurer' },
      { label: 'セーブ実行', done: () => !!f['saved_any'] },
    ];

    this.add.rectangle(0, 0, w, h, 0x0e0f1a, 0.96).setOrigin(0).setDepth(0);
    this.add
      .text(16, 18, '通し確認チェックリスト', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#fff',
      })
      .setDepth(1);

    const doneCount = steps.filter((s) => s.done()).length;
    this.add
      .text(w - 16, 22, `${doneCount}/${steps.length}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: doneCount === steps.length ? '#9fe3a0' : '#ffd86b',
      })
      .setOrigin(1, 0)
      .setDepth(1);

    let y = 52;
    for (const s of steps) {
      const ok = s.done();
      this.add
        .text(16, y, `${ok ? '✓' : '☐'}  ${s.label}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: ok ? '#9fe3a0' : '#9aa0b5',
        })
        .setDepth(1);
      y += 26;
    }

    this.add
      .text(16, y + 8, '再起動後もこのチェックが残れば「全状態維持」OK', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#9aa0b5',
      })
      .setDepth(1);

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
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
  }
}
