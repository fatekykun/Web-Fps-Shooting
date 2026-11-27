import {
  mobileHudControlIds,
  type MobileHudControlId,
  type MobileHudLayout,
} from './mobileHudSettings';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface HudViewport {
  width: number;
  height: number;
  safe: Box;
  hudClearance?: { top: number; bottom: number; feedHeight: number };
}
interface ControlBox {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

// Each tuple gives width, height, horizontal inset and vertical inset.
const phone = {
  joystick: [120, 120, 0, 0],
  sprint: [48, 48, 0, 0],
  fire: [72, 72, 72, 83],
  aim: [48, 48, 0, 144],
  jump: [48, 48, 0, 62],
  slide: [48, 48, 55, 0],
  prone: [48, 48, 116, 161],
  reload: [48, 48, 112, 0],
  dive: [48, 48, 169, 0],
  swap: [62, 48, 170, 70],
  inspect: [44, 44, 110, 0],
  pause: [44, 44, 0, 0],
  scores: [52, 44, 52, 0],
  minimap: [100, 100, 0, 0],
} as const;
const compact = {
  ...phone,
  joystick: [104, 104, 0, 0],
  swap: [62, 48, 146, 74],
  minimap: [84, 84, 0, 0],
} as const;
const tablet = {
  joystick: [164, 164, 16, 24],
  sprint: [60, 60, 0, 0],
  fire: [88, 88, 112, 158],
  aim: [60, 60, 20, 230],
  jump: [60, 60, 20, 124],
  slide: [60, 60, 42, 30],
  prone: [60, 60, 122, 256],
  reload: [60, 60, 126, 30],
  dive: [60, 60, 210, 30],
  swap: [60, 60, 240, 138],
  inspect: phone.inspect,
  pause: phone.pause,
  scores: phone.scores,
  minimap: [138, 138, 0, 0],
} as const;
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Snap to the nearest point where the whole control fits with a small gap. */
function findPosition(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  bounds: Box,
  occupied: Box[],
) {
  const minX = bounds.left + halfWidth,
    maxX = bounds.right - halfWidth;
  const minY = bounds.top + halfHeight,
    maxY = bounds.bottom - halfHeight;
  if (maxX < minX || maxY < minY) return null;
  const gap = 4;
  const blocked = occupied.map((box) => ({
    left: box.left - halfWidth - gap,
    right: box.right + halfWidth + gap,
    top: box.top - halfHeight - gap,
    bottom: box.bottom + halfHeight + gap,
  }));
  const xs = [x, ...blocked.flatMap((box) => [box.left, box.right])].map(
    (value) => clamp(value, minX, maxX),
  );
  const ys = [y, ...blocked.flatMap((box) => [box.top, box.bottom])].map(
    (value) => clamp(value, minY, maxY),
  );
  let nearest: null | { x: number; y: number } = null;
  let distance = Infinity;
  for (const candidateX of xs)
    for (const candidateY of ys) {
      const nextDistance = (candidateX - x) ** 2 + (candidateY - y) ** 2;
      if (
        nextDistance >= distance ||
        blocked.some(
          (box) =>
            candidateX > box.left &&
            candidateX < box.right &&
            candidateY > box.top &&
            candidateY < box.bottom,
        )
      )
        continue;
      nearest = { x: candidateX, y: candidateY };
      distance = nextDistance;
    }
  return nearest;
}

export function resolveDefaultMobileHud(
  viewport: HudViewport,
  isTablet: boolean,
) {
  const { width, height, safe } = viewport;
  const { top: headerHeight, bottom: footerHeight } = viewport.hudClearance ?? {
    top: 0,
    bottom: 0,
  };
  const small = width <= 700;
  const metrics = isTablet ? tablet : small ? compact : phone;
  const margin = small ? 10 : 16;
  const left = Math.max(safe.left, small ? 10 : 20);
  const right = width - Math.max(safe.right, margin);
  const top = Math.max(safe.top, 6) + headerHeight;
  const bottom = height - Math.max(safe.bottom, margin) - footerHeight;
  const bounds = {
    left: safe.left + 4,
    right: width - safe.right - 4,
    top: safe.top + 4 + headerHeight,
    bottom: height - safe.bottom - 4 - footerHeight,
  };
  const occupied: Box[] = [
    {
      left: width / 2 - 20,
      right: width / 2 + 20,
      top: height / 2 - 20,
      bottom: height / 2 + 20,
    },
  ];
  // Training ammo is centered. Multiplayer uses a separate footer below the controls.
  if (!viewport.hudClearance)
    occupied.push({
      left: width / 2 - (small ? 56 : 71),
      right: width / 2 + (small ? 56 : 71),
      top: height - Math.max(safe.bottom, 8) - 86,
      bottom: height,
    });
  else {
    // Reserve the feed from the start so touch controls never jump when a kill appears.
    const feedLeft = Math.max(8, safe.left);
    occupied.push({
      left: feedLeft,
      right: feedLeft + Math.min(width * 0.28, 240),
      top: bounds.top,
      bottom: bounds.top + viewport.hudClearance.feedHeight,
    });
  }
  const result = {} as Record<MobileHudControlId, ControlBox>;
  // Fit the stock button sizes once so edits never move another control's default anchor.
  const priority = [...mobileHudControlIds].sort((a, b) => {
    if (a === 'pause') return -1;
    if (b === 'pause') return 1;
    if (a === 'minimap') return 1;
    if (b === 'minimap') return -1;
    return metrics[b][0] - metrics[a][0];
  });
  for (const id of priority) {
    const [w, h, offsetX, offsetY] = metrics[id];
    const map = id === 'minimap';
    const leftControl = map || id === 'joystick';
    const topControl =
      map || id === 'pause' || id === 'scores' || id === 'inspect';
    const itemBounds = map
      ? { ...bounds, top: Math.max(bounds.top, safe.top + 54) }
      : bounds;
    const feedInset =
      map && viewport.hudClearance ? Math.min(width * 0.28, 240) + 4 : 0;
    const x =
      id === 'sprint'
        ? result.joystick.x
        : leftControl
          ? left + offsetX + feedInset + w / 2
          : right - offsetX - w / 2;
    const y =
      id === 'sprint'
        ? result.joystick.y - (result.joystick.height + h) / 2 - 4
        : topControl
          ? Math.max(top, itemBounds.top) + offsetY + h / 2
          : bottom - offsetY - h / 2;
    let scale = 1;
    let position = findPosition(
      x,
      y,
      (w * scale) / 2,
      (h * scale) / 2,
      itemBounds,
      occupied,
    );
    // On very small screens, find an anchor even when the full stock box cannot fit.
    while (!position && scale > 0.25) {
      scale = Math.max(0.25, scale - 0.1);
      position = findPosition(
        x,
        y,
        (w * scale) / 2,
        (h * scale) / 2,
        itemBounds,
        occupied,
      );
    }
    result[id] = {
      x: position?.x ?? clamp(x, 0, width),
      y: position?.y ?? clamp(y, 0, height),
      width: w,
      height: h,
      scale: 1,
    };
    if (position)
      occupied.push({
        left: position.x - (w * scale) / 2,
        right: position.x + (w * scale) / 2,
        top: position.y - (h * scale) / 2,
        bottom: position.y + (h * scale) / 2,
      });
  }
  return result;
}

export function resolveMobileHud(
  layout: MobileHudLayout,
  viewport: HudViewport,
  defaults: Record<MobileHudControlId, ControlBox>,
) {
  const { width, height, safe } = viewport;
  const result: Partial<Record<MobileHudControlId, ControlBox>> = {};
  for (const id of mobileHudControlIds) {
    const control = layout[id];
    // A hidden sprint marker still sets the activation distance.
    if (!control.visible && id !== 'sprint') continue;
    const stock = defaults[id];
    const viewportCoordinates = control.coordinates === 'viewport';
    // Saved layouts from before edge docking are relative to the safe area.
    const x =
      control.x === null
        ? stock.x
        : viewportCoordinates
          ? control.x * width
          : safe.left + control.x * (width - safe.left - safe.right);
    const y =
      control.y === null
        ? stock.y
        : viewportCoordinates
          ? control.y * height
          : safe.top + control.y * (height - safe.top - safe.bottom);
    result[id] = { ...stock, x, y, scale: control.scale / 100 };
  }
  const { joystick, sprint } = result;
  if (joystick && sprint) {
    // Keep the stock marker paired with the joystick until the player moves it.
    const stockJoystick = defaults.joystick;
    if (layout.sprint.x === null) {
      sprint.x = clamp(sprint.x + joystick.x - stockJoystick.x, 0, width);
    }
    if (layout.sprint.y === null) {
      const upperEdge = joystick.y - (joystick.height * joystick.scale) / 2;
      const stockUpperEdge = stockJoystick.y - stockJoystick.height / 2;
      sprint.y = clamp(sprint.y + upperEdge - stockUpperEdge, 0, height);
    }
  }
  return result;
}
