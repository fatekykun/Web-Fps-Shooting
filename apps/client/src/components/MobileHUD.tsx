import { useEffect, useRef } from 'react';

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

export function MobileHUD({
  attach,
  tablet,
}: {
  attach: (root: HTMLElement) => (() => void) | undefined;
  tablet: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => attach(root.current!), [attach]);
  return (
    <div
      ref={root}
      className={`mobile-hud ${tablet ? 'tablet' : 'phone'}`}
      aria-label="Touch controls"
    >
      <div
        className="touch-look"
        data-touch-control="look"
        aria-label="Drag to look"
      />
      <div
        className="touch-joystick"
        data-touch-control="joystick"
        aria-label="Movement joystick"
      >
        <span className="joystick-guide" aria-hidden="true">
          +
        </span>
        <span data-joystick-knob className="joystick-knob" />
      </div>
      {actions.map(([control, text, label]) => (
        <button
          key={control}
          type="button"
          className={`touch-button touch-${control}`}
          data-touch-control={control}
          data-silent
          aria-label={label}
          aria-pressed={
            control === 'aim' || control === 'sprint' ? false : undefined
          }
        >
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
