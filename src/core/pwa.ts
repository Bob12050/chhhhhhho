import { registerSW } from 'virtual:pwa-register';
import { bus } from './event-bus';

/**
 * Register the service worker for offline play. We use a manual update flow:
 * when a new version is available we DO NOT auto-reload (that would interrupt
 * combat). Instead we notify and apply the update later (e.g. on returning to
 * the title). `applyUpdate` is exposed for the UI to call.
 */
let applyUpdateFn: (() => Promise<void>) | null = null;

export async function registerServiceWorker(): Promise<void> {
  if (import.meta.env.DEV) return; // SW only in production build
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      bus.emit('pwa:update-available', {});
    },
    onOfflineReady() {
      // App shell cached; offline launch is ready.
    },
  });
  applyUpdateFn = async () => {
    await updateSW(true);
  };
}

/** Apply a pending update (reloads). Call only from a safe screen (title). */
export async function applyPendingUpdate(): Promise<void> {
  if (applyUpdateFn) await applyUpdateFn();
}
