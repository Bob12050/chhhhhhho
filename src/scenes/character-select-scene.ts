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
  DEFAULT_CHARACTER_NAME,
  MAX_CHARACTER_NAME_LENGTH,
  normalizeCharacterName,
} from '@/player/character-name';
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
  private nameInput: HTMLInputElement | null = null;
  private nameError: Phaser.GameObjects.Text | null = null;
  private readonly repositionNameInput = (): void => this.positionNameInput();

  constructor() {
    super('CharacterSelect');
  }

  init(data: CharacterSelectData): void {
    this.slot = data.slot ?? 0;
    this.selected = 'female';
  }

  create(): void {
    this.removeNameInput();
    const w = this.scale.width;
    const h = this.scale.height;
    addSceneBackdrop(this, 0.72);

    titlePlate(this, w / 2, 48, w - 38, 58, 1, 0.98);
    this.add
      .text(w / 2, 48, '冒険者をつくる', {
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

    this.add
      .text(24, 112, 'キャラクター名', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#fff0b0',
        fontStyle: 'bold',
      })
      .setDepth(3);
    this.nameError = this.add
      .text(w - 24, 112, '', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#ff9e9e',
      })
      .setOrigin(1, 0)
      .setDepth(3);
    this.createNameInput();

    const cardY = 336;
    this.cards.set('female', this.makeChoice(94, cardY, 'female', '女性'));
    this.cards.set('male', this.makeChoice(w - 94, cardY, 'male', '男性'));
    this.refreshChoices();

    pillButton(
      this,
      68,
      h - 54,
      'もどる',
      () => this.scene.start('SaveSelect', { mode: 'new' }),
      {
        color: '#d9e2f1',
        bg: '#253048',
        size: 13,
      },
    ).setDepth(4);
    pillButton(this, w - 106, h - 54, 'この姿で始める', () => {
      this.startAdventure();
    }, {
      color: '#fff0b0',
      bg: '#31513b',
      size: 14,
    }).setDepth(4);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeNameInput, this);
  }

  private createNameInput(): void {
    const root = document.getElementById('game-root');
    if (!root) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = DEFAULT_CHARACTER_NAME;
    input.maxLength = MAX_CHARACTER_NAME_LENGTH;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.enterKeyHint = 'done';
    input.setAttribute('aria-label', 'キャラクター名');
    Object.assign(input.style, {
      position: 'absolute',
      zIndex: '20',
      boxSizing: 'border-box',
      margin: '0',
      border: '2px solid #d2b45c',
      borderRadius: '6px',
      background: 'rgba(8, 24, 43, 0.98)',
      color: '#ffffff',
      fontFamily: "'M PLUS 2 Game', sans-serif",
      fontWeight: '700',
      letterSpacing: '0',
      textAlign: 'center',
      caretColor: '#fff0a8',
      outline: 'none',
      boxShadow: 'inset 0 0 0 2px rgba(111, 154, 205, 0.2), 0 3px 9px rgba(0, 0, 0, 0.38)',
      touchAction: 'manipulation',
      userSelect: 'text',
      WebkitUserSelect: 'text',
    });
    input.addEventListener('pointerdown', (event) => event.stopPropagation());
    input.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
    input.addEventListener('input', () => this.nameError?.setText(''));
    input.addEventListener('focus', () => {
      if (input.value === DEFAULT_CHARACTER_NAME) input.select();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      input.blur();
      this.startAdventure();
    });
    root.appendChild(input);
    this.nameInput = input;
    window.addEventListener('resize', this.repositionNameInput);
    this.positionNameInput();
    requestAnimationFrame(this.repositionNameInput);
  }

  private positionNameInput(): void {
    if (!this.nameInput) return;
    const root = document.getElementById('game-root');
    const canvas = this.game.canvas;
    if (!root || !canvas) return;
    const rootRect = root.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvasRect.width / this.scale.width;
    const scaleY = canvasRect.height / this.scale.height;
    Object.assign(this.nameInput.style, {
      left: `${canvasRect.left - rootRect.left + 24 * scaleX}px`,
      top: `${canvasRect.top - rootRect.top + 130 * scaleY}px`,
      width: `${(this.scale.width - 48) * scaleX}px`,
      height: `${40 * scaleY}px`,
      padding: `0 ${12 * scaleX}px`,
      fontSize: `${Math.max(16, 16 * scaleY)}px`,
    });
  }

  private startAdventure(): void {
    const rawName = this.nameInput?.value ?? '';
    if (!rawName.trim()) {
      this.nameError?.setText('名前を入力してください');
      this.nameInput?.focus();
      return;
    }
    const name = normalizeCharacterName(rawName);
    if (this.nameInput) this.nameInput.value = name;
    void beginGame(this, this.slot, 'new', this.selected, name);
  }

  private removeNameInput(): void {
    window.removeEventListener('resize', this.repositionNameInput);
    this.nameInput?.remove();
    this.nameInput = null;
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
