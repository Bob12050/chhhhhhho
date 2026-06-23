import { describe, it, expect } from 'vitest';
import { allDialogues, getDialogue } from '@/dialogue/dialogue-defs';
import { allMaps } from '@/maps/map-def';

describe('dialogue', () => {
  it('loads dialogues with non-empty lines', () => {
    for (const d of allDialogues()) {
      expect(d.lines.length).toBeGreaterThan(0);
      expect(d.speaker).toBeTruthy();
    }
  });

  it('every map NPC dialogueId resolves', () => {
    for (const m of allMaps()) {
      for (const n of m.npcs ?? []) {
        if (n.dialogueId) expect(getDialogue(n.dialogueId), `${m.id}:${n.dialogueId}`).toBeDefined();
      }
    }
  });

  it('choices can carry a flag to set', () => {
    const d = getDialogue('elder_intro')!;
    expect(d.choices?.some((c) => c.setFlag === 'accepted_quest')).toBe(true);
  });
});
