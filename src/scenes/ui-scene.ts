import Phaser from 'phaser';
import { input } from '@/input/input-state';
import { VirtualStick } from '@/input/virtual-stick';
import { TouchButton } from '@/input/touch-button';
import { readInsets } from '@/core/safe-area';
import { bus } from '@/core/event-bus';
import { isDebugEnabled } from '@/core/debug';
import { gameState } from '@/player/game-state';
import { getJob } from '@/jobs/job-defs';
import { expToNext } from '@/stats/leveling';

/**
 * Always-on UI overlay: virtual stick (lower-left), attack + skill + interact
 * buttons (lower-right), and a small HUD (HP/MP). Renders above the world and
 * keeps controls clear of the home-indicator safe area. Also provides a dev
 * keyboard fallback.
 */
export class UIScene extends Phaser.Scene {
  private stick!: VirtualStick;
  private interactBtn!: TouchButton;
  private hpText!: Phaser.GameObjects.Text;
  private mpText!: Phaser.GameObjects.Text;
  private hpBar!: Phaser.GameObjects.Rectangle;
  private mpBar!: Phaser.GameObjects.Rectangle;
  private expBar!: Phaser.GameObjects.Rectangle;
  private goldText!: Phaser.GameObjects.Text;
  private jobText!: Phaser.GameObjects.Text;
  private updateText!: Phaser.GameObjects.Text;
  private busOff: Array<() => void> = [];

  constructor() {
    super('UI');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    // CSS px per logical px (FIT scale). Used to convert safe-area insets.
    const cssPerLogical = this.scale.displaySize.width / this.scale.gameSize.width;
    const insets = readInsets(cssPerLogical || 1);
    const bottomPad = Math.max(insets.bottom, 12) + 8;

    const depth = 1000;

    // Virtual stick on the lower-left half.
    this.stick = new VirtualStick(
      this,
      new Phaser.Geom.Rectangle(0, h * 0.45, w * 0.5, h * 0.55),
      depth,
    );

    // Buttons lower-right, above the home indicator.
    const baseX = w - insets.right - 44;
    const baseY = h - bottomPad - 44;

    const attackBtn = new TouchButton(this, baseX, baseY, 32, 'A', 0xcc4444, depth);
    attackBtn.onChange = (d) => input.setButton('attack', d);

    const skillBtn = new TouchButton(this, baseX - 76, baseY + 6, 28, 'S1', 0x4466cc, depth);
    skillBtn.onChange = (d) => input.setButton('skill1', d);

    const skill2Btn = new TouchButton(this, baseX - 60, baseY - 58, 26, 'S2', 0x5a4abf, depth);
    skill2Btn.onChange = (d) => input.setButton('skill2', d);

    // Interact button appears only when something is interactable (top area).
    this.interactBtn = new TouchButton(this, w / 2, h - bottomPad - 110, 28, '調', 0x44aa66, depth);
    this.interactBtn.onChange = (d) => input.setButton('interact', d);
    this.interactBtn.setVisible(false);

    // HUD (top, clear of the notch). HP/MP shown as bars with text on top.
    const hudX = insets.left + 8;
    const BAR_W = 116;
    const BAR_H = 15;
    const makeBar = (y: number, color: number): Phaser.GameObjects.Rectangle => {
      this.add.rectangle(hudX, y, BAR_W, BAR_H, 0x000000, 0.45).setOrigin(0, 0).setDepth(depth);
      return this.add.rectangle(hudX, y, BAR_W, BAR_H, color, 0.85).setOrigin(0, 0).setDepth(depth);
    };

    this.hpBar = makeBar(insets.top + 5, 0xcc3344);
    this.hpText = this.add
      .text(hudX + 5, insets.top + 6, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#ffffff',
      })
      .setDepth(depth + 1);
    this.busOff.push(
      bus.on('player:hp-changed', ({ current, max }) => {
        this.hpText.setText(`HP ${current}/${max}`);
        this.hpBar.scaleX = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
      }),
    );

