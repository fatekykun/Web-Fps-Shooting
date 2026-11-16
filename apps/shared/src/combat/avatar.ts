import { movementConfig } from '../config/movement';
import type { Vector3Like } from '../types/movement';
import type { HitRegion } from '../types/weapons';

/** Feet-relative positions and dimensions, shared by remote rendering and server hitboxes. */
export const avatarParts = [
  [0, 1.48, 0, 0.38, 0.38, 0.38],
  [0, 0.99, 0, 0.53, 0.62, 0.3],
  [-0.36, 1.03, -0.1, 0.18, 0.56, 0.22],
  [0.36, 1.03, -0.1, 0.18, 0.56, 0.22],
  [-0.15, 0.36, 0, 0.22, 0.7, 0.26],
  [0.15, 0.36, 0, 0.22, 0.7, 0.26],
  [0.28, 1.08, -0.4, 0.13, 0.15, 0.65],
] as const;
export const standingAnchor =
  movementConfig.capsuleHalfHeight + movementConfig.capsuleRadius;
export function avatarScale(halfHeight: number): number {
  return (halfHeight + movementConfig.capsuleRadius) / standingAnchor;
}
interface Pose extends Vector3Like {
  yaw: number;
  pitch: number;
  halfHeight: number;
}

/** Ray/slab test in each rendered part's local space. Parameter t remains world distance. */
export function intersectAvatar(
  origin: Vector3Like,
  direction: Vector3Like,
  pose: Pose,
  range: number,
): { distance: number; head: boolean; region: HitRegion } | null {
  const c = Math.cos(pose.yaw),
    s = Math.sin(pose.yaw),
    scale = avatarScale(pose.halfHeight);
  const ox = origin.x - pose.x,
    oz = origin.z - pose.z;
  const localOrigin = [
    c * ox - s * oz,
    (origin.y - pose.y + standingAnchor) / scale,
    s * ox + c * oz,
  ];
  const localDirection = [
    c * direction.x - s * direction.z,
    direction.y / scale,
    s * direction.x + c * direction.z,
  ];
  let closest = range;
  let result: { distance: number; head: boolean; region: HitRegion } | null =
    null;
  // Weapon geometry is cosmetic and cannot absorb bullets.
  for (let part = 0; part < avatarParts.length - 1; part++) {
    const box = avatarParts[part]!;
    const o = [
      localOrigin[0]! - box[0],
      localOrigin[1]! - box[1],
      localOrigin[2]! - box[2],
    ];
    const d = [...localDirection];
    if (part === 0) {
      const cp = Math.cos(pose.pitch),
        sp = Math.sin(pose.pitch);
      const oy = o[1]!,
        dy = d[1]!;
      o[1] = cp * oy + sp * o[2]!;
      o[2] = -sp * oy + cp * o[2]!;
      d[1] = cp * dy + sp * d[2]!;
      d[2] = -sp * dy + cp * d[2]!;
    }
    let near = 0,
      far = closest;
    for (let axis = 0; axis < 3; axis++) {
      const half = box[axis + 3]! / 2;
      if (Math.abs(d[axis]!) < 1e-10) {
        if (Math.abs(o[axis]!) > half) {
          far = -1;
          break;
        }
      } else {
        const a = (-half - o[axis]!) / d[axis]!,
          b = (half - o[axis]!) / d[axis]!;
        near = Math.max(near, Math.min(a, b));
        far = Math.min(far, Math.max(a, b));
      }
    }
    if (near <= far && near < closest) {
      closest = near;
      const region: HitRegion =
        part === 0
          ? 'head'
          : part === 1
            ? localOrigin[1]! + localDirection[1]! * near >= box[1]
              ? 'upperTorso'
              : 'lowerTorso'
            : part <= 3
              ? 'arms'
              : 'legs';
      result = { distance: near, head: part === 0, region };
    }
  }
  return result;
}
