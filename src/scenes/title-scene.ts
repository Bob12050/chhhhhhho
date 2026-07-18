import Phaser from 'phaser';
import { applyPendingUpdate, isUpdateReady } from '@/core/pwa';
import { bus } from '@/core/event-bus';
import { FONT } from '@/ui/theme';
import { bgm } from '@/audio/bgm-engine';
import { TEX } from '@/assets/gen/textures';
import { frameIndex } from '@/paperdoll/pose-atlas';
import { saveManager } from '@/save/save-manager';
import { beginGame } from '@/core/game-flow';
import { appearanceTextureScale } from '@/jobs/job-appearance';

/** Displayed game title (single source; swap here when the real name lands). */
const GAME_TITLE = 'Pixel Action RPG';
const VERSION = 'ver 0.2';

/** Walker parade: job sheets (real PNGs) with the bald body as a fallback. */
const PARADE_TEX = [
  TEX.jobFighter,
  TEX.jobMage,
  TEX.jobPriest,
  TEX.jobThief,
  TEX.jobPetRaiser,
  TEX.playerBodyBald,
];

interface Walker {
  sprite: Phaser.GameObjects.Sprite;
  speed: number;
  frame: number;
  elapsed: number;
  animated: boolean;
}

/**
 * Title screen. A living vignette of the game itself: grass world, a road
 * where the five jobs (and a slime) parade across, fireflies, and a framed
 * logo. A pending PWA update (deferred during play) is applied here, where a
 * reload is safe. From here the player goes to save-slot selection.
 */
export class TitleScene extends Phaser.Scene {
  private updateText?: Phaser.GameObjects.Text;
  private walkers: Walker[] = [];
  private nextTex = 0;

  constructor() {
    super('Title');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.walkers = [];
    this.nextTex = 0;

    bgm.play('town');
    this.buildBackdrop(w, h);
    this.buildParade(w, h);
    this.buildFireflies(w, h);
    this.buildLogo(w, h);
    this.buildMenu(w, h);

    // If a new app version is waiting, offer to apply it now (safe at title).
    this.updateText = this.add
      .text(w / 2, h - 22, '', { fontFamily: FONT, fontSize: '12px', color: '#ffd86b' })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.updateText.on('pointerup', () => void applyPendingUpdate());
    const showUpdate = (): void => {
      this.updateText?.setText('更新があります（タップで適用）').setVisible(true);
    };
    // Catch an update that became ready before this scene subscribed (during
    // Boot/Notice), then keep listening for one that arrives while on the title.
    if (isUpdateReady()) showUpdate();
    const off = bus.on('pwa:update-available', showUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);

    this.input.keyboard?.once('keydown-ENTER', () => this.scene.start('SaveSelect'));
  }

  /** Grass world + road + trees/flowers + readability shading. */
  private buildBackdrop(w: number, h: number): void {
    this.add.tileSprite(0, 0, w, h, TEX.tileGrass).setOrigin(0).setDepth(0);
    // The parade road, low on the screen.
    const roadY = Math.round(h * 0.72);
    this.add.tileSprite(0, roadY - 28, w, 56, TEX.tilePath).setOrigin(0).setDepth(1);

    // Scattered scenery (deterministic layout; the title should look designed).
    const trees: [number, number, string][] = [
      [26, roadY - 90, TEX.obstaclePine],
      [70, roadY - 64, TEX.obstacle],
      [w - 30, roadY - 96, TEX.obstacle],
      [w - 74, roadY - 60, TEX.obstacleBush],
      [40, roadY + 74, TEX.obstacleBush],
      [w - 44, roadY + 82, TEX.obstaclePine],
      [w - 110, roadY + 64, TEX.obstacle],
    ];
    for (const [x, y, tex] of trees) this.add.image(x, y, tex).setDepth(2);
    const decor: [number, number, string][] = [
      [58, roadY - 110, TEX.decorFlowerA],
      [w - 60, roadY - 44, TEX.decorFlowerB],
      [110, roadY + 60, TEX.decorTuft],
      [w - 130, roadY + 90, TEX.decorFlowerA],
      [24, roadY + 110, TEX.decorTuft],
      [w / 2, roadY - 52, TEX.decorPebble],
    ];
    for (const [x, y, tex] of decor) this.add.image(x, y, tex).setDepth(1);

    // Shade the top half so the logo reads; deepen the very bottom for menu.
    const shade = this.add.graphics().setDepth(5);
    const bands = 40; // fine steps: reads as a gradient, not stripes
    for (let i = 0; i < bands; i++) {
      shade.fillStyle(0x0e0f1a, 0.58 * (1 - i / bands));
      shade.fillRect(0, Math.floor((i * h * 0.5) / bands), w, Math.ceil((h * 0.5) / bands) + 1);
    }
    shade.fillStyle(0x0e0f1a, 0.35);
    shade.fillRect(0, h - 70, w, 70);
  }