    this.mpBar = makeBar(insets.top + 23, 0x3a6bd6);
    this.mpText = this.add
      .text(hudX + 5, insets.top + 24, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#dbe8ff',
      })
      .setDepth(depth + 1);
    this.busOff.push(
      bus.on('player:mp-changed', ({ current, max }) => {
        this.mpText.setText(`MP ${current}/${max}`);
        this.mpBar.scaleX = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
      }),
    );

    this.goldText = this.add
      .text(insets.left + 8, insets.top + 44, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#ffd86b',
      })
      .setDepth(depth);
    this.busOff.push(
      bus.on('gold:changed', ({ current }) => this.goldText.setText(`${current} G`)),
    );

    // Current job + active-job level (multi-job system).
    this.jobText = this.add
      .text(insets.left + 8, insets.top + 60, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#c8b6ff',
      })
      .setDepth(depth);
    const refreshJob = (): void => {
      const name = getJob(gameState.jobId)?.name ?? gameState.jobId;
      this.jobText.setText(`${name} Lv${gameState.level}`);
    };
    refreshJob();
    this.busOff.push(bus.on('job:changed', refreshJob));
    this.busOff.push(bus.on('player:level-up', refreshJob));

    // Thin EXP progress line across the top of the screen.
    const expW = w - insets.left - insets.right;
    this.add
      .rectangle(insets.left, insets.top, expW, 3, 0x000000, 0.4)
      .setOrigin(0, 0)
      .setDepth(depth);
    this.expBar = this.add
      .rectangle(insets.left, insets.top, expW, 3, 0xffd86b, 0.95)
      .setOrigin(0, 0)
      .setDepth(depth);
    const setExp = (cur: number, toNext: number): void => {
      this.expBar.scaleX = toNext > 0 ? Phaser.Math.Clamp(cur / toNext, 0, 1) : 0;
    };
    setExp(gameState.exp, expToNext(gameState.level));
    this.busOff.push(bus.on('player:exp-changed', ({ current, toNext }) => setExp(current, toNext)));

    // Bag button (top-right) opens the inventory/menu.
    const bag = new TouchButton(this, w - insets.right - 24, insets.top + 26, 22, '袋', 0x6a4ea0, depth);
    bag.onChange = (down) => {
      if (down) bus.emit('ui:open-inventory', {});
    };

    // Map button (below the bag) opens the fast-travel list.
    const mapBtn = new TouchButton(this, w - insets.right - 24, insets.top + 74, 22, '地', 0x4e7aa0, depth);
    mapBtn.onChange = (down) => {
      if (down) bus.emit('ui:open-map', {});
    };

    if (isDebugEnabled()) {
      const dbg = new TouchButton(this, w - insets.right - 72, insets.top + 26, 20, 'DBG', 0x884444, depth);
      dbg.onChange = (down) => {
        if (down) bus.emit('ui:open-debug', {});
      };
    }

    // PWA update notice (applied later, never mid-combat).
    this.updateText = this.add
      .text(w / 2, insets.top + 6, '更新があります（タイトルで適用）', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#ffd86b',
      })
      .setOrigin(0.5, 0)
      .setDepth(depth)
      .setVisible(false);
    this.busOff.push(bus.on('pwa:update-available', () => this.updateText.setVisible(true)));

    this.installKeyboardDev();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.busOff) off();
      this.busOff = [];
    });
  }

  /** Allow the town scene to toggle the interact prompt. */
  showInteract(show: boolean): void {
    this.interactBtn.setVisible(show);
  }

  getStickVector(): { x: number; y: number } {
    return { x: this.stick.vector.x, y: this.stick.vector.y };
  }

  private installKeyboardDev(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const keys = kb.addKeys('W,A,S,D,J,K,L,E,UP,DOWN,LEFT,RIGHT') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    const onUpdate = (): void => {
      let x = 0;
      let y = 0;
      if (keys.A.isDown || keys.LEFT.isDown) x -= 1;
      if (keys.D.isDown || keys.RIGHT.isDown) x += 1;
      if (keys.W.isDown || keys.UP.isDown) y -= 1;
      if (keys.S.isDown || keys.DOWN.isDown) y += 1;
      if (x !== 0 || y !== 0) {
        this.stick.vector.set(x, y);
      } else if (!this.stick.isActive()) {
        this.stick.vector.set(0, 0);
      }
      input.setButton('attack', keys.J.isDown);
      input.setButton('skill1', keys.K.isDown);
      input.setButton('skill2', keys.L.isDown);
      input.setButton('interact', keys.E.isDown);
    };
    this.events.on('update', onUpdate);
    this.busOff.push(() => this.events.off('update', onUpdate));
  }
}
