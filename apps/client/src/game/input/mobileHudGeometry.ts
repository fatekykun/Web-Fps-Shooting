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

// Original edge offsets from the phone, compact phone and tablet HUDs.
// Each tuple gives width, height, horizontal inset and vertical inset.
const phone = {
  joystick: [120, 120, 0, 0],
  sprint: [48, 48, 36, 140],
  fire: [72, 72, 72, 83],
  aim: [48, 48, 0, 144],
  jump: [48, 48, 0, 62],
  slide: [48, 48, 55, 0],
  prone: [48, 48, 116, 161],
  reload: [48, 48, 112, 0],
  dive: [48, 48, 169, 0],
  swap: [62, 48, 170, 70],
  pause: [44, 44, 0, 0],
  scores: [52, 44, 52, 0],
} as const;
const compact = {
  ...phone,
  joystick: [104, 104, 0, 0],
  sprint: [48, 48, 28, 120],
  swap: [62, 48, 146, 74],
} as const;
const tablet = {
  joystick: [164, 164, 16, 24],
  sprint: [60, 60, 70, 212],
  fire: [88, 88, 112, 158],
  aim: [60, 60, 20, 230],
  jump: [60, 60, 20, 124],
  slide: [60, 60, 42, 30],
  prone: [60, 60, 122, 256],
  reload: [60, 60, 126, 30],
  dive: [60, 60, 210, 30],
  swap: [60, 60, 240, 138],
  pause: phone.pause,
  scores: phone.scores,
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

export function resolveMobileHud(
  layout: MobileHudLayout,
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
  const safeWidth = width - safe.left - safe.right;
  const safeHeight = height - safe.top - safe.bottom;
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
  const result: Partial<Record<MobileHudControlId, ControlBox>> = {};
  // Keep Pause reachable, then give the larger controls first pick of open space.
  const priority = [...mobileHudControlIds]
    .filter((id) => layout[id].visible)
    .sort((a, b) => {
      if (a === 'pause') return -1;
      if (b === 'pause') return 1;
      return metrics[b][0] * layout[b].scale - metrics[a][0] * layout[a].scale;
    });
  for (const id of priority) {
    const [w, h, offsetX, offsetY] = metrics[id];
    const control = layout[id];
    const leftControl = id === 'joystick' || id === 'sprint';
    const topControl = id === 'pause' || id === 'scores';
    const x =
      control.x === null
        ? leftControl
          ? left + offsetX + w / 2
          : right - offsetX - w / 2
        : safe.left + control.x * safeWidth;
    const y =
      control.y === null
        ? topControl
          ? top + offsetY + h / 2
          : bottom - offsetY - h / 2
        : safe.top + control.y * safeHeight;
    let scale = control.scale / 100;
    let position = findPosition(
      x,
      y,
      (w * scale) / 2,
      (h * scale) / 2,
      bounds,
      occupied,
    );
    // Very crowded layouts can exceed the space on a smaller screen. Preserve
    // the saved size and fit this rendering as closely as the viewport allows.
    while (!position && scale > 0.25) {
      scale = Math.max(0.25, scale - 0.1);
      position = findPosition(
        x,
        y,
        (w * scale) / 2,
        (h * scale) / 2,
        bounds,
        occupied,
      );
    }
    if (!position) continue;
    result[id] = { ...position, width: w, height: h, scale };
    occupied.push({
      left: position.x - (w * scale) / 2,
      right: position.x + (w * scale) / 2,
      top: position.y - (h * scale) / 2,
      bottom: position.y + (h * scale) / 2,
    });
  }
  return result;
}
