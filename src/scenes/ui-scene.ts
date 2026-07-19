import Phaser from 'phaser';
import { input } from '@/input/input-state';
import { VirtualStick } from '@/input/virtual-stick';
import { TouchButton } from '@/input/touch-button';
import { buildControlLayout } from '@/input/control-layout';
import { readInsets } from '@/core/safe-area';
import { loadSettings } from '@/core/settings';
import { bus, type GameEvents } from '@/core/event-bus';
import { gameState } from '@/player/game-state';
import { getMap } from '@/maps/map-def';
import { getQuest } from '@/quests/quest-defs';
import { isComplete, objectiveProgress } from '@/quests/quests';
import { getEnemyDef } from '@/enemies/enemy-defs';
import { getSkill } from '@/skills/skill-defs';
import { getSkillVisual } from '@/skills/skill-visuals';
import { ELEMENT_LABEL, elementColorHex, isElement } from '@/combat/elements';
import { expToNext } from '@/stats/leveling';
import { FONT, HUD_DEPTH } from '@/ui/theme';
import { TEX } from '@/assets/gen/textures';
import { TutorialCoach } from '@/ui/tutorial-coach';
import { isUpdateReady } from '@/core/pwa';
import { INTRO_PENDING_FLAG, INTRO_QUEST_ID } from '@/tutorial/onboarding';
import {
  getConsumable,
  getEquipment,
  getMaterial,
  getPetItem,
  itemDisplayName,
} from '@/data/items';
import { rarityColorHex } from '@/data/rarity';
import { materialIconTexture } from '@/data/material-icons';

interface RewardNotice {
  key: string;
  kind: 'item' | 'exp';
  label: string;
  amount: number;
  color: string;
  icon: string;
}

