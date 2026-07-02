import Phaser from 'phaser';
import { bus } from '@/core/event-bus';
import { gameState } from '@/player/game-state';
import { FONT, ninePanel, pillButton } from '@/ui/theme';
import {
  introSteps,
  TUTORIAL_DONE_FLAG,
  type TutorialAnchor,
  type TutorialStep,
} from '@/tutorial/tutorial-defs';

/**
 * First-run coach. Walks a new player through move → attack → bag → goal with a
 * bottom card (9-slice panel) and a bouncing arrow pointing at the relevant HUD
 * control. Each step advances on その操作 (auto) or a 次へ tap, so it never gets
 * stuck. Marks TUTORIAL_DONE_FLAG in the save on finish/skip → plays only once.
 *
 * Owns its own game objects on the given (UI) scene; call destroy() on shutdown.
 */
export class TutorialCoach {
  private readonly scene: Phaser.Scene;
  private readonly anchors: Record<Exclude<TutorialAnchor, 'none'>, { x: number; y: number }>;
  private readonly steps: TutorialStep[];
  private readonly depth: number;
  private index = 0;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private arrowTween: Phaser.Tweens.Tween | null = null;
  private advanceOff: (() => void) | null = null;
  private finished = false;

  constructor(
    scene: Phaser.Scene,
    anchors: Record<Exclude<TutorialAnchor, 'none'>, { x: number; y: number }>,
    depth: number,
  ) {
    this.scene = scene;
    this.anchors = anchors;
    this.depth = depth;
    this.steps = introSteps();
  }

  /** True when the intro hasn't been completed on this save yet. */
  static shouldShow(): boolean {
    return !gameState.flags[TUTORIAL_DONE_FLAG];
  }

  start(): void {
    if (this.steps.length === 0) {
      this.finish();
      return;
    }
    this.showStep();
  }

  private showStep(): void {
    this.clearStep();
    const step = this.steps[this.index];
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const cardW = Math.min(w - 24, 320);
    const cardH = 92;
    const cy = h - cardH / 2 - 96; // above the touch buttons

    this.objs.push(ninePanel(this.scene, w / 2, cy, cardW, cardH).setDepth(this.depth));
    const left = w / 2 - cardW / 2 + 16;
    this.objs.push(
      this.scene.add
        .text(left, cy - cardH / 2 + 12, step.title, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#ffe9a8',
          fontStyle: 'bold',
        })
        .setDepth(this.depth + 1),
    );
    this.objs.push(
      this.scene.add
        .text(left, cy - cardH / 2 + 36, step.body, {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#eef0f8',
          wordWrap: { width: cardW - 32 },
          lineSpacing: 3,
        })
        .setDepth(this.depth + 1),
    );

    // Progress dots.
    const dotsY = cy + cardH / 2 - 12;
    this.steps.forEach((_s, i) => {
      const dx = w / 2 - (this.steps.length - 1) * 5 + i * 10;
      this.objs.push(
        this.scene.add
          .circle(dx, dotsY, 2.5, i === this.index ? 0xf5c542 : 0x555a78)
          .setDepth(this.depth + 1),
      );
    });

    const last = this.index === this.steps.length - 1;
    this.objs.push(
      pillButton(
        this.scene,
        w / 2 + cardW / 2 - 44,
        cy + cardH / 2 - 14,
        last ? 'はじめる' : '次へ',
        () => this.next(),
        { color: '#bfffce', bg: '#274a30', size: 13 },
      ).setDepth(this.depth + 1),
    );
    if (!last) {
      this.objs.push(
        pillButton(this.scene, w / 2 - cardW / 2 + 30, cy + cardH / 2 - 14, 'スキップ', () => this.finish(), {
          color: '#9aa0b5',
          bg: '#2a2d44',
          size: 11,
        }).setDepth(this.depth + 1),
      );
    }

    this.showArrow(step.anchor);
    this.wireAdvance(step);
  }

  /** Bouncing arrow that points at the step's HUD control. */
  private showArrow(anchor: TutorialAnchor): void {
    if (anchor === 'none') return;
    const a = this.anchors[anchor];
    if (!a) return;
    // Triangle pointing down toward the target, hovering just above it.
    const t = this.scene.add
      .triangle(a.x, a.y - 40, 0, 0, 14, 0, 7, 12, 0xf5c542)
      .setDepth(this.depth + 1);
    this.objs.push(t);
    this.arrowTween = this.scene.tweens.add({
      targets: t,
      y: a.y - 30,
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  private wireAdvance(step: TutorialStep): void {
    if (!step.advanceOn) return;
    this.advanceOff = bus.on(step.advanceOn, () => this.next());
  }

  private next(): void {
    if (this.finished) return;
    this.index += 1;
    if (this.index >= this.steps.length) {
      this.finish();
      return;
    }
    bus.emit('sfx:play', { id: 'ui_tap' });
    this.showStep();
  }

  private clearStep(): void {
    this.advanceOff?.();
    this.advanceOff = null;
    this.arrowTween?.remove();
    this.arrowTween = null;
    for (const o of this.objs) o.destroy();
    this.objs = [];
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.clearStep();
    gameState.flags[TUTORIAL_DONE_FLAG] = true;
    bus.emit('save:written', { slot: -1 }); // hint an autosave so it sticks
  }

  destroy(): void {
    this.clearStep();
  }
}
