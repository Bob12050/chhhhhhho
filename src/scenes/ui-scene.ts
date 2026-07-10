import Phaser from 'phaser';
import { input } from '@/input/input-state';
import { VirtualStick } from '@/input/virtual-stick';
import { TouchButton } from '@/input/touch-button';
import { readInsets } from '@/core/safe-area';
import { bus, type GameEvents } from '@/core/event-bus';
import { gameState } from '@/player/game-state';
import { getJob } from '@/jobs/job-defs';
import { getMap } from '@/maps/map-def';
import { getQuest } from '@/quests/quest-defs';
import { isComplete, objectiveProgress } from '@/quests/quests';
import { getEnemyDef } from '@/enemies/enemy-defs';
import { ELEMENT_LABEL, elementColorHex, isElement } from '@/combat/elements';
import { expToNext } from '@/stats/leveling';
import { FONT, HUD_DEPTH } from '@/ui/theme';
import { TEX, UI_FRAME_SLICE } from '@/assets/gen/textures';
import { TutorialCoach } from '@/ui/tutorial-coach';
import { isUpdateReady } from '@/core/pwa';

/**
 * Always-on UI overlay: virtual stick (lower-left), attack + skill + interact
 * buttons (lower-right), compact hunter/quest panels, and a live minimap.
 * Renders above the world and keeps controls clear of the home-indicator safe
 * area. Also provides a dev keyboard fallback.
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
  private bossIntroRoot: Phaser.GameObjects.Container | null = null;

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
    const fitText = (txt: Phaser.GameObjects.Text, value: string, maxWidth: number): void => {
      let s = value;
      txt.setText(s);
      while (txt.width > maxWidth && s.length > 2) {
        s = s.slice(0, -2);
        txt.setText(`${s}...`);
      }
    };

    // Virtual stick on the lower-left half.
    this.stick = new VirtualStick(
      this,
      new Phaser.Geom.Rectangle(0, h * 0.45, w * 0.5, h * 0.55),
      depth,
    );

    // Buttons lower-right, above the home indicator.
    const baseX = w - insets.right - 44;
    const baseY = h - bottomPad - 44;

    // A quiet control deck groups the combat buttons without boxing in the
    // playfield. Its connectors make the lower-right read as one instrument.
    const actionDeck = this.add.graphics().setDepth(depth - 1);
    const deckX = baseX - 28;
    const deckY = baseY - 58;
    actionDeck.fillStyle(0x07101c, 0.28);
    actionDeck.fillCircle(deckX, deckY, 104);
    actionDeck.lineStyle(1, 0x9fd0ff, 0.2);
    actionDeck.strokeCircle(deckX, deckY, 104);
    actionDeck.lineStyle(2, 0xf5c542, 0.38);
    actionDeck.lineBetween(baseX - 76, baseY + 6, baseX - 60, baseY - 58);
    actionDeck.lineBetween(baseX - 60, baseY - 58, baseX + 2, baseY - 76);
    actionDeck.lineStyle(1, 0xffffff, 0.14);
    actionDeck.lineBetween(baseX - 64, baseY - 122, baseX - 60, baseY - 58);

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
    const setCombatDim = (dim: boolean): void => {
      combatButtons.forEach((b) => b.setDimmed(dim));
      actionDeck.setAlpha(dim ? 0.38 : 1);
    };
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
    const PW = 174;
    const PH = 70;
    const panel = this.add.container(px, py).setDepth(depth); // statusPanel
    const sl = UI_FRAME_SLICE;
    panel.add(
      this.add
        .nineslice(PW / 2, PH / 2 + 4, TEX.uiFrame, undefined, PW, PH, sl, sl, sl, sl)
        .setTint(0x000000)
        .setAlpha(0.34),
    );
    panel.add(this.add.nineslice(PW / 2, PH / 2, TEX.uiFrame, undefined, PW, PH, sl, sl, sl, sl));
    const panelAccent = this.add.graphics();
    panelAccent.fillStyle(0xf5c542, 0.9);
    panelAccent.fillRoundedRect(9, 9, 3, PH - 18, 2);
    panelAccent.fillStyle(0xffffff, 0.08);
    panelAccent.fillRoundedRect(16, 7, PW - 24, 14, { tl: 7, tr: 7, bl: 0, br: 0 });
    panelAccent.lineStyle(1, 0xffffff, 0.07);
    panelAccent.lineBetween(52, 10, 52, PH - 10);
    panel.add(panelAccent);

    // Low-HP danger vignette (full screen, just under the HUD).
    this.lowHpVignette = this.add.graphics().setDepth(depth - 1).setScrollFactor(0).setVisible(false);
    for (let i = 0; i < 9; i++) {
      this.lowHpVignette.lineStyle(2, 0xff2030, 0.22 * (1 - i / 9));
      this.lowHpVignette.strokeRect(i, i, w - i * 2, h - i * 2);
    }

    // Left: compact job/family emblem cell. The battle HUD deliberately keeps
    // only identity and survival info; economy/progression live in the bag.
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
    const drawEmblemCell = (color: number): void => {
      cell.clear();
      cell.fillStyle(0x0b1020, 0.7);
      cell.fillRoundedRect(15, 12, 34, 38, 8);
      cell.fillStyle(0x202949, 1);
      cell.fillRoundedRect(11, 8, 40, 40, 8);
      cell.fillStyle(0xffffff, 0.1);
      cell.fillRoundedRect(14, 11, 34, 12, { tl: 7, tr: 7, bl: 0, br: 0 });
      cell.lineStyle(2, color, 0.9);
      cell.strokeRoundedRect(11, 8, 40, 40, 8);
      cell.lineStyle(1, 0xffffff, 0.16);
      cell.strokeCircle(31, 28, 13);
    };
    drawEmblemCell(em0.color);
    panel.add(cell);
    const jobIcon = this.add.image(31, 28, em0.tex).setScale(1.7).setTint(em0.color);
    panel.add(jobIcon);
    const lvBadge = this.add.graphics();
    lvBadge.fillStyle(0x10121c, 0.94);
    lvBadge.fillRoundedRect(12, 52, 38, 14, 7);
    lvBadge.lineStyle(1, 0xf5c542, 0.45);
    lvBadge.strokeRoundedRect(12, 52, 38, 14, 7);
    panel.add(lvBadge);
    const levelText = this.add
      .text(31, 59, '', { fontFamily: FONT, fontSize: '9px', color: '#ffd86b', fontStyle: 'bold' })
      .setOrigin(0.5);
    panel.add(levelText);

    // Right column: job + HP/MP. The XP line is intentionally quiet.
    const rx = 59;
    const rw = PW - rx - 10; // 105
    this.jobText = this.add.text(rx, 6, '', {
      fontFamily: FONT,
      fontSize: '11px',
      color: '#ffe9a8',
      fontStyle: 'bold',
    });
    panel.add(this.jobText);
    const refreshJob = (): void => {
      levelText.setText(`Lv${gameState.level}`);
      fitText(this.jobText, getJob(gameState.jobId)?.name ?? gameState.jobId, rw);
      const em = emblemFor();
      jobIcon.setTexture(em.tex).setTint(em.color);
      drawEmblemCell(em.color);
    };

    const makeBar = (by: number, bh: number, color: number): Phaser.GameObjects.Rectangle => {
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.34);
      g.fillRoundedRect(rx, by + 2, rw, bh, bh / 2);
      g.fillStyle(0x0e1220, 0.95);
      g.fillRoundedRect(rx, by, rw, bh, bh / 2);
      g.fillStyle(color, 0.22);
      g.fillRoundedRect(rx + 1, by + 1, rw - 2, Math.max(2, Math.floor(bh / 2)), bh / 2);
      g.lineStyle(1, 0xffffff, 0.08);
      g.strokeRoundedRect(rx, by, rw, bh, bh / 2);
      panel.add(g);
      const fill = this.add.rectangle(rx + 2, by + 2, rw - 4, bh - 4, color, 1).setOrigin(0, 0);
      panel.add(fill);
      return fill;
    };
    const barText = (by: number, bh: number, label: string): Phaser.GameObjects.Text => {
      const lab = this.add
        .text(rx + 5, by + bh / 2, label, { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
        .setOrigin(0, 0.5)
        .setAlpha(0.76);
      lab.setShadow(0, 1, '#000000', 2);
      panel.add(lab);
      const val = this.add
        .text(rx + rw - 5, by + bh / 2, '', { fontFamily: FONT, fontSize: '9px', color: '#ffffff' })
        .setOrigin(1, 0.5);
      val.setShadow(0, 1, '#000000', 2);
      panel.add(val);
      return val;
    };

    this.hpBar = makeBar(24, 11, 0xef8a3c);
    this.hpText = barText(24, 11, 'HP');
    this.mpBar = makeBar(41, 11, 0x3aa0e0);
    this.mpText = barText(41, 11, 'MP');
    this.expBar = makeBar(58, 5, 0xf5c542);
    this.expText = this.add.text(0, 0, '').setVisible(false);
    this.goldText = this.add.text(0, 0, '').setVisible(false);

    // Initial values (bars need a fill before the first bus event).
    const d0 = gameState.derived;
    this.hpText.setText(`${gameState.hp}/${d0.maxHp}`);
    this.hpBar.scaleX = d0.maxHp > 0 ? Phaser.Math.Clamp(gameState.hp / d0.maxHp, 0, 1) : 0;
    this.mpText.setText(`${gameState.mp}/${d0.maxMp}`);
    this.mpBar.scaleX = d0.maxMp > 0 ? Phaser.Math.Clamp(gameState.mp / d0.maxMp, 0, 1) : 0;
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

    // Quest tracker: current goal pinned under the HUD block so the player
    // always knows what to do next ("game tells, player does, game rewards").
    // A small framed quest card, visually tied to the status panel.
    const hudX = insets.left + 8;
    const trY = insets.top + 8 + PH + 5; // just below the statusPanel
    const trW = 174;
    const trH = 34;
    const trRoot = this.add.container(hudX, trY).setDepth(depth);
    trRoot.add(
      this.add
        .nineslice(trW / 2, trH / 2 + 3, TEX.uiFrame, undefined, trW, trH, sl, sl, sl, sl)
        .setTint(0x000000)
        .setAlpha(0.22),
    );
    trRoot.add(
      this.add
        .nineslice(trW / 2, trH / 2, TEX.uiFrame, undefined, trW, trH, sl, sl, sl, sl)
        .setTint(0x9aa6d8)
        .setAlpha(0.9),
    );
    const trMark = this.add.graphics();
    trMark.fillStyle(0xf5c542, 0.95);
    trMark.fillRoundedRect(9, 8, 22, 18, 7);
    trMark.fillStyle(0x15182a, 0.96);
    trMark.fillRoundedRect(12, 11, 16, 12, 5);
    trMark.lineStyle(1, 0xffffff, 0.12);
    trMark.lineBetween(38, 7, 38, trH - 7);
    trRoot.add(trMark);
    trRoot.add(this.add.image(20, 17, TEX.iconGem).setScale(1).setTint(0xf5c542));
    const trTitle = this.add
      .text(46, 4, '', { fontFamily: FONT, fontSize: '10px', color: '#ffe9a8', fontStyle: 'bold' })
      .setShadow(0, 1, '#000000', 2);
    const trObj = this.add
      .text(46, 18, '', { fontFamily: FONT, fontSize: '9px', color: '#cfd3e6' })
      .setShadow(0, 1, '#000000', 2);
    trRoot.add([trTitle, trObj]);
    // While a boss HP card is up it borrows this exact HUD slot, so the
    // tracker yields (the objective IS the boss on screen anyway).
    let bossBarActive = false;
    const setTrackerVisible = (v: boolean): void => {
      trRoot.setVisible(v && !bossBarActive);
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
        fitText(trTitle, current.name, trW - 52);
        fitText(trObj, '達成！ 掲示板で報告しよう', trW - 52);
        trObj.setColor('#ffd86b');
      } else {
        fitText(trTitle, current.name, trW - 52);
        trObj.setColor('#cfd3e6');
        fitText(
          trObj,
          current.objectives
              .map((o) => {
                const name = getEnemyDef(o.enemyId)?.name ?? o.enemyId;
                return `${name} ${objectiveProgress(gameState, current.id, o.enemyId)}/${o.count}`;
              })
              .join('・'),
          trW - 52,
        );
      }
    };
    refreshTracker();
    this.busOff.push(bus.on('quest:changed', refreshTracker));
    this.busOff.push(
      bus.on('boss:bar', ({ active }) => {
        bossBarActive = active;
        refreshTracker();
      }),
    );
    this.busOff.push(bus.on('boss:intro', (data) => this.showBossIntro(data)));

    // Live minimap: intentionally compact, but it gives the upper-right a
    // recognisable RPG silhouette and makes map position visible at a glance.
    const miniSize = 82;
    const miniInner = 68;
    const miniX = w - insets.right - 46;
    const miniY = insets.top + 46;
    const miniG = this.add.graphics();
    const miniDot = this.add.circle(0, 0, 3.5, 0xffe16a).setStrokeStyle(1.5, 0x2a1820, 1);
    const miniNorth = this.add
      .text(0, -31, 'N', { fontFamily: FONT, fontSize: '8px', color: '#d9e8ff', fontStyle: 'bold' })
      .setOrigin(0.5);
    const miniName = this.add
      .text(0, 48, '', { fontFamily: FONT, fontSize: '8px', color: '#d9e8ff' })
      .setOrigin(0.5)
      .setShadow(0, 1, '#000000', 2);
    const miniRoot = this.add.container(miniX, miniY, [miniG, miniDot, miniNorth, miniName]).setDepth(depth);
    miniRoot.setSize(miniSize, miniSize).setInteractive({ useHandCursor: true });
    miniRoot.on('pointerup', () => bus.emit('ui:open-map', {}));

    let miniMap = getMap(gameState.mapId);
    let miniWidth = miniMap?.size.w ?? 1;
    let miniHeight = miniMap?.size.h ?? 1;
    const drawMiniMap = (x: number, y: number): void => {
      const half = miniInner / 2;
      const ground = miniMap?.ground === 'stone' ? 0x536172 : miniMap?.ground === 'floor' ? 0x62515e : 0x45694a;
      miniG.clear();
      miniG.fillStyle(0x050912, 0.84);
      miniG.fillRoundedRect(-miniSize / 2, -miniSize / 2, miniSize, miniSize, 10);
      miniG.fillStyle(ground, 0.95);
      miniG.fillRoundedRect(-half, -half, miniInner, miniInner, 7);
      if (miniMap?.path) {
        miniG.fillStyle(0xc49a62, 0.72);
        const thickness = Math.max(4, Math.round((miniMap.path.thickness / (miniMap.path.axis === 'v' ? miniWidth : miniHeight)) * miniInner));
        if (miniMap.path.axis === 'v') miniG.fillRect(-thickness / 2, -half, thickness, miniInner);
        else miniG.fillRect(-half, -thickness / 2, miniInner, thickness);
      }
      for (const portal of miniMap?.portals ?? []) {
        const px = Phaser.Math.Clamp(((portal.rect[0] + portal.rect[2] / 2) / miniWidth - 0.5) * miniInner, -half + 3, half - 3);
        const py = Phaser.Math.Clamp(((portal.rect[1] + portal.rect[3] / 2) / miniHeight - 0.5) * miniInner, -half + 3, half - 3);
        miniG.fillStyle(portal.requiresFlag && !gameState.flags[portal.requiresFlag] ? 0xc45a62 : 0x8ddcff, 0.95);
        miniG.fillCircle(px, py, 2);
      }
      miniG.lineStyle(2, 0xe9c45f, 0.8);
      miniG.strokeRoundedRect(-miniSize / 2, -miniSize / 2, miniSize, miniSize, 10);
      miniG.lineStyle(1, 0xffffff, 0.12);
      miniG.strokeRoundedRect(-half, -half, miniInner, miniInner, 7);
      miniDot.setPosition(
        Phaser.Math.Clamp((x / miniWidth - 0.5) * miniInner, -half + 4, half - 4),
        Phaser.Math.Clamp((y / miniHeight - 0.5) * miniInner, -half + 4, half - 4),
      );
    };
    const refreshMiniMap = (data: {
      mapId: string;
      mapName?: string;
      mapWidth?: number;
      mapHeight?: number;
      x: number;
      y: number;
    }): void => {
      miniMap = getMap(data.mapId) ?? miniMap;
      miniWidth = data.mapWidth ?? miniMap?.size.w ?? miniWidth;
      miniHeight = data.mapHeight ?? miniMap?.size.h ?? miniHeight;
      miniName.setText(data.mapName ?? miniMap?.name ?? '');
      drawMiniMap(data.x, data.y);
    };
    refreshMiniMap({ mapId: gameState.mapId, x: gameState.x, y: gameState.y });
    this.busOff.push(
      bus.on('world:map-ready', ({ mapId, mapName, mapWidth, mapHeight, playerX, playerY }) =>
        refreshMiniMap({ mapId, mapName, mapWidth, mapHeight, x: playerX, y: playerY }),
      ),
    );
    this.busOff.push(bus.on('world:player-position', ({ mapId, x, y }) => refreshMiniMap({ mapId, x, y })));

    // Bag button stays beside the minimap, so map navigation and inventory
    // read as a compact utility strip instead of two floating controls.
    const bagX = miniX - 64;
    const bagY = insets.top + 28;
    const bag = new TouchButton(this, bagX, bagY, 22, '', 0x6a4ea0, depth, TEX.iconBag);
    bag.onChange = (down) => {
      if (down) bus.emit('ui:open-inventory', {});
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
      .setVisible(isUpdateReady());
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
          bag: { x: bagX, y: bagY },
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
      this.bossIntroRoot?.destroy();
      this.bossIntroRoot = null;
    });
  }

  private showBossIntro(data: GameEvents['boss:intro']): void {
    this.bossIntroRoot?.destroy();
    const w = this.scale.width;
    const h = this.scale.height;
    const depth = HUD_DEPTH + 900;
    const root = this.add.container(0, 0).setDepth(depth);
    this.bossIntroRoot = root;

    const veil = this.add.rectangle(0, 0, w, h, 0x050711, 0.58).setOrigin(0).setAlpha(0);
    const cy = Math.round(h * 0.38);
    const band = this.add.rectangle(w / 2, cy, w, 116, 0x0b0e19, 0.88).setScale(1, 0.08);
    const top = this.add.rectangle(w / 2, cy - 58, w, 2, 0xf5c542, 0).setAlpha(0);
    const bottom = this.add.rectangle(w / 2, cy + 58, w, 2, 0xf5c542, 0).setAlpha(0);
    const rank = data.rank ? `★${data.rank}` : '';
    const title = `${rank} ${data.veteran ? '歴戦個体' : '大型狩猟開始'}`.trim();
    const titleText = this.add
      .text(w / 2, cy - 34, title, { fontFamily: FONT, fontSize: '13px', color: '#ffd86b', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    const bossText = this.add
      .text(w / 2, cy - 6, data.bossName, { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    const questText = this.add
      .text(w / 2, cy + 22, data.questName, { fontFamily: FONT, fontSize: '11px', color: '#cfd3e6' })
      .setOrigin(0.5)
      .setAlpha(0);
    root.add([veil, band, top, bottom, titleText, bossText, questText]);

    if (isElement(data.weakness) && data.weakness !== 'none') {
      const weakness = this.add
        .text(w / 2, cy + 44, `弱点 ${ELEMENT_LABEL[data.weakness]}`, {
          fontFamily: FONT,
          fontSize: '11px',
          color: elementColorHex(data.weakness),
          backgroundColor: '#11182a',
          padding: { x: 8, y: 3 },
        })
        .setOrigin(0.5)
        .setAlpha(0);
      root.add(weakness);
      this.tweens.add({ targets: weakness, alpha: 1, delay: 280, duration: 180 });
    }

    this.tweens.add({ targets: veil, alpha: 1, duration: 180 });
    this.tweens.add({ targets: band, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [top, bottom, titleText, bossText, questText], alpha: 1, delay: 160, duration: 220 });
    this.tweens.add({
      targets: bossText,
      scaleX: 1.04,
      scaleY: 1.04,
      yoyo: true,
      duration: 180,
      delay: 320,
      ease: 'Sine.InOut',
    });
    this.time.delayedCall(data.durationMs, () => {
      this.tweens.add({
        targets: root,
        alpha: 0,
        duration: 260,
        onComplete: () => {
          root.destroy();
          if (this.bossIntroRoot === root) this.bossIntroRoot = null;
        },
      });
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
