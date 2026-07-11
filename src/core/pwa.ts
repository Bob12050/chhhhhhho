import { registerSW } from 'virtual:pwa-register';

/**
 * Register the offline service worker. New deployments activate and reload
 * automatically; otherwise unchanged public asset URLs can remain pinned by an
 * older installed PWA even after the server has the new files.
 */
let applyUpdateFn: (() => Promise<void>) | null = null;

/** Kept for the existing HUD/title API; auto-update mode never waits. */
export function isUpdateReady(): boolean {
  return false;
}

export async function registerServiceWorker(): Promise<void> {
  if (import.meta.env.DEV) return; // SW only in production build
  const updateSW = registerSW({
    immediate: true,
    onNeedReload() {
      window.location.reload();
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
