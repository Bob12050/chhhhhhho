import Phaser from 'phaser';
import { input } from '@/input/input-state';
import { VirtualStick } from '@/input/virtual-stick';
import { TouchButton } from '@/input/touch-button';
import { readInsets } from '@/core/safe-area';
import { bus } from '@/core/event-bus';
import { gameState } from '@/player/game-state';
import { getJob } from '@/jobs/job-defs';
import { getMap } from '@/maps/map-def';
import { getQuest } from '@/quests/quest-defs';
import { isComplete, objectiveProgress } from '@/quests/quests';
import { getEnemyDef } from '@/enemies/enemy-defs';
import { expToNext } from '@/stats/leveling';
import { FONT, HUD_DEPTH } from '@/ui/theme';
import { TEX, UI_FRAME_SLICE } from '@/assets/gen/textures';
import { TutorialCoach } from '@/ui/tutorial-coach';

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
  private coach: TutorialCoach | null = null;

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

    const depth = HUD_DEPTH;

    // Virtual stick on the lower-left half.
    this.stick = new VirtualStick(
      this,
      new Phaser.Geom.Rectangle(0, h * 0.45, w * 0.5, h * 0.55),
      depth,
    );

    // Buttons lower-right, above the home indicator.
    const baseX = w - insets.right - 44;
    const baseY = h - bottomPad - 44;

    const attackBtn = new TouchButton(this, baseX, baseY, 32, '', 0xcc4444, depth, TEX.iconSword);
    attackBtn.onChange = (d) => input.setButton('attack', d);

    const skillBtn = new TouchButton(this, baseX - 76, baseY + 6, 28, 'S1', 0x4466cc, depth);
    skillBtn.onChange = (d) => input.setButton('skill1', d);

    const skill2Btn = new TouchButton(this, baseX - 60, baseY - 58, 26, 'S2', 0x5a4abf, depth);
    skill2Btn.onChange = (d) => input.setButton('skill2', d);

    const dodgeBtn = new TouchButton(this, baseX + 2, baseY - 76, 26, '回避', 0x3f9a6e, depth, TEX.iconRoll);
    dodgeBtn.onChange = (d) => input.setButton('dodge', d);

    // Potion quick-slot: one tap heals mid-fight (no menu). Uses the smallest
    // HP potion first; greys out at zero; short cooldown against panic-chugs.
    const POTION_IDS = ['potion_hp', 'potion_hp_l'];
    const potBtn = new TouchButton(this, baseX - 64, baseY - 122, 24, '', 0xc04a5a, depth, TEX.iconFlask);
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

    // Safe zone (town): dim the combat buttons so the screen isn't "戦闘UI全開".
    const combatButtons = [attackBtn, skillBtn, skill2Btn, dodgeBtn, potBtn];
    const setCombatDim = (dim: boolean): void => combatButtons.forEach((b) => b.setDimmed(dim));
    setCombatDim(!!getMap(gameState.mapId)?.safe);
    this.busOff.push(bus.on('world:map-ready', ({ safe }) => setCombatDim(safe)));

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

    // ── statusPanel: HP/MP/EXP/Lv/職業/所持金 を1コンテナに統合（個別配置しない）
    const px = insets.left + 8;
    const py = insets.top + 8;
    const PW = 206;
    const PH = 100;
    const panel = this.add.container(px, py).setDepth(depth); // statusPanel
    const sl = UI_FRAME_SLICE;
    panel.add(
      this.add
        .nineslice(PW / 2, PH / 2 + 4, TEX.uiFrame, undefined, PW, PH, sl, sl, sl, sl)
        .setTint(0x000000)
        .setAlpha(0.28),
    );
    panel.add(this.add.nineslice(PW / 2, PH / 2, TEX.uiFrame, undefined, PW, PH, sl, sl, sl, sl));

    // Low-HP danger vignette (full screen, just under the HUD).
    this.lowHpVignette = this.add.graphics().setDepth(depth - 1).setScrollFactor(0).setVisible(false);
    for (let i = 0; i < 9; i++) {
      this.lowHpVignette.lineStyle(2, 0xff2030, 0.22 * (1 - i / 9));
      this.lowHpVignette.strokeRect(i, i, w - i * 2, h - i * 2);
    }

    // Left: job/family emblem cell.
    const emblemFor = (): { tex: string; color: number } => {
      const fam = getJob(gameState.jobId)?.family ?? '';
      const m: Record<string, { tex: string; color: number }> = {
        warrior: { tex: TEX.iconSword, color: 0xcc5a5a },
        mage: { tex: TEX.iconStaff, color: 0x5a9ad0 },
        cleric: { tex: TEX.iconShield, color: 0xf5c542 },
        thief: { tex: TEX.iconBow, color: 0x6db06a },
        tamer: { tex: TEX.iconRing, color: 0xb07ad0 },
      };
      return m[fam] ?? { tex: TEX.iconGem, color: 0x9fd0ff };
    };
    const em0 = emblemFor();
    const cell = this.add.graphics();
    cell.fillStyle(0x1c2036, 1);
    cell.fillRoundedRect(8, 12, 44, 44, 8);
    cell.lineStyle(1.5, 0x46508a, 0.9);
    cell.strokeRoundedRect(8, 12, 44, 44, 8);
    panel.add(cell);
    const jobIcon = this.add.image(30, 34, em0.tex).setScale(2).setTint(em0.color);
    panel.add(jobIcon);

    // Right column: Lv/職業 + HP/MP/EXP bars.
    const rx = 58;
    const rw = PW - rx - 10; // 138
    this.jobText = this.add.text(rx, 6, '', {
      fontFamily: FONT,
      fontSize: '12px',
      color: '#ffe9a8',
      fontStyle: 'bold',
    });
    panel.add(this.jobText);
    const refreshJob = (): void => {
      this.jobText.setText(`Lv ${gameState.level}  ${getJob(gameState.jobId)?.name ?? gameState.jobId}`);
      const em = emblemFor();
      jobIcon.setTexture(em.tex).setTint(em.color);
    };

    const makeBar = (by: number, bh: number, color: number): Phaser.GameObjects.Rectangle => {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(rx, by + 1.5, rw, bh, bh / 2);
      g.fillStyle(0x0e1220, 0.95);
      g.fillRoundedRect(rx, by, rw, bh, bh / 2);
      g.lineStyle(1, 0xffffff, 0.08);
      g.strokeRoundedRect(rx, by, rw, bh, bh / 2);
      panel.add(g);
      const fill = this.add.rectangle(rx + 2, by + 2, rw - 4, bh - 4, color, 1).setOrigin(0, 0);
      panel.add(fill);
      return fill;
    };
    const barText = (by: number, bh: number, label: string): Phaser.GameObjects.Text => {
      const lab = this.add
        .text(rx + 5, by + bh / 2, label, { fontFamily: FONT, fontSize: '9px', color: '#ffffff' })
        .setOrigin(0, 0.5)
        .setAlpha(0.7);
      lab.setShadow(0, 1, '#000000', 2);
      panel.add(lab);
      const val = this.add
        .text(rx + rw - 4, by + bh / 2, '', { fontFamily: FONT, fontSize: '10px', color: '#ffffff' })
        .setOrigin(1, 0.5);
      val.setShadow(0, 1, '#000000', 2);
      panel.add(val);
      return val;
    };

    this.hpBar = makeBar(28, 12, 0xef8a3c);
    this.hpText = barText(28, 12, 'HP');
    this.mpBar = makeBar(46, 12, 0x3aa0e0);
    this.mpText = barText(46, 12, 'MP');
    this.expBar = makeBar(64, 8, 0xf5c542);
    this.expText = barText(64, 8, 'EXP');

    // Gold at panel bottom (coin + amount).
    panel.add(this.add.circle(rx + 6, 88, 5, 0xf5c542).setStrokeStyle(1.5, 0x8a6a1a, 1));
    this.goldText = this.add.text(rx + 16, 82, '', { fontFamily: FONT, fontSize: '12px', color: '#ffd86b' });
    panel.add(this.goldText);

    // Buff indicator (panel bottom-right; shows while a temp buff is active).
    const buffChip = this.add
      .text(150, 84, '▲強化', { fontFamily: FONT, fontSize: '10px', color: '#ffd86b' })
      .setVisible(false);
    panel.add(buffChip);

    // Initial values (bars need a fill before the first bus event).
    const d0 = gameState.derived;
    this.hpText.setText(`${gameState.hp}/${d0.maxHp}`);
    this.hpBar.scaleX = d0.maxHp > 0 ? Phaser.Math.Clamp(gameState.hp / d0.maxHp, 0, 1) : 0;
    this.mpText.setText(`${gameState.mp}/${d0.maxMp}`);
    this.mpBar.scaleX = d0.maxMp > 0 ? Phaser.Math.Clamp(gameState.mp / d0.maxMp, 0, 1) : 0;
    this.goldText.setText(`${gameState.gold}`);
    refreshJob();

    // Bus wiring.
    this.busOff.push(bus.on('job:changed', refreshJob));
    this.busOff.push(bus.on('player:level-up', refreshJob));
    this.busOff.push(
      bus.on('player:hp-changed', ({ current, max }) => {
        this.hpText.setText(`${current}/${max}`);
        this.hpBar.scaleX = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
        this.updateLowHpVignette(max > 0 ? current / max : 0);
      }),
    );
    this.busOff.push(
      bus.on('player:mp-changed', ({ current, max }) => {
        this.mpText.setText(`${current}/${max}`);
        this.mpBar.scaleX = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
      }),
    );
    const setExp = (cur: number, toNext: number): void => {
      this.expText.setText(`${cur}/${toNext}`);
      this.expBar.scaleX = toNext > 0 ? Phaser.Math.Clamp(cur / toNext, 0, 1) : 0;
    };
    setExp(gameState.exp, expToNext(gameState.level));
    this.busOff.push(bus.on('player:exp-changed', ({ current, toNext }) => setExp(current, toNext)));
    this.busOff.push(bus.on('player:level-up', () => setExp(gameState.exp, expToNext(gameState.level))));
    this.busOff.push(bus.on('gold:changed', ({ current }) => this.goldText.setText(`${current}`)));
    this.busOff.push(
      bus.on('player:stats-recomputed', () => buffChip.setVisible(gameState.tempBuffs.length > 0)),
    );

    // Quest tracker: current goal pinned under the HUD block so the player
    // always knows what to do next ("game tells, player does, game rewards").
    // A small rounded card with a gold quest marker — not a debug text box.
    const hudX = insets.left + 8;
    const trY = insets.top + 8 + 100 + 8; // just below the statusPanel
    const trW = 176;
    const trPanel = this.add.graphics().setDepth(depth);
    trPanel.fillStyle(0x141726, 0.82);
    trPanel.fillRoundedRect(hudX - 2, trY - 4, trW, 42, 7);
    trPanel.fillStyle(0xf5c542, 0.9);
    trPanel.fillRoundedRect(hudX - 2, trY - 4, 3, 42, { tl: 7, bl: 7, tr: 0, br: 0 });
    trPanel.lineStyle(1, 0xffffff, 0.07);
    trPanel.strokeRoundedRect(hudX - 2, trY - 4, trW, 42, 7);
    const trTitle = this.add
      .text(hudX + 8, trY, '', { fontFamily: FONT, fontSize: '11px', color: '#ffe9a8' })
      .setDepth(depth);
    const trObj = this.add
      .text(hudX + 8, trY + 19, '', { fontFamily: FONT, fontSize: '10px', color: '#cfd3e6' })
      .setDepth(depth);
    const setTrackerVisible = (v: boolean): void => {
      trPanel.setVisible(v);
      trTitle.setVisible(v);
      trObj.setVisible(v);
    };
    const refreshTracker = (): void => {
      // First incomplete active quest; if everything is done, prompt to report.
      const active = gameState.activeQuests
        .map((id) => getQuest(id))
        .filter((q): q is NonNullable<typeof q> => !!q);
      const current = active.find((q) => !isComplete(gameState, q.id)) ?? active[0];
      if (!current) {
        trTitle.setText('');
        trObj.setText('');
        setTrackerVisible(false);
        return;
      }
      setTrackerVisible(true);
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
    const bag = new TouchButton(this, w - insets.right - 24, insets.top + 26, 22, '', 0x6a4ea0, depth, TEX.iconBag);
    bag.onChange = (down) => {
      if (down) bus.emit('ui:open-inventory', {});
    };

    // Map button (below the bag) opens the fast-travel list.
    const mapBtn = new TouchButton(this, w - insets.right - 24, insets.top + 74, 22, '', 0x4e7aa0, depth, TEX.iconMap);
    mapBtn.onChange = (down) => {
      if (down) bus.emit('ui:open-map', {});
    };

    // (Debug entry is a separate dev overlay — see DebugOverlayScene. It is never
    // shown in normal play, so nothing debug-related is created here.)

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

    // First-run guided tutorial (move → attack → bag → goal). Only for a save
    // that hasn't seen it; the coach persists the flag itself on finish/skip.
    if (TutorialCoach.shouldShow()) {
      this.coach = new TutorialCoach(
        this,
        {
          stick: { x: insets.left + 60, y: baseY },
          attack: { x: baseX, y: baseY },
          bag: { x: w - insets.right - 24, y: insets.top + 26 },
        },
        depth + 20,
      );
      this.coach.start();
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.busOff) off();
      this.busOff = [];
      this.coach?.destroy();
      this.coach = null;
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
