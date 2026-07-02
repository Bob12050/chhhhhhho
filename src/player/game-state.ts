import {
  computeDerived,
  type BaseStats,
  type DerivedStats,
  type StatModifiers,
} from '@/stats/stats';
import { getEquipment, getConsumable } from '@/data/items';
import { getSkill } from '@/skills/skill-defs';
import { getJob } from '@/jobs/job-defs';
import { getQuest } from '@/quests/quest-defs';
import { canEquipClass, canEquipWeapon, canEquipTier } from '@/equipment/restrictions';
import { getPet } from '@/pets/pet-defs';
import { getPetItem } from '@/data/items';
import { EQUIP_SLOTS, type EquipSlot } from '@/equipment/slots';
import { bus } from '@/core/event-bus';
import { expToNext } from '@/stats/leveling';
import type { SaveData } from '@/save/schema';

/**
 * Central runtime player model. Holds base stats / level / equipment /
 * inventory, recomputes derived stats in one place, and emits change events.
 * Scenes and UI read from here; nobody recomputes stats independently.
 */
export class GameState {
  level = 1;
  exp = 0;
  statPoints = 0;
  base: BaseStats = { STR: 5, VIT: 5, INT: 5, DEX: 5, LUK: 5 };

  equipment: Record<EquipSlot, string | null> = {
    head: null,
    torso: null,
    hands: null,
    waist: null,
    feet: null,
    back: null,
    main_hand: null,
    accessory_1: null,
    accessory_2: null,
  };

  materials: Record<string, number> = {};
  consumables: Record<string, number> = {};
  /** Owned equipment ids (one entry per piece; equipped items are included). */
  equipmentOwned: string[] = [];

  flags: Record<string, boolean> = {};

  /** Quest state: accepted ids, turned-in ids, and per-quest kill progress. */
  activeQuests: string[] = [];
  /** Temporary skill buffs (runtime-only, not saved). */
  tempBuffs: { stats: Partial<DerivedStats>; expiresAt: number }[] = [];
  completedQuests: string[] = [];
  questProgress: Record<string, Record<string, number>> = {};

  hp = 1;
  mp = 0;
  gold = 0;
  /** Learned skills (id -> level) and the two active skill slots. */
  skills: Record<string, number> = {};
  skillSlots: (string | null)[] = [null, null];
  skillPoints = 0;
  jobId = 'adventurer';
  unlockedJobs: string[] = ['adventurer'];
  /**
   * Per-job levels/exp (multi-job system). The active job's level/exp mirror
   * `this.level`/`this.exp`; inactive jobs retain their own progress here so a
   * player can build up several jobs to meet 2次職以降の転職条件.
   */
  jobLevels: Record<string, number> = { adventurer: 1 };
  jobExp: Record<string, number> = { adventurer: 0 };
  ownedPets: string[] = [];
  activePetId: string | null = null;
  derived: DerivedStats = computeDerived(this.base);

  mapId = 'town';
  x = 180;
  y = 360;
  /** Active save slot (so autosave writes back to the loaded slot). */
  slot = 0;

