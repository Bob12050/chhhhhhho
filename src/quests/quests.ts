import type { GameState } from '@/player/game-state';
import { getQuest, allQuests, type QuestDef } from '@/quests/quest-defs';
import { getMaterial, getConsumable, getEquipment } from '@/data/items';
import { bus } from '@/core/event-bus';
import { advanceInvestigationBoard } from '@/endgame/investigations';

/**
 * Quest logic (data-driven, Phaser-independent so it is headless-testable).
 * Operates on GameState's quest state: `activeQuests`, `completedQuests`,
 * `questProgress` (questId -> enemyId -> kills). Mirrors the crafting module's
 * shape (functions take gs).
 */

/** Whether the player meets a quest's availability gate. */
export function requireMet(gs: GameState, q: QuestDef): boolean {
  const r = q.require;
  if (!r) return true;
  if (r.minLevel != null && gs.level < r.minLevel) return false;
  if (r.questDone && !gs.completedQuests.includes(r.questDone)) return false;
  if (r.flag && !gs.flags[r.flag]) return false;
  return true;
}

/** Quests the player can accept now (not active, not done unless repeatable). */
export function availableQuests(gs: GameState): QuestDef[] {
  const activeDefs = gs.activeQuests.map((id) => getQuest(id)).filter((q): q is QuestDef => !!q);
  const hasActiveInvestigation = activeDefs.some((q) => !!q.investigation);
  const hasActiveHunt = activeDefs.some((q) => !!q.huntMap);
  return allQuests().filter((q) => {
    if (q.investigation && hasActiveHunt) return false;
    if (q.huntMap && !q.investigation && hasActiveInvestigation) return false;
    return (
      !gs.activeQuests.includes(q.id)
      && (q.repeatable || !gs.completedQuests.includes(q.id))
      && requireMet(gs, q)
    );
  });
}

/** Accept a quest (no-op if not available). */
export function acceptQuest(gs: GameState, id: string): boolean {
  const q = getQuest(id);
  if (!q || gs.activeQuests.includes(id)) return false;
  if (!q.repeatable && gs.completedQuests.includes(id)) return false;
  if (!requireMet(gs, q)) return false;
  const activeDefs = gs.activeQuests.map((qid) => getQuest(qid)).filter((def): def is QuestDef => !!def);
  if (q.investigation && activeDefs.some((def) => !!def.huntMap)) return false;
  if (q.huntMap && !q.investigation && activeDefs.some((def) => !!def.investigation)) return false;
  gs.activeQuests.push(id);
  gs.questProgress[id] = {};
  bus.emit('quest:changed', {});
  bus.emit('quest:accepted', { questId: id });
  return true;
}

/** Current progress for a quest objective (capped at the objective count). */
export function objectiveProgress(gs: GameState, questId: string, enemyId: string): number {
  return gs.questProgress[questId]?.[enemyId] ?? 0;
}

/** Record a kill against all active quests; returns true if any progressed. */
export function recordKill(gs: GameState, enemyId: string): boolean {
  let changed = false;
  for (const qid of gs.activeQuests) {
    const q = getQuest(qid);
    if (!q) continue;
    for (const obj of q.objectives) {
      if (obj.enemyId !== enemyId) continue;
      const cur = gs.questProgress[qid]?.[enemyId] ?? 0;
      if (cur >= obj.count) continue;
      const current = cur + 1;
      (gs.questProgress[qid] ??= {})[enemyId] = current;
      bus.emit('quest:progress', {
        questId: qid,
        enemyId,
        current,
        total: obj.count,
        complete: current >= obj.count,
      });
      changed = true;
    }
  }
  if (changed) bus.emit('quest:changed', {});
  return changed;
}

/** Whether every objective of an active quest is satisfied. */
export function isComplete(gs: GameState, questId: string): boolean {
  const q = getQuest(questId);
  if (!q) return false;
  return q.objectives.every((o) => (gs.questProgress[questId]?.[o.enemyId] ?? 0) >= o.count);
}

function grantItem(gs: GameState, id: string, qty: number): void {
  if (getMaterial(id)) gs.addMaterial(id, qty);
  else if (getConsumable(id)) gs.addConsumable(id, qty);
  else if (getEquipment(id)) for (let i = 0; i < qty; i++) gs.addEquipment(id);
}

/**
 * Turn in a completed quest: grant rewards, set flags, move to completed.
 * Repeatable quests reset their progress and stay available. Returns false if
 * the quest is not active or not yet complete.
 */
export function turnInQuest(gs: GameState, questId: string): boolean {
  const q = getQuest(questId);
  if (!q || !gs.activeQuests.includes(questId) || !isComplete(gs, questId)) return false;

  const r = q.rewards;
  // 金運 (goldRate) boosts quest gold like kill gold; shop sells stay flat.
  if (r.gold) gs.addGold(Math.round(r.gold * (1 + gs.derived.goldRate)));
  for (const [id, qty] of Object.entries(r.items ?? {})) grantItem(gs, id, qty);
  for (const f of r.setFlags ?? []) gs.flags[f] = true;
  if (r.exp) gs.gainExp(r.exp); // last: may trigger level-up events

  gs.activeQuests = gs.activeQuests.filter((id) => id !== questId);
  delete gs.questProgress[questId];
  // Record completion for ALL quests — repeatable ones too. `availableQuests`
  // re-offers repeatables regardless, and `require.questDone` chains (歴戦・
  // 連続狩猟 unlock after the base hunt) need the completion recorded or they
  // could never unlock behind a repeatable hunt.
  if (!gs.completedQuests.includes(questId)) {
    gs.completedQuests.push(questId);
  }
  if (q.investigation) advanceInvestigationBoard(gs);
  gs.flags['quest_turned_in_any'] = true;
  bus.emit('quest:changed', {});
  return true;
}
