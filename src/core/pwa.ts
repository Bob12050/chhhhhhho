import { registerSW } from 'virtual:pwa-register';

/**
 * Register the offline service worker. New deployments activate and reload
 * automatically; otherwise unchanged public asset URLs can remain pinned by an
 * older installed PWA even after the server has the new files.
 */
let applyUpdateFn: (() => Promise<void>) | null = null;
let reloadStarted = false;
let versionCheckInFlight = false;

const currentBuildVersion = import.meta.env.VITE_BUILD_VERSION ?? 'dev';

function reloadForUpdate(version?: string): void {
  if (reloadStarted) return;
  reloadStarted = true;
  const url = new URL(window.location.href);
  url.searchParams.set('_v', version || Date.now().toString(36));
  window.location.replace(url.toString());
}

async function checkBuildVersion(): Promise<void> {
  if (versionCheckInFlight || reloadStarted) return;
  versionCheckInFlight = true;
  try {
    const url = new URL('build-version.json', document.baseURI);
    url.searchParams.set('t', Date.now().toString(36));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return;
    const payload = (await response.json()) as { version?: unknown };
    const deployedVersion = typeof payload.version === 'string' ? payload.version : '';
    if (deployedVersion && deployedVersion !== currentBuildVersion) {
      reloadForUpdate(deployedVersion.slice(0, 12));
    }
  } catch {
    // Offline launches keep using the last cached build.
  } finally {
    versionCheckInFlight = false;
  }
}

/** Kept for the existing HUD/title API; auto-update mode never waits. */
export function isUpdateReady(): boolean {
  return false;
}

export async function registerServiceWorker(): Promise<void> {
  if (import.meta.env.DEV) return; // SW only in production build
  const hadController = !!navigator.serviceWorker?.controller;
  if (hadController) {
    navigator.serviceWorker.addEventListener('controllerchange', () => reloadForUpdate());
  }
  const updateSW = registerSW({
    immediate: true,
    onNeedReload() {
      reloadForUpdate();
    },
    onOfflineReady() {
      // App shell cached; offline launch is ready.
    },
    onRegisteredSW(_swUrl: string, r?: ServiceWorkerRegistration) {
      if (!r) return;
      const check = (): void => {
        void r.update().catch(() => undefined);
        void checkBuildVersion();
      };
      check();
      window.setInterval(check, 30_000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
      window.addEventListener('pageshow', check);
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