  /** Job characters (and a slime) stroll across the road in a loop. */
  private buildParade(w: number, h: number): void {
    const roadY = Math.round(h * 0.72);
    const spawn = (tex: string, x: number, isSlime = false): void => {
      if (!this.textures.exists(tex)) return;
      const animated = this.supportsWalkAnimation(tex);
      const s = this.add
        .sprite(x, roadY, tex, animated ? frameIndex('left', 'walk', 0) : 0)
        .setOrigin(0.5, 0.875)
        .setScale(appearanceTextureScale(tex))
        .setFlipX(true) // right = mirrored left (pose-atlas rule)
        .setDepth(10);
      if (isSlime) s.setTint(0x9fe36a);
      this.walkers.push({
        sprite: s,
        speed: isSlime ? 34 : 38,
        frame: 0,
        elapsed: 0,
        animated,
      });
    };
    // Staggered start so the screen is alive immediately.
    spawn(this.pickParadeTex(), w * 0.55);
    spawn(this.pickParadeTex(), w * 0.2);
    spawn(TEX.slime, w * 0.02, true);
  }

  private pickParadeTex(): string {
    for (let i = 0; i < PARADE_TEX.length; i++) {
      const tex = PARADE_TEX[(this.nextTex + i) % PARADE_TEX.length];
      if (this.textures.exists(tex)) {
        this.nextTex = (this.nextTex + i + 1) % PARADE_TEX.length;
        return tex;
      }
    }
    return TEX.playerBody; // always generated
  }

  private supportsWalkAnimation(tex: string): boolean {
    return this.textures.get(tex).has(String(frameIndex('left', 'walk', 3)));
  }

  /** Slow-drifting gold motes (fireflies) for a bit of life. */
  private buildFireflies(w: number, h: number): void {
    for (let i = 0; i < 9; i++) {
      const x = Math.round(Math.random() * w);
      const y = Math.round(h * 0.3 + Math.random() * h * 0.6);
      const fly = this.add
        .circle(x, y, Math.random() < 0.5 ? 1.5 : 2, 0xffe9a0, 0.8)
        .setDepth(12)
        .setAlpha(0);
      this.tweens.add({
        targets: fly,
        y: y - 60 - Math.random() * 60,
        alpha: { from: 0, to: 0.85 },
        duration: 2400 + Math.random() * 2200,
        delay: Math.random() * 2600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.InOut',
      });
    }
  }

  /** Emblem + framed title text with an entrance drop. */
  private buildLogo(w: number, h: number): void {
    const cx = w / 2;
    const cy = Math.round(h * 0.26);

    // Pixel crown emblem (procedural, gold with darker outline).
    const g = this.add.graphics().setDepth(20);
    const px = (x: number, y: number, pw: number, ph: number, c: number): void => {
      g.fillStyle(c, 1);
      g.fillRect(cx + x * 3, cy - 74 + y * 3, pw * 3, ph * 3);
    };
    // outline
    px(-8, 2, 16, 6, 0x6a4a14);
    px(-8, 0, 2, 4, 0x6a4a14);
    px(6, 0, 2, 4, 0x6a4a14);
    px(-1, -1, 2, 4, 0x6a4a14);
    // body
    px(-7, 3, 14, 4, 0xf5c542);
    px(-7, 1, 1, 3, 0xf5c542);
    px(6, 1, 1, 3, 0xf5c542);
    px(0, 0, 1, 4, 0xf5c542);
    px(-4, 2, 1, 3, 0xffe9a0);
    // gems
    px(-2, 4, 1, 1, 0xd05a6e);
    px(2, 4, 1, 1, 0x5a9ad0);

    const title = this.add
      .text(cx, cy, GAME_TITLE, {
        fontFamily: FONT,
        fontSize: '30px',
        color: '#f8fbff',
        fontStyle: 'bold',
        stroke: '#10182a',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setShadow(0, 3, '#000000', 3, false, true);
    const sub = this.add
      .text(cx, cy + 28, '狩って、作って、強くなる', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#ffe9a8',
        fontStyle: 'bold',
        stroke: '#10182a',
        strokeThickness: 1,
      })
      .setOrigin(0.5)
      .setDepth(21)
      .setShadow(0, 1, '#000000', 2);
    // Gold rule lines flanking the subtitle.
    const rule = this.add.graphics().setDepth(21);
    rule.fillStyle(0xf5c542, 0.8);
    rule.fillRect(cx - 120, cy + 27, 34, 2);
    rule.fillRect(cx + 86, cy + 27, 34, 2);

    // Entrance: drop + fade (integer-friendly, no scaling).
    for (const t of [g, title, sub, rule] as const) {
      const targetY = (t as Phaser.GameObjects.Components.Transform).y;
      (t as Phaser.GameObjects.Components.Transform).setY(targetY - 14);
      (t as unknown as Phaser.GameObjects.Components.AlphaSingle).setAlpha(0);
      this.tweens.add({ targets: t, y: targetY, alpha: 1, duration: 420, ease: 'Quad.easeOut' });
    }
  }

  /** Fast continue + save management + settings, fading in after the logo. */
  private buildMenu(w: number, h: number): void {
    const menuY = h * 0.5;
    const startBtn = this.makeButton(w / 2, menuY, '▶ ゲームをはじめる', true, () =>
      this.scene.start('SaveSelect'),
    );
    const continueDetail = this.add
      .text(w / 2, menuY + 27, '', { fontFamily: FONT, fontSize: '10px', color: '#d8e6ff' })
      .setOrigin(0.5)
      .setDepth(30);
    const savesBtn = this.makeButton(w / 2, menuY + 60, 'セーブを選ぶ', false, () =>
      this.scene.start('SaveSelect'),
    );
    const soundBtn = this.makeButton(w / 2, menuY + 104, '⚙ 設定', false, () => {
      this.scene.pause();
      this.scene.launch('Options', { from: 'Title' });
    });
    const ver = this.add
      .text(8, h - 8, VERSION, { fontFamily: FONT, fontSize: '10px', color: '#9aa0b5' })
      .setOrigin(0, 1)
      .setDepth(30)
      .setAlpha(0.8);

    // Fade the menu in slightly after the logo drop.
    for (const o of [
      startBtn.frame,
      startBtn.label,
      continueDetail,
      savesBtn.frame,
      savesBtn.label,
      soundBtn.frame,
      soundBtn.label,
      ver,
    ]) {
      const a = o.alpha;
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: a, duration: 380, delay: 340 });
    }
    // Gentle pulse on the start button (alpha only: keeps pixels crisp).
    this.tweens.add({
      targets: startBtn.frame,
      alpha: 0.75,
      duration: 900,
      delay: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });

