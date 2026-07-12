/** Bump when the first-install notice meaningfully changes. */
export const NOTICE_STORAGE_KEY = 'pixelrpg.noticeSeen.v2';

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'setItem'>;

export function shouldShowStartupNotice(storage?: ReadStorage): boolean {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    return target?.getItem(NOTICE_STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markStartupNoticeSeen(storage?: WriteStorage): void {
  try {
    const target = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    target?.setItem(NOTICE_STORAGE_KEY, '1');
  } catch {
    // Private mode can deny storage; continuing to the title is still safe.
  }
}
