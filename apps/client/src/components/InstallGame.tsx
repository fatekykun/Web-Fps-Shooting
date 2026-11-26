import { useId, useState, useSyncExternalStore } from 'react';
import {
  installMode,
  requestInstall,
  subscribeToInstallMode,
} from '../app/installGame';

export function InstallGame() {
  const mode = useSyncExternalStore(subscribeToInstallMode, installMode);
  const [guideOpen, setGuideOpen] = useState(false);
  const guide = useId();
  if (mode === 'hidden') return null;
  return (
    <div className="install-game">
      <button
        type="button"
        className="install-button"
        aria-expanded={mode === 'prompt' ? undefined : guideOpen}
        aria-controls={mode === 'prompt' ? undefined : guide}
        onClick={async () => {
          if (mode === 'prompt' && (await requestInstall())) return;
          setGuideOpen(!guideOpen);
        }}
      >
        Install app
      </button>
      <p id={guide} hidden={mode === 'prompt' || !guideOpen}>
        {mode === 'ios' ? (
          <>
            Open this page in Safari. Tap <strong>Share</strong>, then{' '}
            <strong>Add to Home Screen</strong>. Turn on{' '}
            <strong>Open as Web App</strong> if offered, then tap{' '}
            <strong>Add</strong>.
          </>
        ) : mode === 'desktop' ? (
          <>
            Install from the Chrome or Edge browser menu. On a Mac, Safari
            offers <strong>File → Add to Dock</strong>.
          </>
        ) : (
          <>
            Open your browser menu and choose <strong>Install app</strong> or{' '}
            <strong>Add to Home screen</strong>.
          </>
        )}
      </p>
    </div>
  );
}
