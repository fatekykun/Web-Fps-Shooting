import { arenas, type ArenaBox, type ArenaId } from '@breakpoint/shared/maps';

const minimapSize = 192;
const padding = 12;
const images = new Map<ArenaId, string>();

export function minimapProjection(map: ArenaId) {
  const [halfX, halfZ] = arenas[map].respawns.bounds;
  const units = (minimapSize / 2 - padding) / Math.max(halfX, halfZ);
  return { halfX, halfZ, units };
}

export function minimapFootprints(map: ArenaId): readonly ArenaBox[] {
  const { halfX, halfZ } = minimapProjection(map);
  return arenas[map].colliders.filter((box) => {
    const [x, y, z] = box.position;
    const [width, height, length] = box.size;
    const bottom = y - height / 2;
    if (Math.abs(x) >= halfX || Math.abs(z) >= halfZ || y <= 0) return false;
    // Skip sheet-metal floors and entrances, so a walk-through has visible openings.
    if (height <= 0.12 && box.footstepSurface === 'metal') return false;
    // Keep wide raised decks and overhangs while omitting doors' overhead headers.
    return (
      bottom < 1.8 ||
      (box.footstepSurface === 'wood' && width > 2 && length > 2)
    );
  });
}

export function placeMinimapMarker(
  marker: HTMLSpanElement,
  map: ArenaId,
  x: number,
  z: number,
  yaw: number,
): void {
  const { halfX, halfZ, units } = minimapProjection(map);
  const xp =
    50 + (Math.max(-halfX, Math.min(halfX, x)) * units * 100) / minimapSize;
  const zp =
    50 + (Math.max(-halfZ, Math.min(halfZ, z)) * units * 100) / minimapSize;
  marker.style.left = `${xp}%`;
  marker.style.top = `${zp}%`;
  // The game faces -Z at zero yaw, with positive yaw turning toward -X.
  marker.style.transform = `translate(-50%, -50%) rotate(${-yaw}rad)`;
}

export function minimapImage(map: ArenaId): string {
  const cached = images.get(map);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = minimapSize;
  drawMinimap(canvas, map);
  const image = canvas.toDataURL();
  images.set(map, image);
  return image;
}

function drawMinimap(canvas: HTMLCanvasElement, map: ArenaId): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { halfX, halfZ, units } = minimapProjection(map);
  ctx.clearRect(0, 0, minimapSize, minimapSize);
  ctx.save();
  ctx.translate(minimapSize / 2, minimapSize / 2);
  ctx.scale(units, units);
  ctx.beginPath();
  ctx.rect(-halfX, -halfZ, halfX * 2, halfZ * 2);
  ctx.clip();
  ctx.fillStyle = '#202e28';
  ctx.fillRect(-halfX, -halfZ, halfX * 2, halfZ * 2);
  ctx.strokeStyle = '#35463b';
  ctx.lineWidth = 0.065;
  ctx.beginPath();
  for (let x = 0; x <= halfX; x += 4) {
    ctx.moveTo(x, -halfZ);
    ctx.lineTo(x, halfZ);
    ctx.moveTo(-x, -halfZ);
    ctx.lineTo(-x, halfZ);
  }
  for (let z = 0; z <= halfZ; z += 4) {
    ctx.moveTo(-halfX, z);
    ctx.lineTo(halfX, z);
    ctx.moveTo(-halfX, -z);
    ctx.lineTo(halfX, -z);
  }
  ctx.stroke();

  for (const box of minimapFootprints(map)) {
    const [x, y, z] = box.position;
    const [width, height, length] = box.size;
    const raised = y - height / 2 > 0.8;
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-(box.yaw ?? 0));
    ctx.fillStyle = raised
      ? '#94937d55'
      : box.kind === 'crate'
        ? '#9e886c'
        : '#78867a';
    ctx.strokeStyle = raised ? '#989981' : '#acb3a0';
    ctx.lineWidth = 0.13;
    if (box.kind === 'barrel') {
      ctx.beginPath();
      ctx.ellipse(0, 0, width / 2, length / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-width / 2, -length / 2, width, length);
      ctx.strokeRect(-width / 2, -length / 2, width, length);
    }
    ctx.restore();
  }
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = '#a3ac98';
  ctx.strokeRect(-halfX, -halfZ, halfX * 2, halfZ * 2);
  ctx.restore();
}