  /** Recompute derived stats from base + equipment, clamping HP/MP. */
  recompute(preserveRatio = true): void {
    const mods: StatModifiers[] = [];
    // Job modifiers (base + derived).
    const job = getJob(this.jobId);
    if (job?.baseStatModifiers) mods.push({ base: job.baseStatModifiers });
    if (job?.derivedModifiers) mods.push({ derived: job.derivedModifiers });
    for (const slot of EQUIP_SLOTS) {
      const id = this.equipment[slot];
      if (!id) continue;
      const def = getEquipment(id);
      if (def) mods.push({ derived: def.derived });
    }
    // Passive skills contribute derived modifiers too.
    for (const id of Object.keys(this.skills)) {
      const sk = getSkill(id);
      if (sk?.type === 'passive' && sk.derived) mods.push({ derived: sk.derived });
    }
    // Active pet passive.
    const pet = this.activePetId ? getPet(this.activePetId) : undefined;
    if (pet?.passive) mods.push({ derived: pet.passive });
    // Temporary skill buffs (雄叫び etc.); expiry is ticked by the scene.
    for (const b of this.tempBuffs) mods.push({ derived: b.stats });
    const prev = this.derived;
    const hpRatio = prev.maxHp > 0 ? this.hp / prev.maxHp : 1;
    const mpRatio = prev.maxMp > 0 ? this.mp / prev.maxMp : 1;
    this.derived = computeDerived(this.base, mods);
    if (preserveRatio) {
      this.hp = Math.min(this.derived.maxHp, Math.max(1, Math.round(this.derived.maxHp * hpRatio)));
      this.mp = Math.min(this.derived.maxMp, Math.round(this.derived.maxMp * mpRatio));
    }
    bus.emit('player:stats-recomputed', {});
    bus.emit('player:hp-changed', { current: this.hp, max: this.derived.maxHp });
    bus.emit('player:mp-changed', { current: this.mp, max: this.derived.maxMp });
  }

  fullHeal(): void {
    this.hp = this.derived.maxHp;
    this.mp = this.derived.maxMp;
    bus.emit('player:hp-changed', { current: this.hp, max: this.derived.maxHp });
    bus.emit('player:mp-changed', { current: this.mp, max: this.derived.maxMp });
  }

  /**
   * Why the current job can't equip this item (or null if it can):
   *  - 'tier'   : rarity needs a higher job tier (rarity↔progression gate)
   *  - 'weapon' : weapon tag not allowed by the job
   *  - 'class'  : armour/accessory class-family restriction
   */
  equipBlock(itemId: string): 'tier' | 'weapon' | 'class' | null {
    const def = getEquipment(itemId);
    if (!def) return null;
    const job = getJob(this.jobId);
    if (!canEquipTier(job?.tier ?? 0, def.rarity)) return 'tier';
    if (def.slot === 'main_hand') {
      return canEquipWeapon(job?.equippableWeaponTags ?? [], def.weaponTags) ? null : 'weapon';
    }
    return canEquipClass(job?.family, def.classRestrictions) ? null : 'class';
  }

  /** Equipped main-hand weapon's element ('none' if unarmed/no element). */
  weaponElement(): string {
    const id = this.equipment.main_hand;
    return (id ? getEquipment(id)?.element : undefined) ?? 'none';
  }

  /** Whether the current job may equip this item (tier + weapon/class gates). */
  canEquip(itemId: string): boolean {
    return !!getEquipment(itemId) && this.equipBlock(itemId) === null;
  }

  equip(slot: EquipSlot, itemId: string | null): void {
    if (itemId && !this.canEquip(itemId)) return;
    this.equipment[slot] = itemId;
    if (itemId) this.flags['equipped_any'] = true;
    this.recompute();
    bus.emit('equipment:changed', { slot });
  }

  /** The level of a given job (active job mirrors `this.level`). */
  jobLevelOf(id: string): number {
    if (id === this.jobId) return this.level;
    return this.jobLevels[id] ?? 0;
  }

  /** Why the player can't change to a job right now (or null if they can). */
  jobChangeBlock(
    id: string,
  ): 'current' | 'unknown' | 'level' | 'skill' | 'flag' | 'quest' | null {
    if (id === this.jobId) return 'current';
    const def = getJob(id);
    if (!def) return 'unknown';
    for (const c of def.unlockConditions) {
      switch (c.type) {
        case 'jobLevel':
          if (this.jobLevelOf(c.jobId) < c.level) return 'level';
          break;
        case 'charLevel':
          if (this.level < c.level) return 'level';
          break;
        case 'skill':
          if (!this.skills[c.skillId]) return 'skill';
          break;
        case 'flag':
          if (!this.flags[c.flag]) return 'flag';
          break;
        case 'quest':
          // Quest content is TBD; until quests exist a cleared flag stands in.
          if (!this.flags[`quest_${c.questId}`]) return 'quest';
          break;
      }
    }
    return null;
  }

