import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MobileHUD } from './MobileHUD';
import {
  defaultMobileHudLayout,
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
};
export function MobileHudEditor({
  tablet,
  initial,
  imported,
  onSave,
  onDiscard,
}: {
  tablet: boolean;
  initial: MobileHudLayout;
  imported?: MobileHudLayout;
  onSave(layout: MobileHudLayout): void;
  onDiscard(): void;
}) {
  const [layout, setLayout] = useState(imported ?? initial);
  const [selected, setSelected] = useState<MobileHudControlId>('fire');
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(layout) !== JSON.stringify(initial);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const preview = screen.current!;
    const frame = stage.current!;
    const size = () => {
      const ratio = Math.min(
        frame.clientWidth / preview.offsetWidth,
        frame.clientHeight / preview.offsetHeight,
      );
      preview.style.setProperty('--preview-scale', String(ratio));
    };
    element.showModal();
    size();
    const observer = new ResizeObserver(size);
    observer.observe(frame);
    observer.observe(preview);
    return () => {
      observer.disconnect();
      element.close();
    };
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
      aria-label="Controller Settings"
      onCancel={(event) => {
        event.preventDefault();
        if (confirm) setConfirm(false);
        else requestExit();
      }}
    >
      <div className="hud-editor-content" inert={confirm}>
        <header>
          <div>
            <span className="eyebrow">TOUCH CONTROLS / CUSTOM LAYOUT</span>
            <h2>CONTROLLER SETTINGS</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Exit HUD editor"
            onClick={requestExit}
          >
            ×
          </button>
        </header>
        <div ref={stage} className="hud-editor-stage">
          <div ref={screen} className="hud-editor-screen">
            <MobileHUD
              tablet={tablet}
              layout={layout}
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
          <span className="hud-editor-hint">
            SELECT A CONTROL · DRAG TO POSITION
          </span>
        </div>
        <aside className="hud-editor-tools">
          <label>
            CONTROL
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
          <label>
            SIZE <output>{layout[selected].scale}%</output>
            <input
              aria-label="Button size"
              type="range"
              min="50"
              max="200"
              value={layout[selected].scale}
              onChange={(e) => patch({ scale: Number(e.target.value) })}
            />
          </label>
          <fieldset>
            <legend>OPACITY</legend>
            {[30, 50, 70, 100].map((value) => (
              <button
                key={value}
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
            SHOW CONTROL
          </label>
          <button
            className="text-button"
            onClick={() => setLayout(defaultMobileHudLayout())}
          >
            RESET DEFAULT LAYOUT
          </button>
        </aside>
        <footer>
          <button className="room-button" onClick={requestExit}>
            DISCARD
          </button>
          <button className="enter-button" onClick={() => onSave(layout)}>
            SAVE
          </button>
        </footer>
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
          <button className="enter-button" onClick={onDiscard}>
            DISCARD CHANGES
          </button>
        </div>
      )}
    </dialog>
  );
}
