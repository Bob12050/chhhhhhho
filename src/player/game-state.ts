import {
  computeDerived,
  type BaseStats,
  type DerivedStats,
  type StatModifiers,
} from '@/stats/stats';
import { getEquipment, getConsumable } from '@/data/items';
import { getSkill } from '@/skills/skill-defs';
import { getJob } from '@/jobs/job-defs';
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

  hp = 1;
  mp = 0;
  gold = 0;
  /** Learned skills (id -> level) and the two active skill slots. */
  skills: Record<string, number> = {};
  skillSlots: (string | null)[] = [null, null];
  skillPoints = 0;
  jobId = 'novice';
  unlockedJobs: string[] = ['novice'];
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

  /** Whether the current job may equip this item (weapon-tag restriction). */
  canEquip(itemId: string): boolean {
    const def = getEquipment(itemId);
    if (!def) return false;
    if (def.slot === 'main_hand' && def.weaponTags && def.weaponTags.length > 0) {
      const allowed = getJob(this.jobId)?.equippableWeaponTags ?? [];
      return def.weaponTags.some((t) => allowed.includes(t));
    }
    return true;
  }

  equip(slot: EquipSlot, itemId: string | null): void {
    if (itemId && !this.canEquip(itemId)) return;
    this.equipment[slot] = itemId;
    this.recompute();
    bus.emit('equipment:changed', { slot });
  }

  /** Why the player can't change to a job right now (or null if they can). */
  jobChangeBlock(id: string): 'current' | 'unknown' | 'level' | 'job' | 'skill' | 'flag' | null {
    if (id === this.jobId) return 'current';
    const def = getJob(id);
    if (!def) return 'unknown';
    const u = def.unlock;
    if (u?.level && this.level < u.level) return 'level';
    if (u?.requiresJob && this.jobId !== u.requiresJob && !this.unlockedJobs.includes(u.requiresJob))
      return 'job';
    if (u?.requiresSkill && !this.skills[u.requiresSkill]) return 'skill';
    if (u?.flag && !this.flags[u.flag]) return 'flag';
    return null;
  }

  changeJob(id: string): boolean {
    if (this.jobChangeBlock(id) !== null) return false;
    this.jobId = id;
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
  skillLearnBlock(id: string): 'known' | 'unknown' | 'points' | 'level' | 'requires' | null {
    if (this.skills[id]) return 'known';
    const def = getSkill(id);
    if (!def) return 'unknown';
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
      settings: { sfx: true, bgm: true },
    };
  }

  loadFrom(data: SaveData): void {
    this.slot = data.slot;
    this.level = data.player.level;
    this.exp = data.player.exp;
    this.statPoints = data.player.statPoints;
    this.base = { ...data.player.base };
    this.gold = data.player.gold ?? 0;
    this.skills = { ...(data.player.skills ?? {}) };
    this.skillSlots = [...(data.player.skillSlots ?? [null, null])];
    this.skillPoints = data.player.skillPoints ?? 0;
    this.jobId = data.player.jobId ?? 'novice';
    this.unlockedJobs = [...(data.player.unlockedJobs ?? ['novice'])];
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
