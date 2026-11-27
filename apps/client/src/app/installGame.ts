import { readDevice } from '../game/input/deviceCapabilities';
import { operators } from '@breakpoint/shared/operators';
import {
  defaultMeleeSkin,
  skinDefinitions,
  type LoadoutProfile,
} from '@breakpoint/shared/weapons/loadouts';

interface InstallPrompt extends Event {
  prompt(): Promise<unknown>;
}

type InstallMode = 'hidden' | 'prompt' | 'ios' | 'mobile' | 'desktop';
const listeners = new Set<() => void>();
let prompt: InstallPrompt | undefined;
let installed = false;
let manualMode: InstallMode = 'hidden';
let standalone: MediaQueryList | undefined;
let workerRegistration:
  Promise<ServiceWorkerRegistration | undefined> | undefined;

function installationChanged(): void {
  for (const listener of listeners) listener();
}

export function subscribeToInstallMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function installMode(): InstallMode {
  if (installed || standalone?.matches) return 'hidden';
  return prompt ? 'prompt' : manualMode;
}

export async function requestInstall(): Promise<boolean> {
  const event = prompt;
  if (!event) return false;
  prompt = undefined;
  installationChanged();
  try {
    await event.prompt();
    return true;
  } catch {
    return false;
  }
}

export function initializePwa(): void {
  if (
    !import.meta.env.PROD ||
    !window.isSecureContext ||
    !('serviceWorker' in navigator)
  )
    return;
  standalone = matchMedia('(display-mode: standalone)');
  installed =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  manualMode = ios ? 'ios' : readDevice().handheld ? 'mobile' : 'desktop';
  standalone.addEventListener('change', installationChanged);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    installationChanged();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    prompt = undefined;
    installationChanged();
  });
}

/** Wait for startup before downloading files for offline play. */
export function cacheOfflineTraining(): void {
  if (!standalone || workerRegistration) return;
  workerRegistration = navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}service-worker.js`, {
      updateViaCache: 'none',
    })
    .catch(() => {
      workerRegistration = undefined;
      return undefined;
    });
}

export function supportsLoadoutDownloads(): boolean {
  return !!standalone;
}

/** Downloads saved equipment into the same revisioned cache as normal model requests. */
export async function downloadLoadoutModels(
  profile: LoadoutProfile,
): Promise<boolean> {
  cacheOfflineTraining();
  if (!(await workerRegistration)) return false;
  const paths = new Set<string>(['models/first_person_gloves.glb']);
  for (const slot of profile.slots) {
    for (const entry of [
      skinDefinitions[slot.skin],
      skinDefinitions[slot.meleeSkin ?? defaultMeleeSkin],
      operators[slot.operator ?? 'standard'],
    ]) {
      if ('model' in entry) paths.add(`models/${entry.model}`);
    }
  }
  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(ready);
    };
    const timeout = setTimeout(() => finish(false), 60000);
    channel.port1.onmessage = (event) => finish(event.data === true);
    void navigator.serviceWorker.ready
      .then((registration) => {
        const worker =
          navigator.serviceWorker.controller ?? registration.active;
        if (worker)
          worker.postMessage(
            { type: 'download-loadout-models', paths: [...paths] },
            [channel.port2],
          );
        else finish(false);
      })
      .catch(() => finish(false));
  });
}
