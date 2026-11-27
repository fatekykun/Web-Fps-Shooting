import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type Ref,
} from 'react';
import { movementConfig, type MovementState } from '@breakpoint/shared';
import type { ArenaId } from '@breakpoint/shared/maps';
import { MobileControlIcon } from './MobileControlIcon';
import { Minimap } from './Minimap';
import {
  resolveDefaultMobileHud,
  resolveMobileHud,
  type HudViewport,
} from '../game/input/mobileHudGeometry';
import {
  type MobileHudLayout,
  type MobileHudControlId,
} from '../game/input/mobileHudSettings';

const actions = [
  ['fire', 'Fire weapon'],
  ['aim', 'Toggle ADS'],
  ['jump', 'Jump'],
  ['slide', 'Crouch or slide'],
  ['prone', 'Toggle prone'],
  ['dive', 'Dive'],
  ['reload', 'Reload weapon'],
  ['swap', 'Switch weapon'],
  ['inspect', 'Inspect weapon'],
  ['scores', 'Show scores'],
  ['pause', 'Pause game'],
] as const;

interface HudEditorInteraction {
  selected: MobileHudControlId;
  select(id: MobileHudControlId): void;
  position(id: MobileHudControlId, x: number, y: number): void;
}

export function MobileHUD({
  attach,
  tablet,
  showInspect = false,
  layout,
  editor,
  multiplayer = false,
  movement,
  minimap,
}: {
  attach?: (root: HTMLElement) => (() => void) | undefined;
  tablet: boolean;
  showInspect?: boolean;
  layout: MobileHudLayout;
  editor?: HudEditorInteraction;
  multiplayer?: boolean;
  minimap?: { map: ArenaId; marker?: Ref<HTMLSpanElement> };
  movement?: {
    movementState: MovementState;
    speed: number;
    grounded: boolean;
  } | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<HudViewport | null>(null);
  const drag = useRef<{
    pointerId: number;
    control: MobileHudControlId;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
  } | null>(null);

  useLayoutEffect(() => {
    const element = root.current!;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = element;
      const style = getComputedStyle(element);
      if (!width || !height) return;
      setViewport({
        width,
        height,
        safe: {
          left: parseFloat(style.paddingLeft),
          right: parseFloat(style.paddingRight),
          top: parseFloat(style.paddingTop),
          bottom: parseFloat(style.paddingBottom),
        },
        hudClearance: multiplayer
          ? {
              top: parseFloat(style.getPropertyValue('--match-touch-top')) || 0,
              bottom:
                parseFloat(style.getPropertyValue('--match-touch-bottom')) || 0,
              feedHeight:
                parseFloat(style.getPropertyValue('--match-feed-height')) || 0,
            }
          : undefined,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [multiplayer]);

  useLayoutEffect(() => attach?.(root.current!), [attach]);
  const defaultBoxes = useMemo(
    () => (viewport ? resolveDefaultMobileHud(viewport, tablet) : null),
    [viewport, tablet],
  );
  const boxes = useMemo(
    () =>
      viewport && defaultBoxes
        ? resolveMobileHud(layout, viewport, defaultBoxes)
        : {},
    [layout, viewport, defaultBoxes],
  );
  const { joystick, sprint } = boxes;
  const sprintDistance =
    joystick && sprint
      ? Math.hypot(sprint.x - joystick.x, sprint.y - joystick.y)
      : undefined;
  const stance = movement?.movementState;
  const showSlide =
    stance === 'sliding' ||
    stance === 'backsliding' ||
    (stance === 'sprinting' &&
      movement?.grounded &&
      movement.speed >= movementConfig.slideMinimumSpeed);
  const pressed: Partial<Record<MobileHudControlId, boolean>> = editor
    ? {}
    : {
        aim: false,
        slide: stance === 'crouching',
        prone: stance === 'prone',
      };

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!editor || drag.current || event.button !== 0) return;
    const control = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-hud-id]',
    );
    if (!control) return;
    const id = control.dataset.hudId as MobileHudControlId;
    const rect = control.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      control: id,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - (rect.left + rect.width / 2),
      offsetY: event.clientY - (rect.top + rect.height / 2),
    };
    editor.select(id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!editor || !viewport || !active || active.pointerId !== event.pointerId)
      return;
    if (
      Math.hypot(event.clientX - active.startX, event.clientY - active.startY) <
      3
    )
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // The center docks at the viewport edge; the viewport clips the rest of the control.
    const x = (event.clientX - active.offsetX - rect.left) / rect.width;
    const y = (event.clientY - active.offsetY - rect.top) / rect.height;
    editor.position(
      active.control,
      Math.max(0, Math.min(1, x)),
      Math.max(0, Math.min(1, y)),
    );
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function controlStyle(id: MobileHudControlId): CSSProperties {
    const box = boxes[id];
    if (!box || !layout[id].visible) return { display: 'none' };
    return {
      left: box.x,
      top: box.y,
      width: box.width,
      height: box.height,
      transform: `translate(-50%, -50%) scale(${box.scale})`,
      '--hud-opacity': `${layout[id].opacity}%`,
    } as CSSProperties;
  }

  return (
    <div
      ref={root}
      className={`mobile-hud ${tablet ? 'tablet' : 'phone'} ${multiplayer ? 'match-layout' : ''}`}
      aria-label="Touch controls"
      onPointerDown={editor ? startDrag : undefined}
      onPointerMove={editor ? moveDrag : undefined}
      onPointerUp={editor ? stopDrag : undefined}
      onPointerCancel={editor ? stopDrag : undefined}
      onLostPointerCapture={editor ? stopDrag : undefined}
    >
      {!editor && (
        <div
          className="touch-look"
          data-touch-control="look"
          aria-label="Drag to look"
        />
      )}
      {minimap &&
        boxes.minimap &&
        (editor ? (
          <button
            type="button"
            className="touch-minimap editable-minimap"
            data-hud-id="minimap"
            data-selected={editor.selected === 'minimap'}
            aria-label="Minimap"
            onClick={() => editor.select('minimap')}
            style={controlStyle('minimap')}
          >
            <Minimap map={minimap.map} opacity={layout.minimap.opacity} />
          </button>
        ) : (
          <div className="touch-minimap" style={controlStyle('minimap')}>
            <Minimap
              map={minimap.map}
              marker={minimap.marker}
              opacity={layout.minimap.opacity}
            />
          </div>
        ))}
      <button
        type="button"
        className="touch-joystick"
        data-touch-control="joystick"
        data-hud-id="joystick"
        data-sprint-distance={sprintDistance}
        data-selected={editor?.selected === 'joystick'}
        data-silent
        aria-label="Movement joystick"
        style={controlStyle('joystick')}
        onClick={editor ? () => editor.select('joystick') : undefined}
      >
        <MobileControlIcon name="joystick" />
        <span data-joystick-knob className="joystick-knob" />
      </button>
      {editor ? (
        <button
          type="button"
          className="touch-button touch-sprint"
          data-hud-id="sprint"
          data-selected={editor.selected === 'sprint'}
          aria-label="Sprint trigger"
          style={controlStyle('sprint')}
          onClick={() => editor.select('sprint')}
        >
          <MobileControlIcon name="sprint" />
        </button>
      ) : (
        <div
          className="touch-button touch-sprint"
          data-hud-id="sprint"
          data-sprint-indicator
          role="img"
          aria-label="Sprint indicator"
          style={controlStyle('sprint')}
        >
          <MobileControlIcon name="sprint" />
        </div>
      )}
      {actions
        .filter(([control]) => control !== 'inspect' || editor || showInspect)
        .filter(([control]) => control !== 'swap' || editor || !multiplayer)
        .map(([control, label]) => (
          <button
            key={control}
            type="button"
            className={`touch-button touch-${control}`}
            data-touch-control={control}
            data-hud-id={control}
            data-selected={editor?.selected === control}
            data-engaged={pressed[control]}
            style={controlStyle(control)}
            data-silent
            aria-label={label}
            aria-pressed={pressed[control]}
            onClick={editor ? () => editor.select(control) : undefined}
          >
            <MobileControlIcon
              name={control === 'slide' && !showSlide ? 'crouch' : control}
            />
          </button>
        ))}
    </div>
  );
}
