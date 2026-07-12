import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { getDialogue, type DialogueDef } from '@/dialogue/dialogue-defs';
import { bus } from '@/core/event-bus';
import { FONT } from '@/ui/theme';
import { acceptQuest } from '@/quests/quests';

/**
 * Simple conversation overlay. Shows a speaker + lines (tap to advance), then
 * optional end choices. Choices / the dialogue may set a flag (quests, unlocks).
 * The world is paused while talking.
 */
export class DialogueScene extends Phaser.Scene {
  private def?: DialogueDef;
  private line = 0;
  private bodyText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private choiceObjs: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('Dialogue');
  }

  init(data: { id: string }): void {
    this.def = getDialogue(data.id);
    this.line = 0;
    this.choiceObjs = [];
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;

    if (!this.def) {
      this.close();
      return;
    }

    // Tap anywhere to advance (added first so choice buttons sit on top).
    const swallow = this.add.rectangle(0, 0, w, h, 0x000000, 0.001).setOrigin(0).setDepth(0);
    swallow.setInteractive();
    swallow.on('pointerup', () => this.advance());

    const boxH = 150;
    this.add.rectangle(0, h - boxH, w, boxH, 0x0e0f1a, 0.96).setOrigin(0).setDepth(1);
    this.add.rectangle(0, h - boxH, w, 2, 0x46508a).setOrigin(0).setDepth(2);

    this.add
      .text(16, h - boxH + 12, this.def.speaker, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#9fd0ff',
      })
      .setDepth(2);
    this.bodyText = this.add
      .text(16, h - boxH + 38, '', {
        fontFamily: FONT,
        fontSize: '15px',
        color: '#ffffff',
        wordWrap: { width: w - 32, useAdvancedWrap: true },
        lineSpacing: 4,
      })
      .setDepth(2);
    this.hint = this.add
      .text(w - 16, h - 18, '▼ タップで進む', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#9aa0b5',
      })
      .setOrigin(1, 1)
      .setDepth(2);

    this.input.keyboard?.on('keydown-E', () => this.advance());
    this.input.keyboard?.on('keydown-ESC', () => this.close());

    this.showLine();
  }

  private showLine(): void {
    if (!this.def) return;
    this.bodyText.setText(this.def.lines[this.line] ?? '');
  }

  private advance(): void {
    if (!this.def || this.choiceObjs.length > 0) return; // waiting on a choice
    if (this.line < this.def.lines.length - 1) {
      this.line++;
      this.showLine();
      return;
    }
    // End of lines: choices, or apply flag and close.
    if (this.def.choices && this.def.choices.length > 0) {
      this.showChoices();
    } else {
      this.finish(this.def.setFlag);
    }
  }

  private showChoices(): void {
    if (!this.def?.choices) return;
    this.hint.setVisible(false);
    this.bodyText.setVisible(false);
    const w = this.scale.width;
    const h = this.scale.height;
    this.def.choices.forEach((c, i) => {
      const t = this.add
        .text(w / 2, h - 150 + 70 + i * 26, `▶ ${c.text}`, {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#ffe9a8',
        })
        .setOrigin(0.5, 0)
        .setDepth(3)
        .setInteractive({ useHandCursor: true });
      t.on('pointerup', () => this.finish(c.setFlag, c.acceptQuest));
      this.choiceObjs.push(t);
    });
  }

  private finish(setFlag?: string, questId?: string): void {
    if (setFlag) gameState.flags[setFlag] = true;
    if (questId) acceptQuest(gameState, questId);
    this.close();
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
