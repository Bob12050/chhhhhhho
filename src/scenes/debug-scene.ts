import Phaser from 'phaser';
import { gameState } from '@/player/game-state';
import { allEquipment, allMaterials, allConsumables } from '@/data/items';
import { getMap, spawnPoint, allMaps } from '@/maps/map-def';
import { allQuests } from '@/quests/quest-defs';
import { allSkills } from '@/skills/skill-defs';
import { allJobs } from '@/jobs/job-defs';
import { totalExpForLevel } from '@/stats/leveling';
import { bus } from '@/core/event-bus';
import { FONT, addBackdrop } from '@/ui/theme';
import { INVESTIGATION_SEAL_ID, syncInvestigationQuests } from '@/endgame/investigations';
import { generateInvestigationEquipment } from '@/endgame/investigation-loot';
import { INVESTIGATION_CRYSTAL_ID } from '@/endgame/investigation-forge';
import { allBossRareExchanges } from '@/crafting/boss-rare-exchange';
import { isDebugEnabled } from '@/core/debug';

interface DebugSceneData {
  returnTo?: string;
  settingsFrom?: string;
}

/**
 * Debug menu (gated by core/debug.isDebugEnabled). Warp between maps and grant
 * resources to exercise the full Phase 1 loop quickly on device. Available from
 * the DEV button while the player has enabled debug mode in settings.
 */
export class DebugScene extends Phaser.Scene {
  private status!: Phaser.GameObjects.Text;
  private returnTo = 'World';
  private settingsFrom = '';

  constructor() {
    super('Debug');
  }

  init(data?: DebugSceneData): void {
    this.returnTo = data?.returnTo ?? 'World';
    this.settingsFrom = data?.settingsFrom ?? '';
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    if (!isDebugEnabled()) {
      this.scene.stop();
      this.scene.resume(this.returnTo);
      return;
    }
    addBackdrop(this);
    this.add
      .text(16, 20, 'DEBUG', { fontFamily: FONT, fontSize: '18px', color: '#ff8888' })
      .setDepth(1);

    this.status = this.add
      .text(16, 46, '', { fontFamily: 'system-ui, monospace', fontSize: '11px', color: '#cfd3e6' })
      .setDepth(1);
    this.refreshStatus();

    const hasWorld = this.scene.isActive('World') || this.scene.isPaused('World');
    if (!hasWorld) {
      this.add
        .text(w / 2, 132, 'ゲーム開始後の設定から\nデバッグ機能を利用できます', {
          fontFamily: FONT,
          fontSize: '15px',
          color: '#d9dfec',
          align: 'center',
          lineSpacing: 8,
        })
        .setOrigin(0.5)
        .setDepth(1);
      this.btn(w / 2 - 44, Math.min(220, h - 80), 'とじる', () => this.close(), 0xffd86b);
      this.input.keyboard?.on('keydown-ESC', () => this.close());
      return;
    }

    let y = 88;
    this.label('ワープ', y);
    y += 22;
    const maps: [string, string][] = [
      ['町', 'town'],
      ['草原', 'field'],
      ['洞窟', 'dungeon'],
      ['ボス', 'boss_room'],
    ];
    maps.forEach(([lbl, id], i) => this.btn(16 + i * 84, y, lbl, () => this.warp(id)));
    y += 44;

    this.label('付与', y);
    y += 22;
    this.btn(16, y, '+Lv', () => this.grant(() => gameState.gainExp(1000)));
    this.btn(110, y, '能力P+5', () => this.grant(() => (gameState.statPoints += 5)));
    this.btn(220, y, '技P+3', () => this.grant(() => (gameState.skillPoints += 3)));
    y += 40;
    this.btn(16, y, '+100G', () => this.grant(() => gameState.addGold(100)));
    this.btn(110, y, '素材+5', () => this.grant(() => this.grantMaterials()));
    this.btn(220, y, '全回復', () => this.grant(() => gameState.fullHeal()));
    y += 40;
    this.btn(16, y, '全装備入手', () => this.grant(() => this.grantAllEquipment()));
    this.btn(160, y, 'ペット入手', () => this.grant(() => gameState.obtainPetItem('pet_egg_slime')));
    y += 40;
    this.btn(16, y, '鉄装備試着', () => this.previewPaperDoll(), 0x365070);
    this.btn(160, y, '職業ツリー', () => this.previewJobTree(), 0x365070);
    y += 40;
    this.btn(16, y, '全討伐証+12', () => this.grant(() => this.grantHuntProofs()), 0x275b55);
    this.btn(160, y, 'スコル4部位', () => this.previewSkollSet(), 0x275b55);
    y += 40;
    this.btn(16, y, '調査装備+素材', () => this.previewInvestigationGear(), 0x275b55);
    y += 40;
    this.btn(16, y, '★最強モード（Lv99・全解放）', () => this.grant(() => this.godMode()), 0x6a2a2a);
    y += 44;
    this.btn(
      16,
      y,
      'もりの主実演',
      () => this.previewHunt('subj_treant', 'arena_grove', 180, 500),
      0x365070,
    );
    y += 40;
    this.btn(16, y, 'ゼフィス実演', () => this.previewZephys(), 0x365070);
    this.btn(
      142,
      y,
      'アルマギア実演',
      () => this.previewHunt('hunt_r7_04_almagia', 'arena_abyss', 180, 500),
      0x365070,
    );
    y += 40;
    this.btn(16, y, '第二形態を即確認', () => this.triggerBossPhase(), 0x6a2a52);
    y += 40;
    this.btn(16, y, '通し確認チェックリスト', () => {
      this.stopSettingsStack();
      this.scene.stop();
      this.scene.launch('Checklist');
    });
    y += 40;
    this.btn(16, y, '周回バランスラボ', () => {
      this.scene.pause();
      this.scene.launch('BalanceLab');
    }, 0x275b55);
    y += 48;

    this.btn(w / 2 - 44, y, 'とじる', () => this.close(), 0xffd86b);
    this.input.keyboard?.on('keydown-ESC', () => this.close());
  }

