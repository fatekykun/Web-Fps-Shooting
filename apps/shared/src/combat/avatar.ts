import { movementConfig } from '../config/movement';
import type { Vector3Like } from '../types/movement';
import type { HitRegion } from '../types/weapons';

interface AvatarPart {
  region: HitRegion | null;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  pivot?: readonly [number, number, number];
  swing?: number;
}

/** One small box rig: rendering and server hit validation use these exact regions/joints. */
export const avatarParts: readonly AvatarPart[] = [
  { region: 'head', position: [0, 1.48, 0], size: [0.38, 0.38, 0.38] },
  { region: 'upperTorso', position: [0, 1.145, 0], size: [0.53, 0.31, 0.3] },
  { region: 'lowerTorso', position: [0, 0.835, 0], size: [0.53, 0.31, 0.3] },
  {
    region: 'leftArm',
    position: [-0.36, 1.12, -0.1],
    size: [0.18, 0.38, 0.22],
    pivot: [-0.36, 1.3, 0],
    swing: -0.4,
  },
  {
    region: 'rightArm',
    position: [0.36, 1.12, -0.1],
    size: [0.18, 0.38, 0.22],
    pivot: [0.36, 1.3, 0],
    swing: 0.4,
  },
  {
    region: 'leftHand',
    position: [-0.36, 0.84, -0.1],
    size: [0.18, 0.18, 0.22],
    pivot: [-0.36, 1.3, 0],
    swing: -0.4,
  },
  {
    region: 'rightHand',
    position: [0.36, 0.84, -0.1],
    size: [0.18, 0.18, 0.22],
    pivot: [0.36, 1.3, 0],
    swing: 0.4,
  },
  {
    region: 'leftLeg',
    position: [-0.15, 0.43, 0],
    size: [0.22, 0.56, 0.26],
    pivot: [-0.15, 0.72, 0],
    swing: 0.65,
  },
  {
    region: 'rightLeg',
    position: [0.15, 0.43, 0],
    size: [0.22, 0.56, 0.26],
    pivot: [0.15, 0.72, 0],
    swing: -0.65,
  },
  {
    region: 'leftFoot',
    position: [-0.15, 0.08, -0.06],
    size: [0.22, 0.14, 0.38],
    pivot: [-0.15, 0.72, 0],
    swing: 0.65,
  },
  {
    region: 'rightFoot',
    position: [0.15, 0.08, -0.06],
    size: [0.22, 0.14, 0.38],
    pivot: [0.15, 0.72, 0],
    swing: -0.65,
  },
  // Cosmetic geometry never absorbs bullets.
  { region: null, position: [0.28, 1.08, -0.4], size: [0.13, 0.15, 0.65] },
];
export const standingAnchor =
  movementConfig.capsuleHalfHeight + movementConfig.capsuleRadius;
export function avatarScale(halfHeight: number): number {
  return (halfHeight + movementConfig.capsuleRadius) / standingAnchor;
}
export interface AvatarPose extends Vector3Like {
  yaw: number;
  pitch: number;
  halfHeight: number;
  gaitPhase?: number;
  gaitAmount?: number;
}
export interface PartPose extends Vector3Like {
  rotationX: number;
}

/** Evaluate in rig space, with hands/feet attached to their arm/leg joint. */
export function avatarPartPose(
  part: AvatarPart,
  pose: Pick<AvatarPose, 'pitch' | 'gaitPhase' | 'gaitAmount'>,
  out: PartPose,
): PartPose {
  const angle =
    part.swing !== undefined
      ? part.swing *
        Math.sin(pose.gaitPhase ?? 0) *
        Math.max(0, Math.min(1, pose.gaitAmount ?? 0))
      : part.region === 'head' || part.region === null
        ? pose.pitch
        : 0;
  out.x = part.position[0];
  out.y = part.position[1];
  out.z = part.position[2];
  out.rotationX = angle;
  if (part.pivot) {
    const dy = out.y - part.pivot[1],
      dz = out.z - part.pivot[2];
    const c = Math.cos(angle),
      s = Math.sin(angle);
    out.y = part.pivot[1] + c * dy - s * dz;
    out.z = part.pivot[2] + s * dy + c * dz;
  }
  return out;
}

export interface AvatarHit {
  distance: number;
  head: boolean;
  region: HitRegion;
  point: Vector3Like;
}

/** Invert root yaw/posture and each joint rotation before the local-space slab test. */
export function intersectAvatar(
  origin: Vector3Like,
  direction: Vector3Like,
  pose: AvatarPose,
  range: number,
): AvatarHit | null {
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
  const transform: PartPose = { x: 0, y: 0, z: 0, rotationX: 0 };
  let closest = range,
    region: HitRegion | null = null;
  for (const part of avatarParts) {
    if (part.region === null) continue;
    avatarPartPose(part, pose, transform);
    const cp = Math.cos(transform.rotationX),
      sp = Math.sin(transform.rotationX);
    const oy = localOrigin[1]! - transform.y,
      oz = localOrigin[2]! - transform.z;
    const o = [
      localOrigin[0]! - transform.x,
      cp * oy + sp * oz,
      -sp * oy + cp * oz,
    ];
    const d = [
      localDirection[0]!,
      cp * localDirection[1]! + sp * localDirection[2]!,
      -sp * localDirection[1]! + cp * localDirection[2]!,
    ];
    let near = 0,
      far = closest;
    for (let axis = 0; axis < 3; axis++) {
      const half = part.size[axis]! / 2;
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
      region = part.region;
    }
  }
  return region === null
    ? null
    : {
        distance: closest,
        head: region === 'head',
        region,
        point: {
          x: origin.x + direction.x * closest,
          y: origin.y + direction.y * closest,
          z: origin.z + direction.z * closest,
        },
      };
}
