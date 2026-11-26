import { readDevice } from '../game/input/deviceCapabilities';

interface InstallPrompt extends Event {
  prompt(): Promise<unknown>;
}

type InstallMode = 'hidden' | 'prompt' | 'ios' | 'mobile' | 'desktop';
const listeners = new Set<() => void>();
let prompt: InstallPrompt | undefined;
let installed = false;
let manualMode: InstallMode = 'hidden';
let standalone: MediaQueryList | undefined;
let workerRequested = false;

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
  if (!standalone || workerRequested) return;
  workerRequested = true;
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}service-worker.js`, {
      updateViaCache: 'none',
    })
    .catch(() => {
      // The game can still run online when browser storage is unavailable.
    });
}
