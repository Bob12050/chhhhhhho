import { describe, expect, it } from 'vitest';
import { DEBUG_STORAGE_KEY, isDebugEnabled, setDebugEnabled } from '@/core/debug';

describe('debug mode setting', () => {
  it('applies immediately and persists until disabled', () => {
    const values = new Map<string, string>();
    const storage = {
      setItem(key: string, value: string): void {
        values.set(key, value);
      },
      removeItem(key: string): void {
        values.delete(key);
      },
    };

    setDebugEnabled(true, storage);
    expect(isDebugEnabled()).toBe(true);
    expect(values.get(DEBUG_STORAGE_KEY)).toBe('1');

    setDebugEnabled(false, storage);
    expect(isDebugEnabled()).toBe(false);
    expect(values.has(DEBUG_STORAGE_KEY)).toBe(false);
  });
});
