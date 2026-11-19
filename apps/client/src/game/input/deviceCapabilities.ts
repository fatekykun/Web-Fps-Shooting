export interface DeviceSignals {
  touchPoints: number;
  coarse: boolean;
  fine: boolean;
  hover: boolean;
  screenWidth: number;
  screenHeight: number;
  width: number;
  height: number;
  userAgent: string;
  platform: string;
}
export interface DeviceCapabilities {
  kind: 'desktop' | 'hybrid' | 'phone' | 'tablet';
  touch: boolean;
  handheld: boolean;
  tablet: boolean;
  landscape: boolean;
}

/** Pointer capabilities decide the default; UA only supplements handheld detection. */
export function classifyDevice(s: DeviceSignals): DeviceCapabilities {
  const touch = s.touchPoints > 0 || s.coarse;
  const handheldHint =
    /Android|iPhone|iPad|iPod/i.test(s.userAgent) ||
    (s.platform === 'MacIntel' && s.touchPoints > 1);
  const handheld = touch && (handheldHint || (s.coarse && !s.hover) || !s.fine);
  const tablet = touch && Math.min(s.screenWidth, s.screenHeight) >= 600;
  return {
    kind: handheld
      ? tablet
        ? 'tablet'
        : 'phone'
      : touch
        ? 'hybrid'
        : 'desktop',
    touch,
    handheld,
    tablet,
    landscape: s.width > s.height,
  };
}

export function readDevice(): DeviceCapabilities {
  const media = (query: string) =>
    typeof matchMedia === 'function' && matchMedia(query).matches;
  return classifyDevice({
    touchPoints: navigator.maxTouchPoints || 0,
    coarse: media('(pointer: coarse)'),
    fine: media('(any-pointer: fine)'),
    hover: media('(hover: hover)'),
    screenWidth: window.screen?.width || window.innerWidth,
    screenHeight: window.screen?.height || window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
    userAgent: navigator.userAgent || '',
    platform: navigator.platform || '',
  });
}

/** Unsupported/restricted locks fall back to the viewport-based portrait blocker. */
export async function requestLandscape(fullscreen = false): Promise<void> {
  if (!readDevice().handheld) return;
  if (
    fullscreen &&
    !document.fullscreenElement &&
    document.documentElement.requestFullscreen
  ) {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* Safari may reject fullscreen. */
    }
  }
  const orientation = window.screen?.orientation as
    | (ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      })
    | undefined;
  try {
    await orientation?.lock?.('landscape');
  } catch {
    /* Keep the rotate overlay. */
  }
}
