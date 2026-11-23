import { useState } from 'react';
import {
  mobileHudControlIds,
  normalizeMobileHudLayout,
  type MobileHudLayout,
} from '../game/input/mobileHudSettings';
import { TacticalDialog } from './TacticalDialog';

export function ControllerSettings({
  layout,
  onClose,
  onEdit,
  storageUnavailable,
}: {
  layout: MobileHudLayout;
  onClose(): void;
  onEdit(imported?: MobileHudLayout): void;
  storageUnavailable: boolean;
}) {
  const [transfer, setTransfer] = useState(() => JSON.stringify(layout));
  const [invalid, setInvalid] = useState(false);

  function importLayout() {
    try {
      const value: unknown = JSON.parse(transfer);
      if (
        !value ||
        typeof value !== 'object' ||
        !mobileHudControlIds.some((id) => Object.hasOwn(value, id))
      ) {
        setInvalid(true);
        return;
      }
      onEdit(normalizeMobileHudLayout(value));
    } catch {
      setInvalid(true);
    }
  }

  return (
    <TacticalDialog
      title="CONTROLLER SETTINGS"
      name="Controller Settings"
      eyebrow="TOUCH CONTROLS"
      onClose={onClose}
      footer={
        <button type="button" className="room-button" onClick={onClose}>
          BACK TO SETTINGS
        </button>
      }
    >
      <button
        type="button"
        className="enter-button controller-settings-button"
        onClick={() => onEdit()}
      >
        EDIT HUD LAYOUT
      </button>
      {storageUnavailable && (
        <p role="status">
          Layout applied for this session. This browser could not save it.
        </p>
      )}
      <details className="hud-layout-transfer">
        <summary>Transfer layout between devices</summary>
        <label htmlFor="hud-layout-transfer">
          Copy this layout code to another device, or paste a code to preview it
          here.
        </label>
        <textarea
          id="hud-layout-transfer"
          rows={3}
          value={transfer}
          spellCheck={false}
          onChange={(event) => {
            setTransfer(event.target.value);
            setInvalid(false);
          }}
        />
        <button type="button" className="room-button" onClick={importLayout}>
          PREVIEW LAYOUT CODE
        </button>
        {invalid && <p role="alert">Enter a valid BREAKPOINT layout code.</p>}
      </details>
    </TacticalDialog>
  );
}
