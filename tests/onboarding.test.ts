import { describe, expect, it } from 'vitest';
import {
  markStartupNoticeSeen,
  NOTICE_STORAGE_KEY,
  shouldShowStartupNotice,
} from '@/core/startup-notice';
import { createDefaultSave } from '@/save/schema';
import { INTRO_PENDING_FLAG, INTRO_QUEST_ID } from '@/tutorial/onboarding';

describe('first-run onboarding', () => {
  it('shows the startup notice once per installation', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    expect(shouldShowStartupNotice(storage)).toBe(true);
    markStartupNoticeSeen(storage);
    expect(values.get(NOTICE_STORAGE_KEY)).toBe('1');
    expect(shouldShowStartupNotice(storage)).toBe(false);
  });

  it('waits for the elder before accepting the first hunt', () => {
    const save = createDefaultSave(0);
    expect(save.flags[INTRO_PENDING_FLAG]).toBe(true);
    expect(save.quests.active).not.toContain(INTRO_QUEST_ID);
  });
});