  private warp(mapId: string, x?: number, y?: number): void {
    const m = getMap(mapId);
    if (!m) return;
    const sp = spawnPoint(m, 'default');
    gameState.mapId = mapId;
    gameState.x = x ?? sp.x;
    gameState.y = y ?? sp.y;
    this.returnToGameplay();
    bus.emit('debug:warp', {});
  }

  private grant(fn: () => void): void {
    fn();
    this.refreshStatus();
  }

  private grantMaterials(): void {
    const ids = [
      'slime_jelly',
      'soft_leather',
      'iron_ore',
      'herb',
      'mana_stone',
      'king_jelly',
      'golem_core',
      'shadow_wing',
      'star_fragment',
    ];
    for (const id of ids) gameState.addMaterial(id, 5);
  }

  private grantAllEquipment(): void {
    for (const e of allEquipment()) gameState.addEquipment(e.id);
  }

  private previewPaperDoll(): void {
    const gs = gameState;
    const equipment = {
      main_hand: 'iron_sword',
      head: 'iron_helm',
      torso: 'iron_plate',
      hands: 'iron_gloves',
      feet: 'iron_boots',
    } as const;
    gs.jobId = 'fighter';
    gs.level = Math.max(10, gs.level);
    gs.jobLevels.fighter = Math.max(10, gs.jobLevels.fighter ?? 1);
    if (!gs.unlockedJobs.includes('fighter')) gs.unlockedJobs.push('fighter');
    for (const itemId of Object.values(equipment)) {
      if (!gs.equipmentOwned.includes(itemId)) gs.addEquipment(itemId);
    }
    Object.assign(gs.equipment, equipment);
    gs.recompute();
    gs.fullHeal();
    bus.emit('job:changed', { jobId: 'fighter' });
    this.returnToGameplay();
  }

  private previewJobTree(): void {
    this.stopSettingsStack();
    this.scene.stop();
    this.scene.launch('JobChange');
  }

  private grantHuntProofs(): void {
    for (const exchange of allBossRareExchanges()) {
      gameState.addMaterial(exchange.proofItemId, 12);
    }
  }

  private previewSkollSet(): void {
    const pieces = {
      main_hand: 'skoll_blade',
      head: 'skoll_helm',
      waist: 'skoll_coil',
      feet: 'skoll_greaves',
    } as const;
    for (const itemId of Object.values(pieces)) gameState.addEquipment(itemId);
    Object.assign(gameState.equipment, pieces);
    gameState.recompute();
    this.stopSettingsStack();
    this.scene.stop();
    this.scene.launch('Inventory', { tab: 'equipment' });
  }

