import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import {
  resolveMobileHud,
  type HudViewport,
} from '../game/input/mobileHudGeometry';
import {
  type MobileHudLayout,
  type MobileHudControlId,
} from '../game/input/mobileHudSettings';

const actions = [
  ['sprint', 'SPRINT', 'Toggle sprint'],
  ['fire', 'FIRE', 'Fire weapon'],
  ['aim', 'ADS', 'Toggle ADS'],
  ['jump', 'JUMP', 'Jump'],
  ['slide', 'SLIDE', 'Slide or cancel slide'],
  ['dive', 'DIVE', 'Dive'],
  ['reload', 'R', 'Reload weapon'],
  ['swap', 'SWAP', 'Switch weapon'],
  ['scores', 'SCORES', 'Show scores'],
  ['pause', 'II', 'Pause game'],
] as const;

interface HudEditorInteraction {
  selected: MobileHudControlId;
  select(id: MobileHudControlId): void;
  position(id: MobileHudControlId, x: number, y: number): void;
}

export function MobileHUD({
  attach,
  tablet,
  layout,
  editor,
}: {
  attach?: (root: HTMLElement) => (() => void) | undefined;
  tablet: boolean;
  layout: MobileHudLayout;
  editor?: HudEditorInteraction;
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
  }, []);

  useLayoutEffect(() => attach?.(root.current!), [attach]);
  const boxes = useMemo(
    () => (viewport ? resolveMobileHud(layout, viewport, tablet) : {}),
    [layout, viewport, tablet],
  );

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
    const { width, height, safe } = viewport;
    if (!rect.width || !rect.height) return;
    const x =
      (((event.clientX - active.offsetX - rect.left) * width) / rect.width -
        safe.left) /
      (width - safe.left - safe.right);
    const y =
      (((event.clientY - active.offsetY - rect.top) * height) / rect.height -
        safe.top) /
      (height - safe.top - safe.bottom);
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
    if (!box) return { display: 'none' };
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
      className={`mobile-hud ${tablet ? 'tablet' : 'phone'}`}
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
      <button
        type="button"
        className="touch-joystick"
        data-touch-control="joystick"
        data-hud-id="joystick"
        data-selected={editor?.selected === 'joystick'}
        data-silent
        aria-label="Movement joystick"
        style={controlStyle('joystick')}
        onClick={editor ? () => editor.select('joystick') : undefined}
      >
        <span className="joystick-guide" aria-hidden="true">
          +
        </span>
        <span data-joystick-knob className="joystick-knob" />
      </button>
      {actions.map(([control, text, label]) => (
        <button
          key={control}
          type="button"
          className={`touch-button touch-${control}`}
          data-touch-control={control}
          data-hud-id={control}
          data-selected={editor?.selected === control}
          style={controlStyle(control)}
          data-silent
          aria-label={label}
          aria-pressed={
            !editor && (control === 'aim' || control === 'sprint')
              ? false
              : undefined
          }
          onClick={editor ? () => editor.select(control) : undefined}
        >
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