/**
 * Always-on UI overlay: virtual stick (lower-left), attack + skill + interact
 * buttons (lower-right), compact hunter/quest panels, and menu shortcuts.
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
  private rewardFeedX = 0;
  private rewardFeedY = 0;
  private rewardQueue: RewardNotice[] = [];
  private activeReward: RewardNotice | null = null;
  private rewardRoot: Phaser.GameObjects.Container | null = null;
  private rewardAmountText: Phaser.GameObjects.Text | null = null;
  private rewardTimer: Phaser.Time.TimerEvent | null = null;

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
    const settings = loadSettings();
    const controlScale = settings.controlScale;
    const controlOpacity = settings.controlOpacity;
    const controls = buildControlLayout(
      w,
      h,
      bottomPad,
      { left: insets.left, right: insets.right },
      controlScale,
      settings.leftHanded,
    );
    this.rewardFeedX = w / 2;
    this.rewardFeedY = Math.max(insets.top + 104, 112);
    this.rewardQueue = [];
    this.activeReward = null;

    const depth = HUD_DEPTH;
    const fitText = (txt: Phaser.GameObjects.Text, value: string, maxWidth: number): void => {
      let s = value;
      txt.setText(s);
      while (txt.width > maxWidth && s.length > 2) {
        s = s.slice(0, -2);
        txt.setText(`${s}...`);
      }
    };

    // Virtual stick on the selected movement half.
    this.stick = new VirtualStick(
      this,
      new Phaser.Geom.Rectangle(
        controls.stickZone.x,
        controls.stickZone.y,
        controls.stickZone.width,
        controls.stickZone.height,
      ),
      depth,
      { scale: controlScale, opacity: controlOpacity, standby: controls.stickStandby },
    );

    // Combat cluster on the selected action side, above the home indicator.
    const baseX = controls.attack.x;
    const baseY = controls.attack.y;

    const attackBtn = new TouchButton(
      this,
      controls.attack.x,
      controls.attack.y,
      48 * controlScale,
      '',
      0xcc5555,
      depth,
      TEX.iconSword,
      'primary',
    );
    attackBtn.onChange = (d) => input.setButton('attack', d);

    const skillBtn = new TouchButton(
      this,
      controls.skill1.x,
      controls.skill1.y,
      32 * controlScale,
      'S1',
      0x5a78ba,
      depth,
      undefined,
      'secondary',
    );
    skillBtn.onChange = (d) => input.setButton('skill1', d);

    const skill2Btn = new TouchButton(
      this,
      controls.skill2.x,
      controls.skill2.y,
      32 * controlScale,
      'S2',
      0x6870b5,
      depth,
      undefined,
      'secondary',
    );
    skill2Btn.onChange = (d) => input.setButton('skill2', d);

    const skillButtons = [skillBtn, skill2Btn];
    const skillButtonGeom = [
      { x: controls.skill1.x, y: controls.skill1.y, r: 32 * controlScale },
      { x: controls.skill2.x, y: controls.skill2.y, r: 32 * controlScale },
    ];
    const skillCooling = [false, false];
    let combatHidden = false;
    const skillCostBacks = skillButtonGeom.map(({ x, y, r }) =>
      this.add
        .circle(x + r - 8, y - r + 8, 7, 0x06111f, 0.92)
        .setStrokeStyle(1, 0x68bde6, 0.62)
        .setDepth(depth + 2),
    );
    const skillCostLabels = skillButtonGeom.map(({ x, y, r }) =>
      this.add
        .text(x + r - 8, y - r + 8, '', {
          fontFamily: FONT,
          fontSize: '8px',
          color: '#a8e4ff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5)
        .setDepth(depth + 3),
    );
    const refreshSkillButtons = (): void => {
      for (let slot = 0; slot < skillButtons.length; slot++) {
        const id = gameState.skillSlots[slot];
        const def = id ? getSkill(id) : undefined;
        const btn = skillButtons[slot];
        const costBack = skillCostBacks[slot];
        const costLabel = skillCostLabels[slot];
        if (!def || def.type !== 'active') {
          btn.setContent(`S${slot + 1}`);
          btn.setAccent(0x637188);
          btn.setUnavailable(true);
          costBack.setVisible(!combatHidden).setStrokeStyle(1, 0xd7bd6a, 0.7);
          costLabel.setVisible(!combatHidden).setText('+').setColor('#ffe69a');
          continue;
        }
        const visual = getSkillVisual(def);
        const cost = def.mpCost ?? 0;
        const lowMp = gameState.mp < cost;
        btn.setContent(`S${slot + 1}`, visual.icon);
        btn.setAccent(visual.accent);
        btn.setUnavailable(lowMp || skillCooling[slot]);
        costBack
          .setVisible(!combatHidden && !skillCooling[slot])
          .setStrokeStyle(1, lowMp ? 0xe17474 : 0x68bde6, 0.7);
        costLabel
          .setVisible(!combatHidden && !skillCooling[slot])
          .setText(`${cost}`)
          .setColor(lowMp ? '#ff9999' : '#a8e4ff');
      }
    };
    refreshSkillButtons();
    this.busOff.push(bus.on('skill:slots-changed', refreshSkillButtons));
    this.busOff.push(bus.on('game:load', refreshSkillButtons));
    this.busOff.push(bus.on('game:new', refreshSkillButtons));
    this.busOff.push(bus.on('player:mp-changed', refreshSkillButtons));

    const dodgeBtn = new TouchButton(
      this,
      controls.dodge.x,
      controls.dodge.y,
      23 * controlScale,
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
      controls.potion.x,
      controls.potion.y,
      23 * controlScale,
      '',
      0xa95765,
      depth,
      TEX.iconFlask,
      'utility',
    );
    const potCount = this.add
      .text(controls.potionCount.x, controls.potionCount.y, '', {
        fontFamily: FONT,
        fontSize: `${Math.round(11 * controlScale)}px`,
        color: '#ffffff',
      })
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

    // Safe zones are navigation spaces. Remove the battle cluster entirely so
    // the plaza keeps the quiet, open composition of the selected town mock.
    const combatButtons = [attackBtn, skillBtn, skill2Btn, dodgeBtn, potBtn];
    combatButtons.forEach((button) => button.setOpacityMultiplier(controlOpacity));
    const setCombatDim = (dim: boolean): void => {
      combatHidden = dim;
      combatButtons.forEach((b) => b.setDimmed(dim));
      combatButtons.forEach((b) => b.setVisible(!dim));
      potCount.setVisible(!dim);
      refreshSkillButtons();
    };
    setCombatDim(!!getMap(gameState.mapId)?.safe);
    this.busOff.push(bus.on('world:map-ready', ({ safe }) => setCombatDim(safe)));

    // Cooldown sweep overlays for the two skill buttons (slot 0 = S1, 1 = S2).
    const cdGeom = [
      { x: controls.skill1.x, y: controls.skill1.y, r: 32 * controlScale },
      { x: controls.skill2.x, y: controls.skill2.y, r: 32 * controlScale },
      { x: controls.dodge.x, y: controls.dodge.y, r: 23 * controlScale }, // dodge (slot 2)
      { x: controls.potion.x, y: controls.potion.y, r: 23 * controlScale }, // potion (slot 3)
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
        if (slot < skillCooling.length) {
          skillCooling[slot] = true;
          refreshSkillButtons();
        }
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
            if (slot < skillCooling.length) {
              skillCooling[slot] = false;
              refreshSkillButtons();
            }
            cdTweens[slot] = null;
          },
        });
      }),
    );

    // A short cast banner bridges the button press and the world-space hit.
    // It also carries rejected-input reasons, so no skill press fails silently.
    const skillToastW = Math.min(138, w - 24);
    const skillToastY = Math.max(insets.top + 118, baseY - 170);
    const skillToastX = Phaser.Math.Clamp(
      baseX + (settings.leftHanded ? 42 : -42) * controlScale,
      skillToastW / 2 + 8,
      w - skillToastW / 2 - 8,
    );
    const skillToastPanel = this.add.graphics();
    const skillToastIcon = this.add.image(-skillToastW / 2 + 22, 0, TEX.iconSword).setScale(2);
    const skillToastName = this.add
      .text(-skillToastW / 2 + 42, -6, '', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5)
      .setShadow(0, 1, '#000000', 2);
    const skillToastMeta = this.add
      .text(-skillToastW / 2 + 42, 8, '', {
        fontFamily: FONT,
        fontSize: '9px',
        color: '#b9c7d8',
      })
      .setOrigin(0, 0.5);
    const skillToast = this.add
      .container(skillToastX, skillToastY, [
        skillToastPanel,
        skillToastIcon,
        skillToastName,
        skillToastMeta,
      ])
      .setDepth(depth + 8)
      .setVisible(false);
    let skillToastHide: Phaser.Time.TimerEvent | null = null;
    const showSkillToast = (
      slot: number,
      title: string,
      meta: string,
      accent: number,
      icon?: string,
    ): void => {
      this.tweens.killTweensOf(skillToast);
      skillToastHide?.remove(false);
      skillToastPanel.clear();
      skillToastPanel.fillStyle(0x050d18, 0.9);
      skillToastPanel.fillRoundedRect(-skillToastW / 2, -17, skillToastW, 34, 7);
      skillToastPanel.fillStyle(accent, 0.95);
      skillToastPanel.fillRoundedRect(-skillToastW / 2, -12, 3, 24, 1);
      skillToastPanel.lineStyle(1, 0xffffff, 0.12);
      skillToastPanel.strokeRoundedRect(-skillToastW / 2, -17, skillToastW, 34, 7);
      skillToastIcon.setVisible(!!icon);
      if (icon) skillToastIcon.setTexture(icon).clearTint();
      const textX = icon ? -skillToastW / 2 + 42 : -skillToastW / 2 + 14;
      skillToastName.setX(textX);
      skillToastMeta.setX(textX);
      fitText(skillToastName, title, skillToastW - (icon ? 54 : 28));
      skillToastMeta.setText(`S${slot + 1}  ${meta}`).setColor(`#${accent.toString(16).padStart(6, '0')}`);
      skillToast.setPosition(skillToastX, skillToastY + 5).setAlpha(0).setVisible(true);
      this.tweens.add({
        targets: skillToast,
        y: skillToastY,
        alpha: 1,
        duration: 120,
        ease: 'Cubic.Out',
      });
      skillToastHide = this.time.delayedCall(760, () => {
        this.tweens.add({
          targets: skillToast,
          y: skillToastY - 4,
          alpha: 0,
          duration: 170,
          ease: 'Cubic.In',
          onComplete: () => skillToast.setVisible(false),
        });
      });
    };
    this.busOff.push(
      bus.on('skill:used', ({ slot, skillId }) => {
        const def = getSkill(skillId);
        if (!def) return;
        const visual = getSkillVisual(def);
        showSkillToast(slot, def.name, `${def.mpCost ?? 0} MP`, visual.accent, visual.icon);
      }),
    );
    this.busOff.push(
      bus.on('skill:failed', ({ slot, reason, skillId, remaining }) => {
        const def = skillId ? getSkill(skillId) : undefined;
        const visual = def ? getSkillVisual(def) : undefined;
        const title = reason === 'mp' ? 'MPが足りません' : reason === 'cooldown' ? '再使用待ち' : '技をセット';
        const meta = reason === 'mp'
          ? `必要 ${def?.mpCost ?? 0} MP`
          : reason === 'cooldown'
            ? `${Math.max(0.1, (remaining ?? 0) / 1000).toFixed(1)} 秒`
            : 'もちもの > 技';
        const accent = reason === 'mp' ? 0xe16b6b : visual?.accent ?? 0xd7bd6a;
        skillButtons[slot]?.flashWarning(accent);
        showSkillToast(slot, title, meta, accent, visual?.icon);
      }),
    );

    // Interact button appears only when something is interactable (top area).
    this.interactBtn = new TouchButton(
      this,
      w / 2,
      h - bottomPad - 110,
      28 * controlScale,
      '調べる',
      0x4f9870,
      depth,
      undefined,
      'primary',
    );
    this.interactBtn.onChange = (d) => input.setButton('interact', d);
    this.interactBtn.setOpacityMultiplier(controlOpacity);
    this.interactBtn.setVisible(false);

    // Slim full-width status strip matched to the plaza's compact pixel HUD.
    const px = insets.left + 6;
    const py = insets.top + 6;
    const PW = w - insets.left - insets.right - 12;
    const PH = 40;
    const frameContentInset = 8;
    const contentRight = PW - frameContentInset;
    const levelDivider = frameContentInset + 60;
    const expDivider = levelDivider + 66;
    const hpDivider = Math.floor((contentRight + expDivider) / 2);
    const panel = this.add.container(px, py).setDepth(depth); // statusPanel
    const hasPlazaStatusFrame = this.textures.exists(TEX.hudStatusPlazaFrame);
    const hasHdStatusFrame = hasPlazaStatusFrame || this.textures.exists(TEX.uiRibbonFrame);
    if (hasPlazaStatusFrame) {
      panel.add(
        this.add.image(PW / 2, PH / 2, TEX.hudStatusPlazaFrame).setDisplaySize(PW, PH),
      );
    } else if (hasHdStatusFrame) {
      panel.add(
        this.add.nineslice(
          PW / 2,
          PH / 2,
          TEX.uiRibbonFrame,
          undefined,
          PW,
          PH,
          24,
          24,
          12,
          12,
        ),
      );
    }
    const panelBack = this.add.graphics();
    if (!hasHdStatusFrame) {
      panelBack.fillStyle(0x000000, 0.28);
      panelBack.fillRoundedRect(1, 2, PW, PH, 3);
      panelBack.fillStyle(0x071523, 0.98);
      panelBack.fillRoundedRect(0, 0, PW, PH, 3);
      panelBack.lineStyle(1.5, 0xd9bd6a, 0.86);
      panelBack.strokeRoundedRect(0, 0, PW, PH, 3);
      panelBack.lineStyle(1, 0xffedab, 0.72);
      panelBack.lineBetween(3, 2, PW - 3, 2);
    }
    panelBack.lineStyle(1, 0x7765c4, 0.58);
    panelBack.lineBetween(levelDivider, 5, levelDivider, PH - 5);
    panelBack.lineBetween(expDivider, 5, expDivider, PH - 5);
    panelBack.lineBetween(hpDivider, 5, hpDivider, PH - 5);
    panel.add(panelBack);

    // Low-HP danger vignette (full screen, just under the HUD).
    this.lowHpVignette = this.add.graphics().setDepth(depth - 1).setScrollFactor(0).setVisible(false);
    for (let i = 0; i < 9; i++) {
      this.lowHpVignette.lineStyle(2, 0xff2030, 0.22 * (1 - i / 9));
      this.lowHpVignette.strokeRect(i, i, w - i * 2, h - i * 2);
    }

    const barY = PH / 2;
    const levelText = this.add
      .text((frameContentInset + levelDivider) / 2, barY, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#f7f1df',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    levelText.setShadow(0, 1, '#000000', 2);
    panel.add(levelText);

    const refreshLevel = (): void => {
      levelText.setText(`Lv ${gameState.level}`);
    };

    const makeBar = (
      x: number,
      width: number,
      color: number,
      height = 16,
      y = barY,
    ): Phaser.GameObjects.Rectangle => {
      const back = this.add
        .rectangle(x, y, width, height, 0x02060c, 0.95)
        .setOrigin(0, 0.5)
        .setStrokeStyle(1, 0xc9d6e4, 0.56);
      const fill = this.add.rectangle(x + 1, y, width - 2, height - 2, color, 0.98).setOrigin(0, 0.5);
      panel.add([back, fill]);
      return fill;
    };
    const statLabel = (x: number, label: string): void => {
      const text = this.add
        .text(x, barY, label, { fontFamily: FONT, fontSize: '11px', color: '#f5f7fb', fontStyle: 'bold' })
        .setOrigin(0, 0.5);
      text.setShadow(0, 1, '#000000', 2);
      panel.add(text);
    };
    const barText = (x: number, width: number): Phaser.GameObjects.Text => {
      const val = this.add
        .text(x + width / 2, barY, '', { fontFamily: FONT, fontSize: '10px', color: '#ffffff', fontStyle: 'bold' })
        .setOrigin(0.5);
      val.setShadow(0, 1, '#000000', 2);
      panel.add(val);
      return val;
    };
    const setBarText = (text: Phaser.GameObjects.Text, value: string, width: number): void => {
      text.setFontSize(10).setText(value);
      if (text.width > width - 6) text.setFontSize(9);
    };

    const expX = levelDivider + 7;
    const expW = expDivider - expX - 5;
    const expBarY = 29;
    this.expBar = makeBar(expX, expW, 0xf2d45c, 7, expBarY);
    this.expText = this.add
      .text(expX + expW / 2, 4, '', {
        fontFamily: FONT,
        fontSize: '10px',
        color: '#f5f7fb',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    this.expText.setShadow(0, 1, '#000000', 2);
    panel.add(this.expText);
    const expSegments = this.add.graphics();
    expSegments.lineStyle(1, 0x172034, 0.58);
    for (let i = 1; i < 8; i++) {
      const sx = Math.round(expX + (expW * i) / 8);
      expSegments.lineBetween(sx, expBarY - 3, sx, expBarY + 3);
    }
    panel.add(expSegments);

    const statBarOffset = 25;
    const statRightGap = 4;
    const hpX = expDivider + statBarOffset;
    const hpW = hpDivider - hpX - statRightGap;
    const mpX = hpDivider + statBarOffset;
    const mpW = contentRight - mpX - statRightGap;
    statLabel(expDivider + 5, 'HP');
    this.hpBar = makeBar(hpX, hpW, 0xf17c78);
    this.hpText = barText(hpX, hpW);
    statLabel(hpDivider + 5, 'MP');
    this.mpBar = makeBar(mpX, mpW, 0x5ee0e6);
    this.mpText = barText(mpX, mpW);

    // Initial values (bars need a fill before the first bus event).
    const d0 = gameState.derived;
    setBarText(this.hpText, `${gameState.hp}/${d0.maxHp}`, hpW);
    this.hpBar.scaleX = d0.maxHp > 0 ? Phaser.Math.Clamp(gameState.hp / d0.maxHp, 0, 1) : 0;
    setBarText(this.mpText, `${gameState.mp}/${d0.maxMp}`, mpW);
    this.mpBar.scaleX = d0.maxMp > 0 ? Phaser.Math.Clamp(gameState.mp / d0.maxMp, 0, 1) : 0;
    refreshLevel();

    // Bus wiring.
    this.busOff.push(bus.on('job:changed', refreshLevel));
    this.busOff.push(bus.on('player:level-up', refreshLevel));
    this.busOff.push(
      bus.on('player:hp-changed', ({ current, max }) => {
        setBarText(this.hpText, `${current}/${max}`, hpW);
        this.hpBar.scaleX = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
        this.updateLowHpVignette(max > 0 ? current / max : 0);
      }),
    );
    this.busOff.push(
      bus.on('player:mp-changed', ({ current, max }) => {
        setBarText(this.mpText, `${current}/${max}`, mpW);
        this.mpBar.scaleX = max > 0 ? Phaser.Math.Clamp(current / max, 0, 1) : 0;
      }),
    );
    const setExp = (cur: number, toNext: number): void => {
      const progress = toNext > 0 ? Phaser.Math.Clamp(cur / toNext, 0, 1) : 0;
      this.expBar.scaleX = progress;
      this.expText.setText(`EXP ${Math.floor(progress * 100)}%`);
    };
    setExp(gameState.exp, expToNext(gameState.level));
    this.busOff.push(
      bus.on('player:exp-changed', ({ current, toNext, gained }) => {
        setExp(current, toNext);
        if (gained > 0) {
          this.enqueueReward({
            key: 'exp',
            kind: 'exp',
            label: '経験値',
            amount: gained,
            color: '#7fe7ff',
            icon: TEX.iconGem,
          });
        }
      }),
    );
    this.busOff.push(bus.on('player:level-up', () => setExp(gameState.exp, expToNext(gameState.level))));
    this.busOff.push(
      bus.on('item:picked-up', ({ itemId, quantity }) => {
        this.enqueueItemReward(itemId, quantity);
      }),
    );

    // Quest tracker: current goal pinned under the HUD block so the player
    // always knows what to do next ("game tells, player does, game rewards").
    // The tracker is deliberately quieter than the player panel: one soft band
    // with a single accent line, so it reads as guidance rather than decoration.
    const hudX = px;
    const trY = py + PH + 5; // just below the statusPanel
    const trW = 174;
    const trH = 38;
    const trRoot = this.add.container(hudX, trY).setDepth(depth);
    const trackerBack = this.add.graphics();
    trackerBack.fillStyle(0x000000, 0.28);
    trackerBack.fillRoundedRect(2, 3, trW - 4, trH - 1, 7);
    trackerBack.fillStyle(0x071523, 0.94);
    trackerBack.fillRoundedRect(2, 0, trW - 4, trH - 3, 7);
    trackerBack.fillStyle(0xd8bb68, 0.92);
    trackerBack.fillRoundedRect(7, 7, 2, trH - 17, 1);
    trackerBack.lineStyle(1, 0xd9bd6a, 0.72);
    trackerBack.strokeRoundedRect(2, 0, trW - 4, trH - 3, 7);
    const trackerIcon = this.add
      .image(21, 18, TEX.iconShield)
      .setDisplaySize(16, 16)
      .setTint(0xffd56a)
      .setAlpha(1);
    trRoot.add([trackerBack, trackerIcon]);
    const trTitle = this.add
      .text(36, 4, '', { fontFamily: FONT, fontSize: '11px', color: '#f7f3e8', fontStyle: 'bold' })
      .setShadow(0, 1, '#000000', 2);
    const trObj = this.add
      .text(36, 21, '', { fontFamily: FONT, fontSize: '10px', color: '#d2dbe5' })
      .setShadow(0, 1, '#000000', 2);
    const trGuideDivider = this.add.graphics().setVisible(false);
    trGuideDivider.lineStyle(1, 0xffffff, 0.16);
    trGuideDivider.lineBetween(trW - 45, 6, trW - 45, trH - 8);
    const trGuideArrow = this.add
      .triangle(trW - 22, 12, 0, 8, 8, 8, 4, 0, 0xffd86b, 1)
      .setOrigin(0.5)
      .setVisible(false);
    const trGuideDistance = this.add
      .text(trW - 22, 19, '', { fontFamily: FONT, fontSize: '8px', color: '#f0dfa1' })
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
    this.busOff.push(bus.on('boss:intro', (data) => this.showBossIntro(data)));

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
        refreshTracker();
      }),
    );

    // Menu shortcuts use compact framed tiles, matching the selected HUD mock.
    const shortcutW = 49;
    const shortcutH = 48;
    const shortcutY = trY + shortcutH / 2;
    const bagX = w - insets.right - shortcutW / 2 - 5;
    const mapX = bagX - shortcutW - 6;
    const makeShortcut = (
      x: number,
      label: string,
      iconTex: string,
      onPress: () => void,
    ): { setVisible: (visible: boolean) => void } => {
      const back = this.add.graphics();
      back.fillStyle(0x061424, 0.97);
      back.fillRoundedRect(-shortcutW / 2, -shortcutH / 2, shortcutW, shortcutH, 3);
      back.lineStyle(1.5, 0xd9bd6a, 0.88);
      back.strokeRoundedRect(-shortcutW / 2, -shortcutH / 2, shortcutW, shortcutH, 3);
      back.lineStyle(1, 0x7c91a8, 0.5);
      back.strokeRoundedRect(-shortcutW / 2 + 3, -shortcutH / 2 + 3, shortcutW - 6, shortcutH - 6, 2);
      const icon = this.add.image(0, -7, iconTex).setScale(2).setTint(0xffe29a);
      const caption = this.add
        .text(0, 14, label, {
          fontFamily: FONT,
          fontSize: '9px',
          color: '#f7f3e8',
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      caption.setShadow(0, 1, '#000000', 2);
      const root = this.add.container(x, shortcutY, [back, icon, caption]).setDepth(depth + 2);
      const hit = this.add
        .zone(x, shortcutY, shortcutW, shortcutH)
        .setDepth(depth + 3)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', onPress);
      return {
        setVisible: (visible: boolean): void => {
          root.setVisible(visible);
          hit.setVisible(visible);
          if (visible) hit.setInteractive({ useHandCursor: true });
          else hit.disableInteractive();
        },
      };
    };
    const mapButton = makeShortcut(mapX, 'マップ', TEX.iconMap, () => bus.emit('ui:open-map', {}));
    const bag = makeShortcut(bagX, 'もちもの', TEX.iconBag, () => bus.emit('ui:open-inventory', {}));
    this.busOff.push(
      bus.on('boss:bar', ({ active }) => {
        bossBarActive = active;
        mapButton.setVisible(!active);
        bag.setVisible(!active);
        refreshTracker();
      }),
    );

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
    let controlsRestartQueued = false;
    this.busOff.push(
      bus.on('settings:controls-changed', () => {
        if (controlsRestartQueued) return;
        controlsRestartQueued = true;
        const restart = (): void => {
          if (this.scene.isActive('UI')) this.scene.restart();
        };
        const inventory = this.scene.get('Inventory');
        if (inventory.scene.isActive()) {
          inventory.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.time.delayedCall(0, restart));
        } else {
          this.time.delayedCall(0, restart);
        }
      }),
    );

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
          stick: controls.stickStandby,
          attack: { x: baseX, y: baseY },
          bag: { x: bagX, y: shortcutY },
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
      this.clearRewardFeed();
    });
  }

  private enqueueItemReward(itemId: string, quantity: number): void {
    if (quantity <= 0) return;
    const material = getMaterial(itemId);
    const consumable = getConsumable(itemId);
    const equipment = getEquipment(itemId);
    const petItem = getPetItem(itemId);
    const rarity = material?.rarity ?? equipment?.rarity;
    const color = petItem
      ? '#ff9ed2'
      : consumable
        ? '#8ee6ad'
        : rarityColorHex(rarity);
    const icon = equipment
      ? TEX.iconSword
      : consumable
        ? TEX.iconFlask
        : petItem
          ? TEX.iconBag
          : material
            ? materialIconTexture(itemId)
            : TEX.iconGem;
    this.enqueueReward({
      key: `item:${itemId}`,
      kind: 'item',
      label: itemDisplayName(itemId),
      amount: quantity,
      color,
      icon,
    });
  }

  private enqueueReward(notice: RewardNotice): void {
    if (notice.amount <= 0) return;
    if (this.activeReward?.key === notice.key) {
      this.activeReward.amount += notice.amount;
      this.updateRewardAmount();
      this.armRewardTimer();
      if (this.rewardRoot) {
        this.tweens.killTweensOf(this.rewardRoot);
        this.rewardRoot.setAlpha(1).setScale(1);
        this.tweens.add({
          targets: this.rewardRoot,
          scale: 1.045,
          duration: 90,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
      }
      return;
    }
    const queued = this.rewardQueue.find((entry) => entry.key === notice.key);
    if (queued) {
      queued.amount += notice.amount;
      return;
    }
    if (this.rewardQueue.length >= 6) this.rewardQueue.shift();
    this.rewardQueue.push({ ...notice });
    this.showNextReward();
  }

  private showNextReward(): void {
    if (this.activeReward || this.rewardRoot) return;
    const notice = this.rewardQueue.shift();
    if (!notice) return;
    this.activeReward = notice;

    const panelW = Math.min(this.scale.width - 42, 222);
    const panelH = 38;
    const color = Phaser.Display.Color.HexStringToColor(notice.color).color;
    const root = this.add
      .container(this.rewardFeedX + 14, this.rewardFeedY)
      .setDepth(HUD_DEPTH + 920)
      .setAlpha(0)
      .setScale(0.97);
    this.rewardRoot = root;

    const shadow = this.add.rectangle(2, 3, panelW, panelH, 0x000000, 0.48);
    const back = this.add
      .rectangle(0, 0, panelW, panelH, 0x071321, 0.96)
      .setStrokeStyle(1, color, 0.72);
    const accent = this.add.rectangle(-panelW / 2 + 3, 0, 4, panelH - 7, color, 0.96);
    const iconWell = this.add
      .circle(-panelW / 2 + 22, 0, 13, 0x111f33, 1)
      .setStrokeStyle(1, color, 0.82);
    const icon = this.add
      .image(-panelW / 2 + 22, 0, notice.icon)
      .setDisplaySize(15, 15)
      .setTint(color);
    const tag = this.add
      .text(-panelW / 2 + 42, -11, notice.kind === 'exp' ? 'EXP GAIN' : 'ITEM GET', {
        fontFamily: FONT,
        fontSize: '8px',
        color: notice.color,
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    const title = this.add
      .text(-panelW / 2 + 42, 7, notice.label, {
        fontFamily: FONT,
        fontSize: '11px',
        color: '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0.5);
    title.setShadow(0, 1, '#000000', 2);
    let shortLabel = notice.label;
    const titleMaxW = panelW - 128;
    while (title.width > titleMaxW && shortLabel.length > 4) {
      shortLabel = shortLabel.slice(0, -2);
      title.setText(`${shortLabel}…`);
    }
    this.rewardAmountText = this.add
      .text(panelW / 2 - 10, 2, '', {
        fontFamily: FONT,
        fontSize: '12px',
        color: notice.color,
        fontStyle: 'bold',
      })
      .setOrigin(1, 0.5);
    this.rewardAmountText.setShadow(0, 1, '#000000', 2);
    root.add([shadow, back, accent, iconWell, icon, tag, title, this.rewardAmountText]);
    this.updateRewardAmount();

    this.tweens.add({
      targets: root,
      x: this.rewardFeedX,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: 'Cubic.Out',
    });
    this.armRewardTimer();
  }

  private updateRewardAmount(): void {
    if (!this.activeReward || !this.rewardAmountText) return;
    this.rewardAmountText.setText(
      this.activeReward.kind === 'exp'
        ? `+${this.activeReward.amount} EXP`
        : `×${this.activeReward.amount}`,
    );
  }

  private armRewardTimer(): void {
    this.rewardTimer?.remove(false);
    this.rewardTimer = this.time.delayedCall(1850, () => {
      const root = this.rewardRoot;
      if (!root) return;
      this.tweens.add({
        targets: root,
        x: this.rewardFeedX - 10,
        alpha: 0,
        duration: 240,
        ease: 'Quad.easeIn',
        onComplete: () => {
          if (this.rewardRoot === root) {
            root.destroy(true);
            this.rewardRoot = null;
            this.rewardAmountText = null;
            this.activeReward = null;
            this.rewardTimer = null;
            this.showNextReward();
          }
        },
      });
    });
  }

  private clearRewardFeed(): void {
    this.rewardTimer?.remove(false);
    this.rewardTimer = null;
    this.rewardRoot?.destroy(true);
    this.rewardRoot = null;
    this.rewardAmountText = null;
    this.activeReward = null;
    this.rewardQueue = [];
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
        fontSize: '9px',
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
    const title = data.investigationThreat
      ? `調査危険度 ${data.investigationThreat}${data.investigationCondition ? `・${data.investigationCondition}` : ''}`
      : `${rank} ${data.veteran ? '歴戦個体' : '大型狩猟開始'}`.trim();
    const titleText = this.add
      .text(w / 2, cy - 34, title, {
        fontFamily: FONT,
        fontSize: '13px',
        color: data.investigationThreat ? '#8fe7e7' : '#ffd86b',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setAlpha(0);
    const bossText = this.add
      .text(w / 2, cy - 6, data.bossName, { fontFamily: FONT, fontSize: '22px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setAlpha(0);
    const questText = this.add
      .text(w / 2, cy + 22, data.investigationRule ?? data.questName, {
        fontFamily: FONT,
        fontSize: '11px',
        color: data.investigationRule ? '#b9eef0' : '#cfd3e6',
      })
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

  /** Prevent a held touch/key from leaking across a death or map restart. */
  resetControls(): void {
    this.stick?.reset();
    input.reset();
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
