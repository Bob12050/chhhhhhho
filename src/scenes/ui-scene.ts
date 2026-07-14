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
import { TEX } from '@/assets/gen/textures';
import { TutorialCoach } from '@/ui/tutorial-coach';
import { isUpdateReady } from '@/core/pwa';
import { INTRO_PENDING_FLAG, INTRO_QUEST_ID } from '@/tutorial/onboarding';

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
  private questStartRoot: Phaser.GameObjects.Container | null = null;
  private questProgressRoot: Phaser.GameObjects.Container | null = null;

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

    const attackBtn = new TouchButton(
      this,
      baseX,
      baseY,
      32,
      '',
      0xcc5555,
      depth,
      TEX.iconSword,
      'primary',
    );
    attackBtn.onChange = (d) => input.setButton('attack', d);

    const skillBtn = new TouchButton(
      this,
      baseX - 76,
      baseY + 6,
      28,
      'S1',
      0x5a78ba,
      depth,
      undefined,
      'secondary',
    );
    skillBtn.onChange = (d) => input.setButton('skill1', d);

    const skill2Btn = new TouchButton(
      this,
      baseX - 60,
      baseY - 58,
      26,
      'S2',
      0x6870b5,
      depth,
      undefined,
      'secondary',
    );
    skill2Btn.onChange = (d) => input.setButton('skill2', d);

    const dodgeBtn = new TouchButton(
      this,
      baseX + 2,
      baseY - 76,
      26,
      '回避',
      0x538e78,
      depth,
      TEX.iconRoll,
      'secondary',
    );
    dodgeBtn.onChange = (d) => input.setButton('dodge', d);

    // Potion quick-slot: one tap heals mid-fight (no menu). Uses the smallest
    // HP potion first; greys out at zero; short cooldown against panic-chugs.
    const POTION_IDS = ['potion_hp', 'potion_hp_l'];
    const potBtn = new TouchButton(
      this,
      baseX - 64,
      baseY - 122,
      24,
      '',
      0xa95765,
      depth,
      TEX.iconFlask,
      'utility',
    );
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
    const cdLabels = cdGeom.map(({ x, y }) =>
      this.add
        .text(x, y, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setDepth(depth + 2)
        .setShadow(0, 1, '#000000', 3)
        .setVisible(false),
    );
    const cdReady = cdGeom.map(({ x, y }) => this.add.graphics().setPosition(x, y).setDepth(depth + 2));
    const cdTweens: Array<Phaser.Tweens.Tween | null> = cdGeom.map(() => null);
    this.busOff.push(
      bus.on('skill:cooldown', ({ slot, duration }) => {
        const g = cdGfx[slot];
        const geom = cdGeom[slot];
        const label = cdLabels[slot];
        const ready = cdReady[slot];
        if (!g || !geom || !label || !ready || duration <= 0) return;
        cdTweens[slot]?.stop();
        ready.clear().setAlpha(0).setScale(1);
        const prog = { remaining: duration };
        const drawCooldown = (): void => {
          const ratio = Phaser.Math.Clamp(prog.remaining / duration, 0, 1);
          g.clear();
          g.fillStyle(0x000000, 0.58);
          g.slice(geom.x, geom.y, geom.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
          g.fillPath();
          const seconds = prog.remaining / 1000;
          label.setText(seconds >= 1 ? `${Math.ceil(seconds)}` : seconds.toFixed(1)).setVisible(true);
        };
        drawCooldown();
        cdTweens[slot] = this.tweens.add({
          targets: prog,
          remaining: 0,
          duration,
          ease: 'Linear',
          onUpdate: drawCooldown,
          onComplete: () => {
            g.clear();
            label.setVisible(false);
            ready.clear();
            ready.lineStyle(2, 0xffe27a, 0.95);
            ready.strokeCircle(0, 0, geom.r + 3);
            ready.setAlpha(1).setScale(0.78);
            this.tweens.add({
              targets: ready,
              alpha: 0,
              scaleX: 1.28,
              scaleY: 1.28,
              duration: 360,
              ease: 'Cubic.Out',
              onComplete: () => ready.clear(),
            });
            cdTweens[slot] = null;
          },
        });
      }),
    );

    // Interact button appears only when something is interactable (top area).
    this.interactBtn = new TouchButton(
      this,
      w / 2,
      h - bottomPad - 110,
      28,
      '調べる',
      0x4f9870,
      depth,
      undefined,
      'primary',
    );
    this.interactBtn.onChange = (d) => input.setButton('interact', d);
    this.interactBtn.setVisible(false);

    // ── statusPanel: HP/MP/EXP/Lv/職業/所持金 を1コンテナに統合（個別配置しない）
    const px = insets.left + 8;
    const py = insets.top + 8;
    const PW = 166;
    const PH = 66;
    const panel = this.add.container(px, py).setDepth(depth); // statusPanel
    const panelBack = this.add.graphics();
    panelBack.fillStyle(0x000000, 0.24);
    panelBack.fillRoundedRect(5, 7, PW - 10, PH - 7, 10);
    panelBack.fillStyle(0x071321, 0.8);
    panelBack.fillRoundedRect(6, 4, PW - 12, PH - 8, 9);
    panelBack.lineStyle(1, 0xffffff, 0.1);
    panelBack.strokeRoundedRect(6, 4, PW - 12, PH - 8, 9);
    panel.add(panelBack);
    panel.add(this.add.circle(31, 34, 19, 0x10213b, 0.9));
    panel.add(
      this.add
        .image(PW / 2, PH / 2, TEX.hudStatusFrame)
        .setDisplaySize(PW, PH)
        .setAlpha(0.84),
    );

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
    const jobIcon = this.add.image(31, 30, em0.tex).setScale(1.35).setTint(em0.color);
    panel.add(jobIcon);
    const levelText = this.add
      .text(31, 52, '', { fontFamily: FONT, fontSize: '8px', color: '#fff1bd', fontStyle: 'bold' })
      .setOrigin(0.5);
    levelText.setShadow(0, 1, '#08101f', 2);
    panel.add(levelText);

    // Right column follows the three recessed channels in the illustrated art:
    // identity, HP, MP. EXP remains a quiet line along the lower edge.
    const rx = 65;
    const rw = 93;
    this.jobText = this.add.text(rx + 4, 21, '', {
      fontFamily: FONT,
      fontSize: '10px',
      color: '#ffe9a8',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.jobText.setShadow(0, 1, '#08101f', 2);
    panel.add(this.jobText);
    const refreshJob = (): void => {
      levelText.setText(`Lv${gameState.level}`);
      fitText(this.jobText, getJob(gameState.jobId)?.name ?? gameState.jobId, rw - 8);
      const em = emblemFor();
      jobIcon.setTexture(em.tex).setTint(em.color);
    };

    const makeBar = (cy: number, color: number): Phaser.GameObjects.Rectangle => {
      const fill = this.add.rectangle(rx + 3, cy, rw - 7, 7, color, 0.96).setOrigin(0, 0.5);
      panel.add(fill);
      return fill;
    };
    const barText = (cy: number, label: string): Phaser.GameObjects.Text => {
      const lab = this.add
        .text(rx + 7, cy, label, { fontFamily: FONT, fontSize: '7px', color: '#ffffff' })
        .setOrigin(0, 0.5)
        .setAlpha(0.84);
      lab.setShadow(0, 1, '#000000', 2);
      panel.add(lab);
      const val = this.add
        .text(rx + rw - 5, cy, '', { fontFamily: FONT, fontSize: '8px', color: '#ffffff' })
        .setOrigin(1, 0.5);
      val.setShadow(0, 1, '#000000', 2);
      panel.add(val);
      return val;
    };

    this.hpBar = makeBar(37, 0xf05f67);
    this.hpText = barText(37, 'HP');
    this.mpBar = makeBar(53, 0x36b9df);
    this.mpText = barText(53, 'MP');
    this.expBar = this.add.rectangle(rx + 2, 62, rw - 5, 2, 0x74e2c5, 0.95).setOrigin(0, 0.5);
    panel.add(this.expBar);
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
    // The tracker is deliberately quieter than the player panel: one soft band
    // with a single accent line, so it reads as guidance rather than decoration.
    const hudX = insets.left + 8;
    const trY = insets.top + 8 + PH + 4; // just below the statusPanel
    const trW = PW;
    const trH = 34;
    const trRoot = this.add.container(hudX, trY).setDepth(depth);
    const trackerBack = this.add.graphics();
    trackerBack.fillStyle(0x000000, 0.2);
    trackerBack.fillRoundedRect(2, 3, trW - 4, trH - 1, 7);
    trackerBack.fillStyle(0x071321, 0.76);
    trackerBack.fillRoundedRect(2, 0, trW - 4, trH - 3, 7);
    trackerBack.fillStyle(0xd8bb68, 0.72);
    trackerBack.fillRoundedRect(7, 7, 2, trH - 17, 1);
    trackerBack.lineStyle(1, 0xffffff, 0.1);
    trackerBack.strokeRoundedRect(2, 0, trW - 4, trH - 3, 7);
    const trackerIcon = this.add
      .image(20, 16, TEX.iconShield)
      .setDisplaySize(13, 13)
      .setTint(0xd9c37c)
      .setAlpha(0.78);
    trRoot.add([trackerBack, trackerIcon]);
    const trTitle = this.add
      .text(34, 5, '', { fontFamily: FONT, fontSize: '9px', color: '#f5f1e8', fontStyle: 'bold' })
      .setShadow(0, 1, '#000000', 2);
    const trObj = this.add
      .text(34, 18, '', { fontFamily: FONT, fontSize: '8px', color: '#bfcbd8' })
      .setShadow(0, 1, '#000000', 2);
    const trGuideDivider = this.add.graphics().setVisible(false);
    trGuideDivider.lineStyle(1, 0xffffff, 0.16);
    trGuideDivider.lineBetween(trW - 45, 6, trW - 45, trH - 8);
    const trGuideArrow = this.add
      .triangle(trW - 22, 12, 0, 8, 8, 8, 4, 0, 0xffd86b, 1)
      .setOrigin(0.5)
      .setVisible(false);
    const trGuideDistance = this.add
      .text(trW - 22, 20, '', { fontFamily: FONT, fontSize: '7px', color: '#e8d899' })
      .setOrigin(0.5, 0)
      .setShadow(0, 1, '#000000', 2)
      .setVisible(false);
    trRoot.add([trTitle, trObj, trGuideDivider, trGuideArrow, trGuideDistance]);
    // While a boss HP card is up it borrows this exact HUD slot, so the
    // tracker yields (the objective IS the boss on screen anyway).
    let bossBarActive = false;
    let currentGuide: GameEvents['quest:guide'] | null = null;
    const trackerTextWidth = trW - 92;
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
        fitText(trTitle, current.name, trackerTextWidth);
        fitText(
          trObj,
          currentGuide?.active ? currentGuide.hint : '達成！ 掲示板で報告',
          trackerTextWidth,
        );
        trObj.setColor('#ffd86b');
      } else {
        fitText(trTitle, current.name, trackerTextWidth);
        trObj.setColor('#bfcbd8');
        fitText(
          trObj,
          currentGuide?.active
            ? currentGuide.hint
            : current.objectives
                .map((o) => {
                  const name = getEnemyDef(o.enemyId)?.name ?? o.enemyId;
                  return `${name} ${objectiveProgress(gameState, current.id, o.enemyId)}/${o.count}`;
                })
                .join('・'),
          trackerTextWidth,
        );
      }
    };
    refreshTracker();
    this.busOff.push(bus.on('quest:changed', refreshTracker));
    this.busOff.push(bus.on('quest:accepted', ({ questId }) => this.showQuestStart(questId)));
    this.busOff.push(bus.on('quest:progress', (data) => this.showQuestProgress(data)));
    this.busOff.push(
      bus.on('boss:bar', ({ active }) => {
        bossBarActive = active;
        refreshTracker();
      }),
    );
    this.busOff.push(bus.on('boss:intro', (data) => this.showBossIntro(data)));

    // Live minimap: intentionally compact, but it gives the upper-right a
    // recognisable RPG silhouette and makes map position visible at a glance.
    const miniSize = 92;
    const miniInner = 64;
    const miniX = w - insets.right - 48;
    const miniY = insets.top + 48;
    const miniG = this.add.graphics();
    const miniFrame = this.add
      .image(0, 0, TEX.hudMinimapFrame)
      .setDisplaySize(92, 104)
      .setAlpha(0.8);
    const miniGuideRing = this.add
      .circle(0, 0, 5)
      .setStrokeStyle(1.5, 0xffd86b, 0.95)
      .setVisible(false);
    const miniGuideDot = this.add
      .circle(0, 0, 2.5, 0xffd86b, 1)
      .setStrokeStyle(1, 0x2a1820, 1)
      .setVisible(false);
    const miniDot = this.add.circle(0, 0, 3.5, 0xffe16a).setStrokeStyle(1.5, 0x2a1820, 1);
    const miniName = this.add
      .text(0, 58, '', { fontFamily: FONT, fontSize: '8px', color: '#fff1bd' })
      .setOrigin(0.5)
      .setAlpha(0.76)
      .setShadow(0, 1, '#000000', 2);
    const miniRoot = this.add
      .container(miniX, miniY, [miniG, miniFrame, miniGuideRing, miniGuideDot, miniDot, miniName])
      .setDepth(depth);
    miniRoot.setSize(miniSize, 104).setInteractive({ useHandCursor: true });
    miniRoot.on('pointerup', () => bus.emit('ui:open-map', {}));

    let miniMap = getMap(gameState.mapId);
    let miniWidth = miniMap?.size.w ?? 1;
    let miniHeight = miniMap?.size.h ?? 1;
    const positionGuideMarker = (): void => {
      if (!currentGuide?.active || currentGuide.mapId !== miniMap?.id) {
        miniGuideRing.setVisible(false);
        miniGuideDot.setVisible(false);
        return;
      }
      const half = miniInner / 2;
      const gx = Phaser.Math.Clamp(
        (currentGuide.targetX / miniWidth - 0.5) * miniInner,
        -half + 4,
        half - 4,
      );
      const gy = Phaser.Math.Clamp(
        (currentGuide.targetY / miniHeight - 0.5) * miniInner,
        -half + 4,
        half - 4,
      );
      miniGuideRing.setPosition(gx, gy).setVisible(true);
      miniGuideDot.setPosition(gx, gy).setVisible(true);
    };
    const drawMiniMap = (x: number, y: number): void => {
      const half = miniInner / 2;
      const ground = miniMap?.ground === 'stone' ? 0x536172 : miniMap?.ground === 'floor' ? 0x62515e : 0x45694a;
      miniG.clear();
      miniG.fillStyle(0x050912, 0.94);
      miniG.fillRoundedRect(-half - 3, -half - 3, miniInner + 6, miniInner + 6, 8);
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
      miniG.lineStyle(1, 0xffffff, 0.12);
      miniG.strokeRoundedRect(-half, -half, miniInner, miniInner, 7);
      miniDot.setPosition(
        Phaser.Math.Clamp((x / miniWidth - 0.5) * miniInner, -half + 4, half - 4),
        Phaser.Math.Clamp((y / miniHeight - 0.5) * miniInner, -half + 4, half - 4),
      );
      positionGuideMarker();
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
    this.busOff.push(
      bus.on('quest:guide', (guide) => {
        currentGuide = guide.active ? guide : null;
        trGuideDivider.setVisible(guide.active);
        trGuideArrow.setVisible(guide.active);
        trGuideDistance.setVisible(guide.active);
        if (guide.active) {
          trGuideArrow.setRotation(guide.angle + Math.PI / 2);
          trGuideDistance.setText(`${guide.distance}m`);
        }
        positionGuideMarker();
        refreshTracker();
      }),
    );

    // Bag button stays beside the minimap, so map navigation and inventory
    // read as a compact utility strip instead of two floating controls.
    const bagX = miniX - 64;
    const bagY = insets.top + 28;
    const bag = new TouchButton(
      this,
      bagX,
      bagY,
      22,
      '',
      0x63728d,
      depth,
      TEX.iconBag,
      'utility',
    );
    bag.onChange = (down) => {
      if (down) bus.emit('ui:open-inventory', {});
    };

    // Debug entry is a separate, opt-in dev overlay; nothing debug-related is
    // mixed into the regular HUD here.

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

    // The coach begins only after the elder has handed over the first quest.
    // This keeps dialogue, QUEST START, and control instructions in one order.
    const startCoachWhenReady = (): void => {
      if (this.coach || !TutorialCoach.shouldShow()) return;
      const waitingForIntro =
        !!gameState.flags[INTRO_PENDING_FLAG] &&
        !gameState.activeQuests.includes(INTRO_QUEST_ID) &&
        !gameState.completedQuests.includes(INTRO_QUEST_ID);
      if (waitingForIntro) return;
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
    };
    startCoachWhenReady();
    this.busOff.push(bus.on('quest:changed', startCoachWhenReady));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const off of this.busOff) off();
      this.busOff = [];
      this.coach?.destroy();
      this.coach = null;
      this.questStartRoot?.destroy(true);
      this.questStartRoot = null;
      this.questProgressRoot?.destroy(true);
      this.questProgressRoot = null;
      this.bossIntroRoot?.destroy();
      this.bossIntroRoot = null;
    });
  }

  private showQuestProgress(data: GameEvents['quest:progress']): void {
    const quest = getQuest(data.questId);
    const enemy = getEnemyDef(data.enemyId);
    if (!quest || !enemy) return;
    this.questProgressRoot?.destroy(true);

    const w = this.scale.width;
    const h = this.scale.height;
    const panelW = Math.min(w - 52, 216);
    const panelH = 48;
    const root = this.add
      .container(w / 2, Math.min(148, h * 0.2) - 8)
      .setDepth(HUD_DEPTH + 840)
      .setAlpha(0);
    this.questProgressRoot = root;

    const shadow = this.add
      .image(2, 3, TEX.hudQuestFrame)
      .setDisplaySize(panelW, panelH)
      .setTint(0x000000)
      .setAlpha(0.48);
    const well = this.add.rectangle(16, 0, panelW - 54, panelH - 18, 0x0c1b31, 0.94);
    const panel = this.add.image(0, 0, TEX.hudQuestFrame).setDisplaySize(panelW, panelH);
    if (data.complete) panel.setTint(0xfff0bd);
    const textX = -panelW / 2 + 48;
    const tag = this.add
      .text(textX, -15, data.complete ? 'OBJECTIVE COMPLETE' : 'QUEST PROGRESS', {
        fontFamily: FONT,
        fontSize: '8px',
        color: data.complete ? '#ffd86b' : '#8fd0ff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const value = this.add
      .text(panelW / 2 - 14, -15, `${data.current}/${data.total}`, {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5);
    const title = this.add
      .text(textX, 1, `${enemy.name}を討伐`, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const fillW = panelW - 62;
    const barX = textX + fillW / 2;
    const barBg = this.add.rectangle(barX, 16, fillW, 4, 0x050711, 0.8);
    const bar = this.add
      .rectangle(textX, 16, fillW, 2, data.complete ? 0xffd86b : 0x69bce8, 1)
      .setOrigin(0, 0.5)
      .setScale(Phaser.Math.Clamp(data.current / data.total, 0, 1), 1);
    root.add([shadow, well, panel, tag, value, title, barBg, bar]);

    this.tweens.add({ targets: root, alpha: 1, y: root.y + 8, duration: 180, ease: 'Cubic.Out' });
    this.time.delayedCall(data.complete ? 1450 : 1050, () => {
      if (!root.active) return;
      this.tweens.add({
        targets: root,
        alpha: 0,
        y: root.y - 8,
        duration: 260,
        ease: 'Cubic.In',
        onComplete: () => {
          if (this.questProgressRoot === root) this.questProgressRoot = null;
          root.destroy(true);
        },
      });
    });
  }

  private showQuestStart(questId: string): void {
    const quest = getQuest(questId);
    if (!quest) return;
    this.questStartRoot?.destroy(true);

    const w = this.scale.width;
    const h = this.scale.height;
    const panelW = Math.min(w - 36, 304);
    const panelH = 76;
    const root = this.add.container(w + panelW / 2, Math.min(170, h * 0.24)).setDepth(HUD_DEPTH + 850);
    this.questStartRoot = root;

    const shadow = this.add
      .image(3, 4, TEX.hudQuestFrame)
      .setDisplaySize(panelW, panelH)
      .setTint(0x000000)
      .setAlpha(0.54);
    const well = this.add.rectangle(25, 0, panelW - 86, panelH - 24, 0x0d203a, 0.96);
    const panel = this.add.image(0, 0, TEX.hudQuestFrame).setDisplaySize(panelW, panelH);
    const textX = -panelW / 2 + 70;
    const tag = this.add
      .text(textX, -25, 'QUEST START', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#ffd86b',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const title = this.add
      .text(textX, -6, quest.name, {
        fontFamily: FONT,
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const objective = quest.objectives
      .map((o) => `${getEnemyDef(o.enemyId)?.name ?? o.enemyId} ×${o.count}`)
      .join('・');
    const body = this.add
      .text(textX, 19, objective, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#cfe3ff',
      })
      .setOrigin(0, 0.5);
    root.add([shadow, well, panel, tag, title, body]);
    bus.emit('sfx:play', { id: 'ui_tap' });

    this.tweens.add({ targets: root, x: w / 2, duration: 280, ease: 'Cubic.Out' });
    this.time.delayedCall(1650, () => {
      if (!root.active) return;
      this.tweens.add({
        targets: root,
        x: -panelW / 2,
        alpha: 0,
        duration: 260,
        ease: 'Cubic.In',
        onComplete: () => {
          if (this.questStartRoot === root) this.questStartRoot = null;
          root.destroy(true);
        },
      });
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
