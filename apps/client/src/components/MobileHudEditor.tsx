import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ArenaId } from '@breakpoint/shared/maps';
import { MobileHUD } from './MobileHUD';
import {
  defaultMobileHudLayout,
  hudOpacityOptions,
  mobileHudControlIds,
  type MobileHudControlId,
  type MobileHudLayout,
} from '../game/input/mobileHudSettings';
const labels: Record<MobileHudControlId, string> = {
  joystick: 'Movement joystick',
  sprint: 'Sprint',
  fire: 'Fire',
  aim: 'ADS',
  jump: 'Jump',
  slide: 'Crouch / slide',
  prone: 'Prone',
  dive: 'Dive',
  reload: 'Reload',
  swap: 'Weapon switch',
  scores: 'Scores',
  pause: 'Pause',
  inspect: 'Inspect weapon',
  minimap: 'Minimap',
};
export function MobileHudEditor({
  tablet,
  map,
  multiplayer,
  initial,
  imported,
  onSave,
  onDiscard,
}: {
  tablet: boolean;
  map: ArenaId;
  multiplayer: boolean;
  initial: MobileHudLayout;
  imported?: MobileHudLayout;
  onSave(layout: MobileHudLayout): void;
  onDiscard(): void;
}) {
  const [layout, setLayout] = useState(imported ?? initial);
  const [selected, setSelected] = useState<MobileHudControlId>('fire');
  const [showAdjustments, setShowAdjustments] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const adjustmentsId = useId();
  const dirty = JSON.stringify(layout) !== JSON.stringify(initial);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  function requestExit() {
    if (dirty) setConfirm(true);
    else onDiscard();
  }
  const patch = (values: Partial<MobileHudLayout[MobileHudControlId]>) =>
    setLayout((current) => ({
      ...current,
      [selected]: { ...current[selected], ...values },
    }));
  return (
    <dialog
      ref={dialog}
      className="hud-editor"
      aria-label="HUD editor"
      onCancel={(event) => {
        event.preventDefault();
        if (confirm) setConfirm(false);
        else requestExit();
      }}
    >
      <div className="hud-editor-content" inert={confirm}>
        <header className="hud-editor-bar">
          <h2>HUD Layout</h2>
          <button
            type="button"
            className="room-button"
            aria-expanded={showAdjustments}
            aria-controls={adjustmentsId}
            onClick={() => setShowAdjustments(!showAdjustments)}
          >
            Adjust
          </button>
          <button
            type="button"
            className="room-button"
            aria-label="Reset default layout"
            onClick={() => setLayout(defaultMobileHudLayout())}
          >
            Reset
          </button>
          <button type="button" className="room-button" onClick={requestExit}>
            Discard
          </button>
          <button
            type="button"
            className="room-button primary"
            onClick={() => onSave(layout)}
          >
            Save
          </button>
        </header>
        <aside
          id={adjustmentsId}
          className="hud-editor-tools"
          aria-label="Selected control settings"
          hidden={!showAdjustments}
        >
          <label className="hud-control-choice">
            Control
            <select
              aria-label="Selected control"
              value={selected}
              onChange={(e) =>
                setSelected(e.target.value as MobileHudControlId)
              }
            >
              {mobileHudControlIds.map((id) => (
                <option key={id} value={id}>
                  {labels[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="hud-size">
            <span>
              Size <output>{layout[selected].scale}%</output>
            </span>
            <input
              aria-label={
                selected === 'minimap' ? 'Minimap size' : 'Button size'
              }
              type="range"
              min="50"
              max="200"
              value={layout[selected].scale}
              onChange={(e) => patch({ scale: Number(e.target.value) })}
            />
          </label>
          <fieldset>
            <legend>Opacity</legend>
            {hudOpacityOptions.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout[selected].opacity === value}
                onClick={() => patch({ opacity: value })}
              >
                {value}%
              </button>
            ))}
          </fieldset>
          <label className="hud-visible">
            <input
              type="checkbox"
              checked={layout[selected].visible}
              disabled={selected === 'pause'}
              onChange={(e) => patch({ visible: e.target.checked })}
            />{' '}
            {selected === 'minimap' ? 'Show minimap' : 'Show control'}
          </label>
        </aside>
        <div className="hud-editor-screen">
          <MobileHUD
            tablet={tablet}
            layout={layout}
            minimap={{ map }}
            multiplayer={multiplayer}
            editor={{
              selected,
              select: setSelected,
              position: (id, x, y) =>
                setLayout((current) => ({
                  ...current,
                  [id]: { ...current[id], x, y },
                })),
            }}
          />
        </div>
      </div>
      {confirm && (
        <div
          className="hud-confirm"
          role="alertdialog"
          aria-label="Discard unsaved layout"
        >
          <p>Discard unsaved HUD changes?</p>
          <button className="room-button" onClick={() => setConfirm(false)}>
            KEEP EDITING
          </button>
          <button className="room-button primary" onClick={onDiscard}>
            DISCARD CHANGES
          </button>
        </div>
      )}
    </dialog>
  );
}