  changeJob(id: string): boolean {
    if (this.jobChangeBlock(id) !== null) return false;
    // Stash the outgoing job's progress, then swap in the new job's progress.
    this.jobLevels[this.jobId] = this.level;
    this.jobExp[this.jobId] = this.exp;
    this.jobId = id;
    this.level = this.jobLevels[id] ?? 1;
    this.exp = this.jobExp[id] ?? 0;
    if (!this.unlockedJobs.includes(id)) this.unlockedJobs.push(id);
    // Unequip a weapon the new job can't use.
    const wpn = this.equipment.main_hand;
    if (wpn && !this.canEquip(wpn)) this.equipment.main_hand = null;
    this.recompute();
    bus.emit('job:changed', { jobId: id });
    return true;
  }

  addGold(amount: number): void {
    this.gold = Math.max(0, this.gold + amount);
    bus.emit('gold:changed', { current: this.gold });
  }

  addMaterial(id: string, qty: number): void {
    this.materials[id] = (this.materials[id] ?? 0) + qty;
    bus.emit('inventory:changed', {});
    bus.emit('item:picked-up', { itemId: id, quantity: qty });
  }

  addConsumable(id: string, qty: number): void {
    this.consumables[id] = (this.consumables[id] ?? 0) + qty;
    bus.emit('inventory:changed', {});
  }

  /** Use one consumable, applying its effect. Returns false if none/no effect. */
  /** Apply a temporary derived-stat buff for durationMs (skill effect). */
  addBuff(stats: Partial<DerivedStats>, durationMs: number, now: number): void {
    this.tempBuffs.push({ stats, expiresAt: now + durationMs });
    this.recompute();
  }

  /** Drop expired buffs; returns true (and recomputes) if any ended. */
  expireBuffs(now: number): boolean {
    const before = this.tempBuffs.length;
    if (before === 0) return false;
    this.tempBuffs = this.tempBuffs.filter((b) => b.expiresAt > now);
    if (this.tempBuffs.length === before) return false;
    this.recompute();
    return true;
  }

  useConsumable(id: string): boolean {
    if ((this.consumables[id] ?? 0) < 1) return false;
    const def = getConsumable(id);
    if (!def) return false;
    const healHp = def.effect.hp ?? 0;
    const healMp = def.effect.mp ?? 0;
    // Don't waste a potion when it would do nothing.
    if (healHp > 0 && this.hp >= this.derived.maxHp && healMp === 0) return false;
    if (healMp > 0 && this.mp >= this.derived.maxMp && healHp === 0) return false;
    this.consumables[id] -= 1;
    if (this.consumables[id] <= 0) delete this.consumables[id];
    if (healHp) this.hp = Math.min(this.derived.maxHp, this.hp + healHp);
    if (healMp) this.mp = Math.min(this.derived.maxMp, this.mp + healMp);
    bus.emit('player:hp-changed', { current: this.hp, max: this.derived.maxHp });
    bus.emit('player:mp-changed', { current: this.mp, max: this.derived.maxMp });
    bus.emit('inventory:changed', {});
    bus.emit('item:used', { itemId: id });
    return true;
  }

  /** Add an owned equipment piece (from crafting / drops / starter kit). */
  addEquipment(id: string): void {
    this.equipmentOwned.push(id);
    bus.emit('inventory:changed', {});
  }

  /** How many copies of an equipment piece the player owns. */
  ownedEquipmentCount(id: string): number {
    return this.equipmentOwned.filter((e) => e === id).length;
  }

  /**
   * Remove one copy of an equipment piece (used by upgrade recipes). Unequips
   * it first if that copy is currently worn. Returns false if none owned.
   */
  removeEquipment(id: string): boolean {
    const idx = this.equipmentOwned.indexOf(id);
    if (idx < 0) return false;
    this.equipmentOwned.splice(idx, 1);
    for (const slot of EQUIP_SLOTS) {
      if (this.equipment[slot] === id && !this.equipmentOwned.includes(id)) {
        this.equipment[slot] = null;
        this.recompute();
        bus.emit('equipment:changed', { slot });
        break;
      }
    }
    bus.emit('inventory:changed', {});
    return true;
  }

