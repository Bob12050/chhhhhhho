import { idbGet, idbSet } from './idb';
import { createDefaultSave, migrate, type SaveData, SAVE_VERSION } from './schema';
import { bus } from '@/core/event-bus';

/**
 * Save manager over IndexedDB. Features:
 *  - >= 3 slots, versioned schema with migration
 *  - per-slot backup; corrupt main save falls back to backup
 *  - JSON import/export
 *  - single-writer guard across tabs via the Web Locks API (best effort)
 */
export const SLOT_COUNT = 3;

const mainKey = (slot: number): string => `save.slot.${slot}`;
const backupKey = (slot: number): string => `save.slot.${slot}.bak`;

export interface SlotSummary {
  slot: number;
  exists: boolean;
  level?: number;
  mapId?: string;
  savedAt?: number;
}

export class SaveManager {
  /** Persist a slot. Writes a backup of the previous good save first. */
  async write(data: SaveData): Promise<void> {
    const slot = data.slot;
    await this.withLock(slot, async () => {
      const prev = await idbGet<SaveData>(mainKey(slot));
      if (prev) await idbSet(backupKey(slot), prev);
      data.version = SAVE_VERSION;
      data.savedAt = Date.now();
      await idbSet(mainKey(slot), data);
    });
    bus.emit('save:written', { slot });
  }

  /** Load a slot, migrating and repairing as needed. Returns null if empty. */
  async read(slot: number): Promise<SaveData | null> {
    const raw = await idbGet<unknown>(mainKey(slot));
    if (raw == null) return null;
    try {
      const data = migrate(raw, slot);
      bus.emit('save:loaded', { slot });
      return data;
    } catch {
      // Main save corrupt -> try backup.
      const bak = await idbGet<unknown>(backupKey(slot));
      if (bak != null) {
        const data = migrate(bak, slot);
        bus.emit('save:loaded', { slot });
        return data;
      }
      return null;
    }
  }

  async startNew(slot: number): Promise<SaveData> {
    const data = createDefaultSave(slot);
    await this.write(data);
    return data;
  }

  async summaries(): Promise<SlotSummary[]> {
    const out: SlotSummary[] = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const raw = await idbGet<SaveData>(mainKey(i));
      out.push(
        raw
          ? { slot: i, exists: true, level: raw.player?.level, mapId: raw.mapId, savedAt: raw.savedAt }
          : { slot: i, exists: false },
      );
    }
    return out;
  }

  exportJSON(data: SaveData): string {
    return JSON.stringify(data, null, 2);
  }

  importJSON(json: string, slot: number): SaveData {
    return migrate(JSON.parse(json), slot);
  }

  /** Best-effort cross-tab single-writer lock. */
  private async withLock(slot: number, fn: () => Promise<void>): Promise<void> {
    const locks = navigator.locks;
    if (locks?.request) {
      await locks.request(`save-slot-${slot}`, { mode: 'exclusive' }, async () => {
        await fn();
      });
    } else {
      await fn();
    }
  }
}

export const saveManager = new SaveManager();
