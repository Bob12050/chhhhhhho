import Phaser from 'phaser';
import { input } from '@/input/input-state';
import { VirtualStick } from '@/input/virtual-stick';
import { TouchButton } from '@/input/touch-button';
import { readInsets } from '@/core/safe-area';
import { bus } from '@/core/event-bus';
import { isDebugEnabled } from '@/core/debug';
import { gameState } from '@/player/game-state';
import { getJob } from '@/jobs/job-defs';
import { getQuest } from '@/quests/quest-defs';
import { isComplete, objectiveProgress } from '@/quests/quests';
import { getEnemyDef } from '@/enemies/enemy-defs';
import { expToNext } from '@/stats/leveling';
import { FONT, UI } from '@/ui/theme';

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
  private expText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private jobText!: Phaser.GameObjects.Text;
  private updateText!: Phaser.GameObjects.Text;
  private lowHpVignette!: Phaser.GameObjects.Graphics;
  private lowHpTween: Phaser.Tweens.Tween | null = null;
  private busOff: Array<() => void> = [];
  private potionReadyAt = 0;
  private qWasDown = false;
  private usePotionByKey: (() => void) | null = null;

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

    const dodgeBtn = new TouchButton(this, baseX + 2, baseY - 76, 26, '回避', 0x3f9a6e, depth);
    dodgeBtn.onChange = (d) => input.setButton('dodge', d);

    // Potion quick-slot: one tap heals mid-fight (no menu). Uses the smallest
    // HP potion first; greys out at zero; short cooldown against panic-chugs.
    const POTION_IDS = ['potion_hp', 'potion_hp_l'];
    const potBtn = new TouchButton(this, baseX - 64, baseY - 122, 24, '薬', 0xc04a5a, depth);
    const potCount = this.add
      .text(baseX - 44, baseY - 138, '', { fontFamily: FONT, fontSize: '11px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(depth + 2);
    const refreshPotions = (): void => {
      const n = POTION_IDS.reduce((sum, id) => sum + (gameState.consumables[id] ?? 0), 0);
      potCount.setText(`${n}`).setColor(n > 0 ? '#ffffff' : '#e07a7a');
    };
    const usePotion = (): void => {
      if (this.time.now < this.potionReadyAt) return;
      const id = POTION_IDS.find((pid) => (gameState.consumables[pid] ?? 0) > 0);
      if (!id) return;
      if (gameState.useConsumable(id)) {
        this.potionReadyAt = this.time.now + 1200;
        bus.emit('sfx:play', { id: 'heal' });
        bus.emit('skill:cooldown', { slot: 3, duration: 1200 });
      }
    };
    potBtn.onChange = (d) => {
      if (d) usePotion();
    };
    refreshPotions();
    this.busOff.push(bus.on('inventory:changed', refreshPotions));
    this.busOff.push(bus.on('game:load', refreshPotions));
    this.usePotionByKey = usePotion;

    // Cooldown sweep overlays for the two skill buttons (slot 0 = S1, 1 = S2).
    const cdGeom = [
      { x: baseX - 76, y: baseY + 6, r: 28 },
      { x: baseX - 60, y: baseY - 58, r: 26 },
      { x: baseX + 2, y: baseY - 76, r: 26 }, // dodge (slot 2)
      { x: baseX - 64, y: baseY - 122, r: 24 }, // potion (slot 3)
    ];
    const cdGfx = cdGeom.map(() => this.add.graphics().setDepth(depth + 1));
    this.busOff.push(
      bus.on('skill:cooldown', ({ slot, duration }) => {
        const g = cdGfx[slot];
        const geom = cdGeom[slot];
        if (!g || !geom || duration <= 0) return;
        this.tweens.killTweensOf(g);
        const prog = { t: 1 };
        this.tweens.add({
          targets: prog,
          t: 0,
          duration,
          ease: 'Linear',
          onUpdate: () => {
            g.clear();
            g.fillStyle(0x000000, 0.5);
            g.slice(geom.x, geom.y, geom.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog.t, false);
            g.fillPath();
          },
          onComplete: () => g.clear(),
        });
      }),
    );

    // Interact button appears only when something is interactable (top area).
    this.interactBtn = new TouchButton(this, w / 2, h - bottomPad - 110, 28, '調', 0x44aa66, depth);
    this.interactBtn.onChange = (d) => input.setButton('interact', d);
    this.interactBtn.setVisible(false);

    // HUD (top, clear of the notch). HP/MP as labelled, framed bars with the
    // value right-aligned inside (a common RPG layout, our own styling).
    const hudX = insets.left + 8;
    const BAR_W = 152;
    const BAR_H = 16;
    const makeBar = (y: number, color: number): Phaser.GameObjects.Rectangle => {
      this.add
        .rectangle(hudX, y, BAR_W, BAR_H, UI.panel, 0.7)
        .setOrigin(0, 0)
        .setDepth(depth)
        .setStrokeStyle(1, 0xffffff, 0.25);
      return this.add
        .rectangle(hudX + 1, y + 1, BAR_W - 2, BAR_H - 2, color, 1)
        .setOrigin(0, 0)
        .setDepth(depth);
    };
    const barLabel = (y: number, t: string): void => {
      this.add
        .text(hudX + 5, y + 2, t, {
          fontFamily: FONT,
          fontSize: '11px',
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setDepth(depth + 1);
    };
    const barValue = (y: number): Phaser.GameObjects.Text =>
      this.add
        .text(hudX + BAR_W - 5, y + 2, '', {
          fontFamily: FONT,
          fontSize: '12px',
          color: '#ffffff',
        })
        .setOrigin(1, 0)
        .setDepth(depth + 1);

    // Low-HP danger vignette: red glow hugging the screen edges, pulsing while
    // HP is critical. Drawn as nested fading border bands (pixel-art friendly,
    // no blur). Sits just under the HUD/controls.
    this.lowHpVignette = this.add.graphics().setDepth(depth - 1).setScrollFactor(0).setVisible(false);
    const bands = 9;
    for (let i = 0; i < bands; i++) {
      const a = 0.22 * (1 - i / bands);
      this.lowHpVignette.lineStyle(2, 0xff2030, a);
      this.lowHpVignette.strokeRect(i, i, w - i * 2, h - i * 2);
    }

    this.hpBar = makeBar(insets.top + 4, 0xef8a3c);
    barLabel(insets.top + 4, 'HP');
    this.hpText = barValue(insets.top + 4);
    this.busOff.push(
      bus.on('player:hp-changed', ({ current, max }) => {
        this.hpText.setText(`${current}/${max}`);
        this.hpBar.scaleX = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
        this.updateLowHpVignette(max > 0 ? current / max : 0);
      }),
    );

    this.mpBar = makeBar(insets.top + 24, 0x3aa0e0);
    barLabel(insets.top + 24, 'MP');
    this.mpText = barValue(insets.top + 24);
    this.busOff.push(
      bus.on('player:mp-changed', ({ current, max }) => {
        this.mpText.setText(`${current}/${max}`);
        this.mpBar.scaleX = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
      }),
    );

    // Level + job in a matching framed box, directly under the MP bar.
    const lvY = insets.top + 44;
    this.add
      .rectangle(hudX, lvY, BAR_W, BAR_H, UI.panel, 0.7)
      .setOrigin(0, 0)
      .setDepth(depth)
      .setStrokeStyle(1, 0xffffff, 0.25);
    this.jobText = this.add
      .text(hudX + 5, lvY + 2, '', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#ffe9a8',
        fontStyle: 'bold',
      })
      .setDepth(depth + 1);
    const refreshJob = (): void => {
      const name = getJob(gameState.jobId)?.name ?? gameState.jobId;
      this.jobText.setText(`Lv ${gameState.level}  ${name}`);
    };
    refreshJob();
    this.busOff.push(bus.on('job:changed', refreshJob));
    this.busOff.push(bus.on('player:level-up', refreshJob));

    // EXP as a labelled bar under the level box (value = current/toNext),
    // kept in sync with exp gains and level-ups.
    const expY = insets.top + 64;
    this.expBar = makeBar(expY, 0xf5c542);
    barLabel(expY, 'EXP');
    this.expText = barValue(expY);
    const setExp = (cur: number, toNext: number): void => {
      this.expText.setText(`${cur}/${toNext}`);
      this.expBar.scaleX = toNext > 0 ? Phaser.Math.Clamp(cur / toNext, 0, 1) : 0;
    };
    setExp(gameState.exp, expToNext(gameState.level));
    this.busOff.push(bus.on('player:exp-changed', ({ current, toNext }) => setExp(current, toNext)));
    this.busOff.push(
      bus.on('player:level-up', () => setExp(gameState.exp, expToNext(gameState.level))),
    );

    // Gold under the EXP bar. Coin icon + amount — a bare "G" suffix reads as
    // "6" at this size in the dot font.
    const goldY = insets.top + 86;
    this.add
      .circle(insets.left + 13, goldY + 8, 5, 0xf5c542)
      .setStrokeStyle(1.5, 0x8a6a1a, 1)
      .setDepth(depth);
    this.goldText = this.add
      .text(insets.left + 22, goldY, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ffd86b',
      })
      .setDepth(depth);
    this.busOff.push(
      bus.on('gold:changed', ({ current }) => this.goldText.setText(`${current}`)),
    );

    // Buff indicator: shows while a temporary skill buff is active.
    const buffChip = this.add
      .text(hudX + 64, goldY, '▲強化中', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#ffd86b',
        backgroundColor: '#00000066',
        padding: { x: 3, y: 1 },
      })
      .setDepth(depth)
      .setVisible(false);
    this.busOff.push(
      bus.on('player:stats-recomputed', () => buffChip.setVisible(gameState.tempBuffs.length > 0)),
    );

    // Quest tracker: current goal pinned under the HUD block so the player
    // always knows what to do next ("game tells, player does, game rewards").
    const trY = insets.top + 106;
    const trTitle = this.add
      .text(hudX, trY, '', {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#ffe9a8',
        backgroundColor: '#00000066',
        padding: { x: 4, y: 2 },
      })
      .setDepth(depth);
    const trObj = this.add
      .text(hudX, trY + 19, '', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#cfd3e6',
        backgroundColor: '#00000066',
        padding: { x: 4, y: 2 },
      })
      .setDepth(depth);
    const refreshTracker = (): void => {
      // First incomplete active quest; if everything is done, prompt to report.
      const active = gameState.activeQuests
        .map((id) => getQuest(id))
        .filter((q): q is NonNullable<typeof q> => !!q);
      const current = active.find((q) => !isComplete(gameState, q.id)) ?? active[0];
      if (!current) {
        trTitle.setText('').setVisible(false);
        trObj.setText('').setVisible(false);
        return;
      }
      trTitle.setVisible(true);
      trObj.setVisible(true);
      if (isComplete(gameState, current.id)) {
        trTitle.setText(`▶ ${current.name}`);
        trObj.setText('達成！ 掲示板で報告しよう');
        trObj.setColor('#ffd86b');
      } else {
        trTitle.setText(`▶ ${current.name}`);
        trObj.setColor('#cfd3e6');
        trObj.setText(
          current.objectives
            .map((o) => {
              const name = getEnemyDef(o.enemyId)?.name ?? o.enemyId;
              return `${name} ${objectiveProgress(gameState, current.id, o.enemyId)}/${o.count}`;
            })
            .join('・'),
        );
      }
    };
    refreshTracker();
    this.busOff.push(bus.on('quest:changed', refreshTracker));

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
        fontFamily: FONT,
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

  /** Show/pulse the danger vignette when HP is critical (≤ 30%). */
  private updateLowHpVignette(ratio: number): void {
    const critical = ratio > 0 && ratio <= 0.3;
    if (critical) {
      if (!this.lowHpVignette.visible) {
        this.lowHpVignette.setVisible(true);
        this.lowHpVignette.setAlpha(0.5);
        this.lowHpTween = this.tweens.add({
          targets: this.lowHpVignette,
          alpha: 1,
          duration: 520,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.InOut',
        });
      }
    } else if (this.lowHpVignette.visible) {
      this.lowHpTween?.stop();
      this.lowHpTween = null;
      this.lowHpVignette.setVisible(false);
    }
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
    const keys = kb.addKeys('W,A,S,D,J,K,L,E,Q,SPACE,UP,DOWN,LEFT,RIGHT') as Record<
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
      input.setButton('dodge', keys.SPACE.isDown);
      if (keys.Q.isDown && !this.qWasDown) this.usePotionByKey?.();
      this.qWasDown = keys.Q.isDown;
    };
    this.events.on('update', onUpdate);
    this.busOff.push(() => this.events.off('update', onUpdate));
  }
}
