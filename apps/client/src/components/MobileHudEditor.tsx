import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import type { ArenaId } from '@breakpoint/shared/maps';
import { MobileHUD } from './MobileHUD';
import {
  defaultMobileHudLayout,
  hudOpacityRange,
  mobileHudControlIds,
  type MobileHudControlId,
  type MobileHudLayout,
} from '../game/input/mobileHudSettings';
const labels: Record<MobileHudControlId, string> = {
  joystick: 'Movement joystick',
  sprint: 'Sprint trigger',
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

const panelSteps: Record<string, readonly [number, number]> = {
  ArrowLeft: [-0.05, 0],
  ArrowRight: [0.05, 0],
  ArrowUp: [0, -0.05],
  ArrowDown: [0, 0.05],
};

const clampPosition = (value: number) => Math.max(0, Math.min(1, value));

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
  const [panelPosition, setPanelPosition] = useState({ x: 0.5, y: 0.5 });
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const panelArea = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const panelDrag = useRef<{ id: number; x: number; y: number } | null>(null);
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

  function startPanelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || panelDrag.current || !panel.current) return;
    const rect = panel.current.getBoundingClientRect();
    panelDrag.current = {
      id: event.pointerId,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanel(event: PointerEvent<HTMLButtonElement>) {
    const drag = panelDrag.current;
    if (drag?.id !== event.pointerId || !panel.current || !panelArea.current)
      return;
    const area = panelArea.current.getBoundingClientRect();
    const box = panel.current.getBoundingClientRect();
    const width = area.width - box.width;
    const height = area.height - box.height;
    setPanelPosition({
      x:
        width > 0
          ? clampPosition((event.clientX - drag.x - area.left) / width)
          : 0.5,
      y:
        height > 0
          ? clampPosition((event.clientY - drag.y - area.top) / height)
          : 0.5,
    });
  }

  function stopPanelDrag(event: PointerEvent<HTMLButtonElement>) {
    if (panelDrag.current?.id === event.pointerId) panelDrag.current = null;
  }

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
        <div ref={panelArea} className="hud-tools-area">
          <aside
            ref={panel}
            id={adjustmentsId}
            className="hud-editor-tools"
            aria-label="Selected control settings"
            hidden={!showAdjustments}
            style={{
              left: `${panelPosition.x * 100}%`,
              top: `${panelPosition.y * 100}%`,
              transform: `translate(${-panelPosition.x * 100}%, ${-panelPosition.y * 100}%)`,
            }}
          >
            <div className="hud-control-row">
              <button
                type="button"
                className="hud-tools-handle"
                aria-label="Move adjustments"
                onPointerDown={startPanelDrag}
                onPointerMove={movePanel}
                onPointerUp={stopPanelDrag}
                onPointerCancel={stopPanelDrag}
                onLostPointerCapture={stopPanelDrag}
                onKeyDown={(event) => {
                  const step = panelSteps[event.key];
                  if (!step) return;
                  event.preventDefault();
                  setPanelPosition(({ x, y }) => ({
                    x: clampPosition(x + step[0]),
                    y: clampPosition(y + step[1]),
                  }));
                }}
              />
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
              <label className="hud-visible">
                <input
                  type="checkbox"
                  aria-label={
                    selected === 'minimap' ? 'Show minimap' : 'Show control'
                  }
                  checked={layout[selected].visible}
                  disabled={selected === 'pause'}
                  onChange={(e) => patch({ visible: e.target.checked })}
                />
                Visible
              </label>
            </div>
            <label className="hud-adjustment">
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
            <label className="hud-adjustment">
              <span>
                Opacity <output>{layout[selected].opacity}%</output>
              </span>
              <input
                aria-label="Control opacity"
                type="range"
                min={hudOpacityRange.min}
                max={hudOpacityRange.max}
                value={layout[selected].opacity}
                onChange={(e) => patch({ opacity: Number(e.target.value) })}
              />
            </label>
            {selected === 'sprint' && (
              <p className="hud-control-hint">
                Drag the marker closer to the joystick to sprint sooner.
              </p>
            )}
          </aside>
        </div>
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
                  [id]: { ...current[id], x, y, coordinates: 'viewport' },
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
