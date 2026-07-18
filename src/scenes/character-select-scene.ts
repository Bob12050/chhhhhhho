import Phaser from 'phaser';
import { beginGame } from '@/core/game-flow';
import { TEX } from '@/assets/gen/textures';
import { frameIndex } from '@/paperdoll/pose-atlas';
import {
  appearanceTextureScale,
  baseAppearanceTexKey,
} from '@/jobs/job-appearance';
import type { CharacterGender } from '@/player/character-gender';
import {
  FONT,
  addSceneBackdrop,
  pillButton,
  titlePlate,
} from '@/ui/theme';

interface CharacterSelectData {
  slot: number;
}

interface ChoiceCard {
  root: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
}

export class CharacterSelectScene extends Phaser.Scene {
  private slot = 0;
  private selected: CharacterGender = 'female';
  private cards = new Map<CharacterGender, ChoiceCard>();

  constructor() {
    super('CharacterSelect');
  }

  init(data: CharacterSelectData): void {
    this.slot = data.slot ?? 0;
    this.selected = 'female';
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    addSceneBackdrop(this, 0.72);

    titlePlate(this, w / 2, 48, w - 38, 58, 1, 0.98);
    this.add
      .text(w / 2, 48, '冒険者を選ぶ', {
        fontFamily: FONT,
        fontSize: '22px',
        color: '#ffffff',
        fontStyle: 'bold',
        stroke: '#1a1030',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.add
      .text(w / 2, 91, `スロット ${this.slot + 1}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#c6d2e4',
      })
      .setOrigin(0.5)
      .setDepth(2);

    const cardY = 270;
    this.cards.set('female', this.makeChoice(94, cardY, 'female', '女性'));
    this.cards.set('male', this.makeChoice(w - 94, cardY, 'male', '男性'));
    this.refreshChoices();

    pillButton(this, 68, h - 54, 'もどる', () => this.scene.start('SaveSelect'), {
      color: '#d9e2f1',
      bg: '#253048',
      size: 13,
    }).setDepth(4);
    pillButton(this, w - 106, h - 54, 'この姿で始める', () => {
      void beginGame(this, this.slot, 'new', this.selected);
    }, {
      color: '#fff0b0',
      bg: '#31513b',
      size: 14,
    }).setDepth(4);
  }

  private makeChoice(
    x: number,
    y: number,
    gender: CharacterGender,
    name: string,
  ): ChoiceCard {
    const frame = this.add.graphics();
    const textureKey = baseAppearanceTexKey(gender);
    const texture = this.textures.exists(textureKey) ? textureKey : TEX.playerBody;
    const shadow = this.add.ellipse(0, 72, 72, 18, 0x030712, 0.58);
    const sprite = this.add
      .sprite(0, 79, texture, frameIndex('down', 'idle', 0))
      .setOrigin(0.5, 0.875)
      .setScale(0.92 * appearanceTextureScale(texture));
    const label = this.add
      .text(0, 112, name, {
        fontFamily: FONT,
        fontSize: '19px',
        color: '#dce6f5',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    const caption = this.add
      .text(0, 139, '冒険者', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#9eb0c8',
      })
      .setOrigin(0.5);
    const root = this.add
      .container(x, y, [frame, shadow, sprite, label, caption])
      .setSize(148, 304)
      .setInteractive({ useHandCursor: true })
      .setDepth(2);
    root.on('pointerup', () => {
      this.selected = gender;
      this.refreshChoices();
    });
    root.on('pointerdown', () => root.setScale(0.985));
    root.on('pointerout', () => root.setScale(1));
    root.on('pointerup', () => root.setScale(1));
    return { root, frame, label };
  }

  private refreshChoices(): void {
    for (const [gender, card] of this.cards) {
      const active = gender === this.selected;
      card.frame.clear();
      card.frame.fillStyle(active ? 0x102943 : 0x0b1727, active ? 0.98 : 0.9);
      card.frame.fillRoundedRect(-74, -152, 148, 304, 7);
      card.frame.fillStyle(0xffffff, active ? 0.055 : 0.025);
      card.frame.fillRoundedRect(-71, -149, 142, 94, { tl: 5, tr: 5, bl: 0, br: 0 });
      card.frame.lineStyle(2, active ? 0xf0cb67 : 0x718095, active ? 0.95 : 0.32);
      card.frame.strokeRoundedRect(-74, -152, 148, 304, 7);
      if (active) {
        card.frame.fillStyle(0xf4cb57, 1);
        card.frame.fillRoundedRect(-42, 143, 84, 4, 2);
      }
      card.label.setColor(active ? '#fff0b0' : '#d0d9e8');
    }
  }
}