    // Returning players skip the save picker: resume the most recently saved
    // slot in one tap. Save management remains a separate explicit command.
    void saveManager.summaries().then((summaries) => {
      const latest = summaries
        .filter((s) => s.exists)
        .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))[0];
      if (!latest || !startBtn.frame.active || !this.scene.isActive()) return;
      startBtn.label.setText('▶ つづきから');
      startBtn.setAction(() => void beginGame(this, latest.slot, 'load'));
      continueDetail.setText(`スロット${latest.slot + 1}  Lv ${latest.level ?? '?'}`);
    });
  }

  private makeButton(
    x: number,
    y: number,
    label: string,
    primary: boolean,
    onTap: () => void,
  ): {
    frame: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
    setAction: (next: () => void) => void;
  } {
    const bw = primary ? 216 : 172;
    const bh = primary ? 44 : 36;
    const frame = this.add
      .rectangle(x, y, bw, bh, primary ? 0x2a2d44 : 0x1c1e30, 0.92)
      .setStrokeStyle(2, primary ? 0xf5c542 : 0x555a78, primary ? 0.9 : 0.8)
      .setDepth(25)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: primary ? '17px' : '13px',
        color: primary ? '#ffffff' : '#cfd3e6',
      })
      .setOrigin(0.5)
      .setDepth(26);
    let action = onTap;
    frame.on('pointerup', () => action());
    return { frame, label: text, setAction: (next) => (action = next) };
  }

  update(_time: number, delta: number): void {
    const w = this.scale.width;
    // Advance the parade: 4-frame walk cycle, recycle walkers off-screen.
    for (const walker of this.walkers) {
      walker.sprite.x += (walker.speed * delta) / 1000;
      walker.elapsed += delta;
      if (walker.elapsed >= 140) {
        walker.elapsed -= 140;
        walker.frame = (walker.frame + 1) % 4;
        if (walker.animated) walker.sprite.setFrame(frameIndex('left', 'walk', walker.frame));
      }
      walker.sprite.setX(Math.round(walker.sprite.x));
      if (walker.sprite.x > w + 60) {
        walker.sprite.x = -60 - Math.random() * 80;
        // Slimes stay slimes; heroes rotate through the roster.
        if (walker.sprite.texture.key !== TEX.slime) {
          const tex = this.pickParadeTex();
          walker.animated = this.supportsWalkAnimation(tex);
          walker.sprite.setTexture(
            tex,
            walker.animated ? frameIndex('left', 'walk', walker.frame) : 0,
          );
          walker.sprite.setFlipX(true);
        }
      }
    }
  }
}