  private previewInvestigationGear(): void {
    const gs = gameState;
    gs.level = Math.max(99, gs.level);
    gs.jobId = 'aramikagura';
    gs.flags['main_story_complete'] = true;
    let [quest] = syncInvestigationQuests(gs);
    let def = quest ? generateInvestigationEquipment(gs, quest) : null;
    while (def && gs.generatedEquipment[def.id]) {
      gs.investigationSeed = (gs.investigationSeed + 0x9e3779b9) >>> 0;
      [quest] = syncInvestigationQuests(gs);
      def = quest ? generateInvestigationEquipment(gs, quest) : null;
    }
    if (def) gs.addGeneratedEquipment(def);
    gs.addMaterial(INVESTIGATION_CRYSTAL_ID, 99);
    gs.addMaterial(INVESTIGATION_SEAL_ID, 99);
    gs.recompute();
    this.stopSettingsStack();
    this.scene.stop();
    this.scene.launch('Inventory', { tab: 'equipment' });
  }

  /** Debug-only visual route: launch the base Zephys hunt without progression gates. */
  private previewZephys(): void {
    this.previewHunt('hunt_r2_01_zephys', 'arena_plain');
  }

  private previewHunt(questId: string, mapId: string, x?: number, y?: number): void {
    if (!gameState.activeQuests.includes(questId)) {
      gameState.activeQuests.push(questId);
    }
    gameState.questProgress[questId] = {};
    bus.emit('quest:changed', {});
    this.warp(mapId, x, y);
  }

  private triggerBossPhase(): void {
    bus.emit('debug:boss-phase', {});
    this.returnToGameplay();
  }

  /**
   * 最強モード: one tap to end-game state for testing. Lv99, every job/skill/
   * recipe/quest/map unlocked, full inventory and riches. Debug-only by nature.
   */
  private godMode(): void {
    const gs = gameState;
    // Lv99 via the normal exp path so stat/skill points and events flow as usual.
    const target = totalExpForLevel(99);
    const current = totalExpForLevel(gs.level) + gs.exp;
    if (target > current) gs.gainExp(target - current);
    // 全職解放＋全職Lv99（現職はそのまま）.
    for (const j of allJobs()) {
      if (!gs.unlockedJobs.includes(j.id)) gs.unlockedJobs.push(j.id);
      gs.jobLevels[j.id] = 99;
    }
    // 全スキル習得.
    for (const s of allSkills()) gs.skills[s.id] = 1;
    // 富と物資: 全素材99（=全レシピ解放）・全消耗品99・全装備・大金.
    for (const m of allMaterials()) gs.addMaterial(m.id, 99);
    for (const c of allConsumables()) gs.addConsumable(c.id, 99);
    this.grantAllEquipment();
    gs.addGold(999999);
    // 全クエスト解放: 前提クエストを完了扱いにし、要求フラグを立てる.
    const prereqs = new Set<string>();
    for (const q of allQuests()) {
      if (q.require?.questDone) prereqs.add(q.require.questDone);
      if (q.require?.flag) gs.flags[q.require.flag] = true;
    }
    for (const id of prereqs) {
      if (!gs.completedQuests.includes(id)) gs.completedQuests.push(id);
    }
    // 全マップ解放: ポータルの解錠フラグ＋訪問済みフラグ.
    for (const m of allMaps()) {
      gs.flags[`visited_${m.id}`] = true;
      if (m.travel?.unlockFlag) gs.flags[m.travel.unlockFlag] = true;
      for (const p of m.portals ?? []) {
        if (p.requiresFlag) gs.flags[p.requiresFlag] = true;
      }
    }
    gs.recompute();
    gs.fullHeal();
    bus.emit('quest:changed', {});
    bus.emit('save:written', { slot: -1 });
  }

  private refreshStatus(): void {
    const g = gameState;
    this.status.setText(
      `Lv${g.level} 職:${g.jobId} G:${g.gold}  能P:${g.statPoints} 技P:${g.skillPoints}  pet:${g.activePetId ?? '-'}`,
    );
  }

  private label(text: string, y: number): void {
    this.add
      .text(16, y, text, { fontFamily: FONT, fontSize: '12px', color: '#9aa0b5' })
      .setDepth(1);
  }

  private btn(x: number, y: number, label: string, cb: () => void, color = 0x2a2d44): void {
    const t = this.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: '13px',
        color: '#ffffff',
        backgroundColor: typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : '#2a2d44',
        padding: { x: 10, y: 7 },
      })
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    t.on('pointerup', cb);
  }

  private close(): void {
    this.scene.stop();
    this.scene.resume(this.returnTo);
  }

  private stopSettingsStack(): void {
    if (this.returnTo !== 'Options') return;
    this.scene.stop('Options');
    if (this.settingsFrom === 'Inventory') this.scene.stop('Inventory');
  }

  private returnToGameplay(): void {
    this.stopSettingsStack();
    this.scene.stop();
    this.scene.resume('World');
  }
}
