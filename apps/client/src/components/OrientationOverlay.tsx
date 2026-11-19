import { useEffect, useRef, useState } from 'react';
import { readDevice, requestLandscape } from '../game/input/deviceCapabilities';

export function useDeviceCapabilities() {
  const [device, setDevice] = useState(readDevice);
  useEffect(() => {
    const update = () =>
      setDevice((previous) => {
        const next = readDevice();
        return JSON.stringify(previous) === JSON.stringify(next)
          ? previous
          : next;
      });
    const queries = [
      '(pointer: coarse)',
      '(any-pointer: fine)',
      '(hover: hover)',
    ].map((q) => matchMedia(q));
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    for (const query of queries) query.addEventListener('change', update);
    void requestLandscape();
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      for (const query of queries) query.removeEventListener('change', update);
    };
  }, []);
  return device;
}

export function OrientationOverlay({ blocked }: { blocked: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    if (blocked && !dialog.open) dialog.showModal();
    if (!blocked && dialog.open) dialog.close();
    // Other native lobby/settings dialogs may open after this effect. Keep the
    // orientation instruction at the top of the modal stack without focus loops.
    const observer = new MutationObserver((mutations) => {
      if (
        blocked &&
        mutations.some(
          ({ target }) =>
            target !== dialog &&
            target instanceof HTMLDialogElement &&
            target.open,
        )
      ) {
        dialog.close();
        dialog.showModal();
      }
    });
    if (blocked)
      observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['open'],
      });
    return () => {
      observer.disconnect();
      if (dialog.open) dialog.close();
    };
  }, [blocked]);
  return (
    <dialog
      ref={ref}
      className="orientation-overlay"
      aria-labelledby="orientation-title"
      onCancel={(event) => event.preventDefault()}
    >
      <div className="orientation-card">
        <span className="rotate-device" aria-hidden="true">
          ↻
        </span>
        <span className="eyebrow">BREAKPOINT / LANDSCAPE REQUIRED</span>
        <h1 id="orientation-title">ROTATE YOUR DEVICE</h1>
        <p>Turn your device sideways to enter the lobby and play.</p>
        <button
          className="enter-button"
          onClick={() => void requestLandscape(true)}
        >
          ENABLE LANDSCAPE
        </button>
        <p className="settings-note">
          If your browser cannot lock rotation, rotate manually and turn off
          your device’s portrait lock.
        </p>
      </div>
    </dialog>
  );
}