  /** Obtain a pet via a pet item: add it and auto-summon if none active. */
  obtainPetItem(petItemId: string): boolean {
    const def = getPetItem(petItemId);
    if (!def) return false;
    this.addPet(def.petId);
    return true;
  }

  addPet(petId: string): void {
    if (!getPet(petId)) return;
    if (!this.ownedPets.includes(petId)) this.ownedPets.push(petId);
    if (this.activePetId === null) this.setActivePet(petId);
    else bus.emit('pet:changed', { petId: this.activePetId });
  }

  setActivePet(petId: string | null): void {
    this.activePetId = petId;
    this.recompute();
    bus.emit('pet:changed', { petId });
  }

  /** Why a skill can't be learned right now (or null if it can). */
  skillLearnBlock(
    id: string,
  ): 'known' | 'unknown' | 'job' | 'tier' | 'points' | 'level' | 'requires' | null {
    if (this.skills[id]) return 'known';
    const def = getSkill(id);
    if (!def) return 'unknown';
    const job = getJob(this.jobId);
    // Job skills require the active job to be of the matching class family.
    if (def.family && job?.family !== def.family) return 'job';
    // …and to have been promoted to at least the skill's job tier.
    if (def.minTier != null && (job?.tier ?? 0) < def.minTier) return 'tier';
    if (this.skillPoints < 1) return 'points';
    if (this.level < (def.requiredLevel ?? 1)) return 'level';
    for (const req of def.requires ?? []) if (!this.skills[req]) return 'requires';
    return null;
  }

  /** Learn a skill (spends one skill point). Returns false if not allowed. */
  learnSkill(id: string): boolean {
    if (this.skillLearnBlock(id) !== null) return false;
    const def = getSkill(id)!;
    this.skillPoints -= 1;
    this.skills[id] = 1;
    if (def.type === 'active') {
      const slot = this.skillSlots.indexOf(null);
      if (slot >= 0) this.skillSlots[slot] = id;
    } else {
      this.recompute();
    }
    bus.emit('skill:learned', { skillId: id });
    return true;
  }

  consumeMaterials(req: Record<string, number>): boolean {
    for (const [id, qty] of Object.entries(req)) {
      if ((this.materials[id] ?? 0) < qty) return false;
    }
    for (const [id, qty] of Object.entries(req)) {
      this.materials[id] -= qty;
    }
    bus.emit('inventory:changed', {});
    return true;
  }

  allocateStat(stat: keyof BaseStats, amount = 1): boolean {
    if (this.statPoints < amount) return false;
    this.statPoints -= amount;
    this.base[stat] += amount;
    this.recompute();
    return true;
  }

  /** Award exp and process level-ups (grants stat points). */
  gainExp(amount: number): void {
    this.exp += amount;
    let leveled = false;
    while (this.exp >= expToNext(this.level)) {
      this.exp -= expToNext(this.level);
      this.level++;
      this.statPoints += 3;
      this.skillPoints += 1;
      leveled = true;
      bus.emit('player:level-up', { level: this.level, statPoints: this.statPoints });
    }
    if (leveled) {
      this.recompute(false);
      this.fullHeal();
    }
    // Keep the active job's stored progress in sync (multi-job system).
    this.jobLevels[this.jobId] = this.level;
    this.jobExp[this.jobId] = this.exp;
    bus.emit('player:exp-changed', {
      current: this.exp,
      toNext: expToNext(this.level),
      level: this.level,
    });
  }

