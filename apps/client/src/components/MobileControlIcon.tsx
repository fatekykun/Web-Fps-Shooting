import type { ReactNode } from 'react';
import type { MobileHudControlId } from '../game/input/mobileHudSettings';

export type MobileControlIconName =
  Exclude<MobileHudControlId, 'minimap'> | 'crouch';

const icons: Record<MobileControlIconName, ReactNode> = {
  joystick: (
    <path d="M10 4l2-2 2 2m-2-2v5m8 3 2 2-2 2m2-2h-5m-3 8-2 2-2-2m2 2v-5m-8-3-2-2 2-2m-2 2h5" />
  ),
  sprint: (
    <>
      <circle cx="16" cy="4.3" r="1.7" fill="currentColor" stroke="none" />
      <path d="m13.8 7.4-3.4 5.3 4.7 2.9L13 21m-2.6-8.3-3 4.7L3 19m10.8-11.6 3 3.3 3.7-1.8m-6.7-1.5-4.3.1-2.7 2.9" />
    </>
  ),
  fire: (
    <>
      <path d="m8.4 13.2 6-6c1.7-1.7 4-2.5 6.3-2.8-.3 2.3-1.1 4.6-2.8 6.3l-6 6-3.5-3.5Z" />
      <path d="m11.9 9.7 3.5 3.5m-6 1-2.8 2.8m.2-4-3.2 3.2m6.5 1.7-3.2 3.2" />
    </>
  ),
  aim: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v6m0 7v6m-9.5-9.5h6m7 0h6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  adsFire: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2" />
      <path d="m9 12.5 3.9-3.9 3.6-1.1-1.1 3.6-3.9 3.9Zm.2 2.3-1.7 1.7" />
    </>
  ),
  jump: (
    <>
      <circle cx="14" cy="4.4" r="1.7" fill="currentColor" stroke="none" />
      <path d="m12.8 7.6-2.4 5.5 4.8 1.6 2.3 3.8m-7.1-5.4-3.5 2.5-3.2-.6m9.1-7.4 3.9 2 2.4-3.8M12.8 7.6l-4.2.6L5 11m3 10h1.6m3.2 0h1.6" />
    </>
  ),
  slide: (
    <>
      <circle cx="10.6" cy="7" r="1.7" fill="currentColor" stroke="none" />
      <path d="m10 10-2.8 5.7 5.3.6 5.8 1.9h2.3m-8.1-1.9 2.5-3.6 3.9 2.1m-8.9-4.8 4.2 2 3.4-.8m-7.6-1.2-4.2 1.7-2.1 3.9M2 19h4" />
    </>
  ),
  crouch: (
    <>
      <circle cx="13.6" cy="5.3" r="1.7" fill="currentColor" stroke="none" />
      <path d="m12 8.2-4.1 6 6.2 1.1-1.5 4h3m-7.7-5.1-2.4 5.1h2.6M12 8.2l3 3.5 4.1-.6m-7.6-1.8 1.1 4 4.9.5" />
    </>
  ),
  prone: (
    <>
      <circle cx="18.2" cy="9.6" r="1.7" fill="currentColor" stroke="none" />
      <path d="m16.2 12.5-6.5 1.7-5.8.4-1.6 2.8m7.4-3.2-5.6 2.4m12.1-4.1 2.1 3.3 3.2-1.9M3 20h18" />
    </>
  ),
  dive: (
    <>
      <circle cx="16.5" cy="9.1" r="1.7" fill="currentColor" stroke="none" />
      <path d="m14 10.8-5.2 2.5-3.1-3-3.4 1.4m6.5 1.6-2.9 2.4-3.6.2m11.7-5.1 3.4 3.8 3.9.9m-7.3-3.7 1.6 5.1 3.7.7M5 20h5" />
    </>
  ),
  reload: (
    <path d="M20 11a8 8 0 1 0-2.2 6.6M20 6v5h-5m-4.7-3-.6 6.9 3.9.6.6-7z" />
  ),
  swap: <path d="M3.5 7.5h16.7m-4-4 4 4-4 4m4.3 5H3.8m4 4-4-4 4-4" />,
  inspect: (
    <path d="M3 12s3.2-5.2 9-5.2 9 5.2 9 5.2-3.2 5.2-9 5.2S3 12 3 12Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  ),
  scores: (
    <path d="M5 4h14v16H5zM8.5 8h.5m3.5 0h3m-7 4h.5m3.5 0h3m-7 4h.5m3.5 0h3" />
  ),
  pause: <path d="M8.5 5v14m7-14v14" />,
};

export function MobileControlIcon({ name }: { name: MobileControlIconName }) {
  return (
    <svg
      className="touch-control-icon"
      data-control-icon={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {icons[name]}
    </svg>
  );
}
