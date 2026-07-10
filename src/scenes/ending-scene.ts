import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allEnemyDefs } from '@/enemies/enemy-defs';
import { allPets } from '@/pets/pet-defs';
import { FONT, FONT_PIXEL, pillButton } from '@/ui/theme';
import { bus } from '@/core/event-bus';

/**
 * Ending roll, shown once after turning in the final main quest (古代機神
 * discussion). A slow upward credits scroll over black: epilogue text, the
 * player's own hunting record (level / kills / bestiary / pets / gold), and
 * a "the hunt goes on" sign-off. Tap-through skip; returns to the world —
 * post-game hunts stay open.
 */
export class EndingScene extends Phaser.Scene {
  constructor() {
    super('Ending');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.add.rectangle(0, 0, w, h, 0x05060c, 1).setOrigin(0).setDepth(0);

    const kills = Object.values(gameState.killCounts).reduce((a, b) => a + b, 0);
    const found = allEnemyDefs().filter((e) => (gameState.killCounts[e.id] ?? 0) > 0).length;
    const lines: { text: string; size?: string; color?: string; gap?: number; pixel?: boolean }[] = [
      { text: '— 深淵は、静かになった —', size: '15px', color: '#9fd0ff', gap: 40 },
      { text: '製作者なき命令は果たされず', gap: 22 },
      { text: '古代機神は千年ぶりの眠りについた', gap: 56 },
      { text: 'あなたの狩猟記録', size: '13px', color: '#ffd86b', gap: 30 },
      { text: `レベル ${gameState.level}`, gap: 22 },
      { text: `総討伐数 ${kills}体`, gap: 22 },
      { text: `図鑑 ${found} / ${allEnemyDefs().length}`, gap: 22 },
      { text: `なかま ${gameState.ownedPets.length} / ${allPets().length}`, gap: 22 },
      { text: `所持金 ${gameState.gold}G`, gap: 56 },
      { text: 'そして——', gap: 22 },
      { text: '歴戦の獲物たちは、まだ荒野で待っている', gap: 64 },
      { text: 'Fin.', size: '26px', color: '#ffd86b', gap: 40, pixel: true },
      { text: '狩猟は続く', size: '12px', color: '#9aa0b5', gap: 0 },
    ];

    const roll = this.add.container(0, 0).setDepth(1);
    let y = h + 30;
    for (const l of lines) {
      roll.add(
        this.add
          .text(w / 2, y, l.text, {
            fontFamily: l.pixel ? FONT_PIXEL : FONT,
            fontSize: l.size ?? '13px',
            color: l.color ?? '#e6e9f5',
            align: 'center',
          })
          .setOrigin(0.5),
      );
      y += l.gap ?? 24;
    }
    // Content spans firstY..y in roll-space; park its middle at screen center.
    const firstY = h + 30;
    const contentH = y - firstY;
    const restY = h / 2 - (firstY + contentH / 2);
    this.tweens.add({
      targets: roll,
      y: restY,
      duration: Math.max(9000, (contentH + h) * 22),
      ease: 'Linear',
      onComplete: () => this.showReturn(),
    });

    bus.emit('sfx:play', { id: 'fanfare' });
    // Tap skips to the end of the roll.
    this.input.once('pointerup', () => {
      this.tweens.killAll();
      roll.y = restY;
      this.showReturn();
    });
  }

  private showReturn(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    pillButton(this, w / 2, h - 60, '世界へ戻る', () => this.close(), {
      color: '#ffe9a8',
      bg: '#39406a',
      size: 15,
    }).setDepth(2);
    this.input.keyboard?.once('keydown-ESC', () => this.close());
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume('World');
    bus.emit('save:written', { slot: -1 });
  }
}