  // --- Save bridge ---
  toSave(slot: number): SaveData {
    return {
      version: 1,
      slot,
      savedAt: Date.now(),
      mapId: this.mapId,
      player: {
        x: this.x,
        y: this.y,
        level: this.level,
        exp: this.exp,
        statPoints: this.statPoints,
        base: { ...this.base },
        hp: this.hp,
        mp: this.mp,
        gold: this.gold,
        skills: { ...this.skills },
        skillSlots: [...this.skillSlots],
        skillPoints: this.skillPoints,
        jobId: this.jobId,
        unlockedJobs: [...this.unlockedJobs],
        jobLevels: { ...this.jobLevels, [this.jobId]: this.level },
        jobExp: { ...this.jobExp, [this.jobId]: this.exp },
        ownedPets: [...this.ownedPets],
        activePetId: this.activePetId,
      },
      equipment: { ...this.equipment },
      inventory: {
        materials: { ...this.materials },
        consumables: { ...this.consumables },
        equipmentOwned: [...this.equipmentOwned],
      },
      flags: { ...this.flags },
      quests: {
        active: [...this.activeQuests],
        completed: [...this.completedQuests],
        progress: structuredClone(this.questProgress),
      },
      settings: { sfx: true, bgm: true },
    };
  }

  loadFrom(data: SaveData): void {
    this.slot = data.slot;
    this.tempBuffs = []; // runtime-only; never carried across loads
    this.level = data.player.level;
    this.exp = data.player.exp;
    this.statPoints = data.player.statPoints;
    this.base = { ...data.player.base };
    this.gold = data.player.gold ?? 0;
    this.skills = { ...(data.player.skills ?? {}) };
    this.skillSlots = [...(data.player.skillSlots ?? [null, null])];
    this.skillPoints = data.player.skillPoints ?? 0;
    this.jobId = data.player.jobId ?? 'adventurer';
    this.unlockedJobs = [...(data.player.unlockedJobs ?? ['adventurer'])];
    this.jobLevels = { ...(data.player.jobLevels ?? { [this.jobId]: this.level }) };
    this.jobExp = { ...(data.player.jobExp ?? { [this.jobId]: this.exp }) };
    this.ownedPets = (data.player.ownedPets ?? []).filter((id) => !!getPet(id));
    this.activePetId =
      data.player.activePetId && getPet(data.player.activePetId) ? data.player.activePetId : null;
    this.mapId = data.mapId;
    this.x = data.player.x;
    this.y = data.player.y;
    this.materials = { ...data.inventory.materials };
    this.consumables = { ...(data.inventory.consumables ?? {}) };
    // Owned equipment: keep only known ids.
    this.equipmentOwned = (data.inventory.equipmentOwned ?? []).filter((id) => !!getEquipment(id));
    this.flags = { ...data.flags };
    // Quests: keep only known ids defensively.
    this.activeQuests = (data.quests?.active ?? []).filter((id) => !!getQuest(id));
    this.completedQuests = (data.quests?.completed ?? []).filter((id) => !!getQuest(id));
    this.questProgress = {};
    for (const [qid, counts] of Object.entries(data.quests?.progress ?? {})) {
      if (getQuest(qid)) this.questProgress[qid] = { ...counts };
    }
    // Equipment: drop unknown ids defensively.
    for (const slot of EQUIP_SLOTS) {
      const id = data.equipment[slot] ?? null;
      this.equipment[slot] = id && getEquipment(id) ? id : null;
      // Invariant: an equipped item is always owned (covers pre-M3 saves).
      const eq = this.equipment[slot];
      if (eq && !this.equipmentOwned.includes(eq)) this.equipmentOwned.push(eq);
    }
    this.recompute(false);
    if (data.player.hp < 0) this.hp = this.derived.maxHp;
    else this.hp = Math.min(this.derived.maxHp, data.player.hp);
    if (data.player.mp < 0) this.mp = this.derived.maxMp;
    else this.mp = Math.min(this.derived.maxMp, data.player.mp);
    bus.emit('player:hp-changed', { current: this.hp, max: this.derived.maxHp });
    bus.emit('player:mp-changed', { current: this.mp, max: this.derived.maxMp });
  }
}

/** The single active game state (set when a save is started/loaded). */
export const gameState = new GameState();
