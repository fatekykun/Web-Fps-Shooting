import { movementConfig } from '../config/movement';
import type { Vector3Like } from '../types/movement';
import type { HitRegion } from '../types/weapons';
import {
  characterHitboxes,
  createRigTransforms,
  createJointPoses,
  evaluateRig,
  partTransform,
  rotatePoint,
  type CharacterPose,
} from './characterRig';

interface AvatarPart {
  region: HitRegion | null;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  pivot?: readonly [number, number, number];
  swing?: number;
}

/** Stationary HOLO-01 calibration target. Live tactical players use characterRig. */
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
export interface AvatarPose extends Vector3Like, CharacterPose {
  yaw: number;
  pitch: number;
  halfHeight: number;
  gaitPhase?: number;
  gaitAmount?: number;
}
export interface AvatarHit {
  distance: number;
  head: boolean;
  region: HitRegion;
  point: Vector3Like;
}

const bones = createRigTransforms();
const jointLocals = createJointPoses();
/** Invert the authoritative skeleton and each region's local collision hull. */
export function intersectAvatar(
  origin: Vector3Like,
  direction: Vector3Like,
  pose: AvatarPose,
  range: number,
): AvatarHit | null {
  const c = Math.cos(pose.yaw),
    s = Math.sin(pose.yaw);
  const ox = origin.x - pose.x,
    oz = origin.z - pose.z;
  const localOrigin = [
    c * ox - s * oz,
    origin.y - pose.y + standingAnchor,
    s * ox + c * oz,
  ];
  const localDirection = [
    c * direction.x - s * direction.z,
    direction.y,
    s * direction.x + c * direction.z,
  ];
  evaluateRig(pose, bones, jointLocals);
  const transform = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  const inverse = { qx: 0, qy: 0, qz: 0, qw: 1 };
  const point = { x: 0, y: 0, z: 0 },
    vector = { x: 0, y: 0, z: 0 };
  let closest = range,
    region: HitRegion | null = null;
  for (const part of characterHitboxes) {
    if (part.region === null) continue;
    partTransform(part, bones, transform);
    inverse.qx = -transform.qx;
    inverse.qy = -transform.qy;
    inverse.qz = -transform.qz;
    inverse.qw = transform.qw;
    rotatePoint(
      inverse,
      localOrigin[0]! - transform.x,
      localOrigin[1]! - transform.y,
      localOrigin[2]! - transform.z,
      point,
    );
    rotatePoint(
      inverse,
      localDirection[0]!,
      localDirection[1]!,
      localDirection[2]!,
      vector,
    );
    const o = [point.x, point.y, point.z],
      d = [vector.x, vector.y, vector.z];
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
