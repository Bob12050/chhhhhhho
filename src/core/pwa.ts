import { registerSW } from 'virtual:pwa-register';
import { bus } from './event-bus';

/**
 * Register the service worker for offline play with a MANUAL update flow: when a
 * new version is available we DO NOT auto-reload (that would interrupt combat).
 * Instead we flag it + notify, and apply later (on the title screen).
 *
 * Two robustness fixes so the "タップして更新" prompt actually appears:
 *  1. Persist `updateReady` — onNeedRefresh can fire during Boot/Notice, before
 *     the Title scene subscribes to the event. Title reads `isUpdateReady()` on
 *     create so an early update is never missed.
 *  2. Poll for updates while the app is open (every 60s + on tab focus). The SW
 *     otherwise only checks on a full page load, so an installed PWA left open
 *     would never notice a new deployment.
 */
let applyUpdateFn: (() => Promise<void>) | null = null;
let updateReady = false;

/** True once a new app version is installed and waiting to be applied. */
export function isUpdateReady(): boolean {
  return updateReady;
}

export async function registerServiceWorker(): Promise<void> {
  if (import.meta.env.DEV) return; // SW only in production build
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
      bus.emit('pwa:update-available', {});
    },
    onOfflineReady() {
      // App shell cached; offline launch is ready.
    },
    onRegisteredSW(_swUrl: string, r?: ServiceWorkerRegistration) {
      if (!r) return;
      const check = (): void => void r.update();
      window.setInterval(check, 60_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
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
