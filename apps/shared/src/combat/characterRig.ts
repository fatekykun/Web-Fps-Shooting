import type { Vector3Like } from '../types/movement';
import type { HitRegion } from '../types/weapons';
import type { CharacterAnimationValues } from './characterAnimation';
import { solveWeaponArms } from './weaponHandling';
export {
  remoteWeaponGrips,
  sprintArmPose,
  strideRadiansPerMeter,
} from './weaponHandling';

type Point = readonly [number, number, number];
export const rigJoints = [
  { name: 'pelvis', parent: -1, position: [0, 0.78, 0] },
  { name: 'spine', parent: 0, position: [0, 0.16, 0] },
  { name: 'chest', parent: 1, position: [0, 0.22, 0] },
  { name: 'neck', parent: 2, position: [0, 0.25, 0] },
  { name: 'head', parent: 3, position: [0, 0.14, 0] },
  { name: 'leftShoulder', parent: 2, position: [-0.29, 0.16, 0] },
  { name: 'leftUpperArm', parent: 5, position: [0, 0, 0] },
  { name: 'leftForearm', parent: 6, position: [0, -0.28, 0] },
  { name: 'leftWrist', parent: 7, position: [0, -0.26, 0] },
  { name: 'rightShoulder', parent: 2, position: [0.29, 0.16, 0] },
  { name: 'rightUpperArm', parent: 9, position: [0, 0, 0] },
  { name: 'rightForearm', parent: 10, position: [0, -0.28, 0] },
  { name: 'rightWrist', parent: 11, position: [0, -0.26, 0] },
  { name: 'leftHip', parent: 0, position: [-0.14, -0.03, 0] },
  { name: 'leftThigh', parent: 13, position: [0, 0, 0] },
  { name: 'leftShin', parent: 14, position: [0, -0.36, 0] },
  { name: 'leftAnkle', parent: 15, position: [0, -0.32, 0] },
  { name: 'rightHip', parent: 0, position: [0.14, -0.03, 0] },
  { name: 'rightThigh', parent: 17, position: [0, 0, 0] },
  { name: 'rightShin', parent: 18, position: [0, -0.36, 0] },
  { name: 'rightAnkle', parent: 19, position: [0, -0.32, 0] },
  { name: 'weapon', parent: 2, position: [0.1, 0.08, -0.32] },
] as const;
export type JointName = (typeof rigJoints)[number]['name'];
export type CharacterPose = Partial<CharacterAnimationValues> & {
  pitch: number;
  halfHeight: number;
  movement?: string;
};
export interface JointPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}
export interface RigTransform extends Vector3Like {
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}
export function createRigTransforms(): RigTransform[] {
  return rigJoints.map(() => ({
    x: 0,
    y: 0,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
  }));
}

export function characterSlide(pose: CharacterPose): number {
  const low = Math.max(0, Math.min(1, (0.55 - pose.halfHeight) / 0.35));
  const prone = pose.proneBlend ?? Number(pose.movement === 'prone');
  const crouch =
    (pose.crouchBlend ?? Number(pose.movement === 'crouching')) * (1 - prone);
  const dive = pose.diveBlend ?? Number(pose.halfHeight <= 0.1);
  return (
    (pose.slideBlend ?? (pose.halfHeight > 0.1 ? low : 0)) *
    (1 - crouch) *
    (1 - prone) *
    (1 - dive)
  );
}

export function slideBrace(
  pose: CharacterPose,
  slide = characterSlide(pose),
): number {
  return (
    slide *
    (1 - (pose.airBlend ?? 0)) *
    (1 - (pose.aimBlend ?? 0)) *
    (1 - (pose.reloadBlend ?? 0))
  );
}

/** Continuous local joint poses. Neither input, camera nor capsule is animated here. */
export function jointPose(
  index: number,
  pose: CharacterPose,
  out: JointPose,
  slide = characterSlide(pose),
): JointPose {
  const joint = rigJoints[index]!;
  const phase = pose.gaitPhase ?? 0,
    amount = pose.gaitAmount ?? 0;
  const sprint = pose.sprintBlend ?? 0,
    air = pose.airBlend ?? 0;
  const prone = pose.proneBlend ?? Number(pose.movement === 'prone');
  const crouch =
    (pose.crouchBlend ?? Number(pose.movement === 'crouching')) * (1 - prone);
  const standing = (1 - crouch) * (1 - prone);
  const dive = (pose.diveBlend ?? (pose.halfHeight <= 0.1 ? 1 : 0)) * standing;
  const land = pose.landingBlend ?? 0,
    hit = pose.hitBlend ?? 0,
    hitYaw = pose.hitYaw ?? 0;
  const breath = Math.sin((pose.animationTime ?? 0) * 2.2);
  const reload =
    (pose.reloadBlend ?? 0) * Math.sin(Math.PI * (pose.reloadProgress ?? 0));
  const aim = pose.aimBlend ?? 0;
  const carry =
    (pose.carryBlend ?? sprint) * (1 - aim) ** 3 * (1 - reload) * (1 - slide);
  const stride =
    Math.sin(phase) *
    amount *
    (0.5 + 0.25 * sprint) *
    (1 - slide) *
    (1 - dive) *
    (1 - crouch * 0.35) *
    (1 - prone * 0.76);
  const kneeSwing = amount * 0.8 * (1 - slide) * (1 - dive);
  const leftHip =
    stride + slide * 1.3 - dive * 1.2 + air * 0.25 + crouch * 1.06;
  const rightHip =
    -stride + slide * 1.48 - dive * 1.2 - air * 0.15 + crouch * 1.06;
  const leftKnee =
    -Math.max(0, -Math.sin(phase)) * kneeSwing -
    slide * 2.76 -
    air * 0.6 -
    land * 0.2 +
    dive * 0.15 -
    crouch * 1.87 -
    prone * 0.13;
  const rightKnee =
    -Math.max(0, Math.sin(phase)) * kneeSwing -
    slide * 0.16 -
    air * 0.55 -
    land * 0.2 +
    dive * 0.15 -
    crouch * 1.87 -
    prone * 0.13;
  out.x = joint.position[0];
  out.y = joint.position[1];
  out.z = joint.position[2];
  out.rx = out.ry = out.rz = 0;
  switch (joint.name) {
    case 'pelvis':
      out.y -=
        slide * 0.54 +
        dive * 0.47 +
        air * 0.055 +
        land * 0.065 +
        crouch * 0.285 +
        prone * 0.5;
      // Reach the legs forward before sitting into the slide. Keep the soles
      // above the floor during entry and recovery, with constant limb lengths.
      if ((slide > 0.05 && dive < 0.1) || crouch > 0.05 || prone > 0.05) {
        const bodyTilt = (-prone * Math.PI) / 2;
        const reach = Math.max(
          0.36 * Math.cos(bodyTilt + leftHip) +
            0.32 * Math.cos(bodyTilt + leftHip + leftKnee),
          0.36 * Math.cos(bodyTilt + rightHip) +
            0.32 * Math.cos(bodyTilt + rightHip + rightKnee),
        );
        out.y = Math.max(out.y, 0.11 + reach + slide * 0.012);
      }
      out.rx = (-prone * Math.PI) / 2;
      out.z += slide * 0.08;
      out.y += breath * 0.003 + Math.cos(phase * 2) * amount * 0.006;
      out.ry = stride * 0.04 + slide * 0.12;
      break;
    case 'spine':
      out.y -= slide * 0.025;
      out.rx =
        slide * 0.23 -
        dive * 1.25 -
        sprint * 0.2 +
        prone * 0.17 -
        crouch * 0.22 +
        air * 0.06 +
        hit * Math.cos(hitYaw) * 0.12;
      out.rz = hit * Math.sin(hitYaw) * 0.1 + slide * 0.79;
      break;
    case 'chest':
      out.rx = pose.pitch * 0.2 + breath * 0.006;
      out.ry = -stride * 0.06 - slide * 0.12;
      out.rz = slide * 0.1;
      break;
    case 'neck':
      out.rx = pose.pitch * 0.15 - slide * 0.1 + prone * 0.61;
      out.rz = -slide * 0.28;
      break;
    case 'head':
      out.rx =
        pose.pitch * 0.65 -
        hit * 0.04 -
        slide * 0.25 +
        prone * 0.79 +
        crouch * 0.16;
      out.rz = -slide * 0.34;
      break;
    case 'leftShoulder':
    case 'rightShoulder':
      out.y += breath * 0.003;
      // Arms are solved together against the weapon, below.
      break;
    case 'leftHip':
      out.x -= slide * 0.035;
      out.rx = leftHip;
      out.ry = slide * 0.24;
      break;
    case 'rightHip':
      out.x += slide * 0.02;
      out.rx = rightHip;
      out.ry = -slide * 0.22;
      break;
    case 'leftShin':
      out.rx = leftKnee;
      break;
    case 'rightShin':
      out.rx = rightKnee;
      break;
    case 'leftAnkle':
      out.rx =
        air * 0.15 - sprint * 0.07 * (1 - slide) + slide * 1.4 + crouch * 0.81;
      out.ry = -slide * 0.12;
      break;
    case 'rightAnkle':
      out.rx =
        air * 0.15 - sprint * 0.07 * (1 - slide) - slide * 1.3 + crouch * 0.81;
      break;
    case 'weapon':
      out.x += aim * 0.01 + carry * 0.025 + slide * (0.05 - aim * 0.13);
      out.y +=
        aim * (0.18 - slide * 0.12) - reload * 0.12 - slide * 0.035 * (1 - aim);
      out.z -= aim * 0.015;
      out.z += prone * 0.24;
      out.z += (pose.fireBlend ?? 0) * 0.025;
      out.rx =
        pose.pitch * 0.8 -
        dive * 1.25 +
        sprint * 0.2 +
        prone * 1.4 +
        crouch * 0.22 +
        carry * (0.9 + Math.sin(phase * 2) * 0.018) +
        (pose.fireBlend ?? 0) * 0.07;
      out.ry = carry * 0.22;
      out.rz = carry * -0.25 - reload * 0.5;
      break;
  }
  return out;
}

export function createJointPoses(): JointPose[] {
  return rigJoints.map(() => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 }));
}

export function poseRigJoints(pose: CharacterPose, out: JointPose[]): void {
  const slide = characterSlide(pose);
  for (let i = 0; i < rigJoints.length; i++) jointPose(i, pose, out[i]!, slide);
  const reload =
    (pose.reloadBlend ?? 0) * Math.sin(Math.PI * (pose.reloadProgress ?? 0));
  const carry =
    (pose.carryBlend ?? pose.sprintBlend ?? 0) *
    (1 - (pose.aimBlend ?? 0)) ** 3 *
    (1 - reload);
  const brace = slideBrace(pose, slide);
  solveWeaponArms(out, {
    reload,
    carry: carry * (1 - slide),
    phase: pose.gaitPhase ?? 0,
    slide,
    brace,
    pitch: pose.pitch + (pose.fireBlend ?? 0) * 0.07,
  });
}

export function rotatePoint(
  t: Pick<RigTransform, 'qx' | 'qy' | 'qz' | 'qw'>,
  x: number,
  y: number,
  z: number,
  out: Vector3Like,
): Vector3Like {
  const tx = 2 * (t.qy * z - t.qz * y),
    ty = 2 * (t.qz * x - t.qx * z),
    tz = 2 * (t.qx * y - t.qy * x);
  out.x = x + t.qw * tx + t.qy * tz - t.qz * ty;
  out.y = y + t.qw * ty + t.qz * tx - t.qx * tz;
  out.z = z + t.qw * tz + t.qx * ty - t.qy * tx;
  return out;
}

/** Evaluate the same hierarchy as Three.Bone without importing Three into the server. */
export function evaluateRig(
  pose: CharacterPose,
  out: RigTransform[],
  locals = createJointPoses(),
): void {
  poseRigJoints(pose, locals);
  for (let i = 0; i < rigJoints.length; i++) {
    const local = locals[i]!;
    const cx = Math.cos(local.rx / 2),
      sx = Math.sin(local.rx / 2),
      cy = Math.cos(local.ry / 2),
      sy = Math.sin(local.ry / 2),
      cz = Math.cos(local.rz / 2),
      sz = Math.sin(local.rz / 2);
    const qx = sx * cy * cz + cx * sy * sz,
      qy = cx * sy * cz - sx * cy * sz,
      qz = cx * cy * sz + sx * sy * cz,
      qw = cx * cy * cz - sx * sy * sz;
    const result = out[i]!,
      parent = out[rigJoints[i]!.parent];
    if (!parent) {
      Object.assign(result, {
        x: local.x,
        y: local.y,
        z: local.z,
        qx,
        qy,
        qz,
        qw,
      });
      continue;
    }
    rotatePoint(parent, local.x, local.y, local.z, result);
    result.x += parent.x;
    result.y += parent.y;
    result.z += parent.z;
    result.qx =
      parent.qw * qx + parent.qx * qw + parent.qy * qz - parent.qz * qy;
    result.qy =
      parent.qw * qy - parent.qx * qz + parent.qy * qw + parent.qz * qx;
    result.qz =
      parent.qw * qz + parent.qx * qy - parent.qy * qx + parent.qz * qw;
    result.qw =
      parent.qw * qw - parent.qx * qx - parent.qy * qy - parent.qz * qz;
  }
}

export interface CharacterPart {
  name: string;
  joint: number;
  position: Point;
  size: Point;
  region: HitRegion | null;
  color:
    | 'uniform'
    | 'vest'
    | 'skin'
    | 'glove'
    | 'boot'
    | 'metal'
    | 'visor'
    | 'patch';
}
const body = (
  name: string,
  joint: number,
  position: Point,
  size: Point,
  region: HitRegion | null,
  color: CharacterPart['color'],
): CharacterPart => ({ name, joint, position, size, region, color });
/** Visible convex parts are also the region-tagged collision hulls; equipment is cosmetic. */
export const characterParts: readonly CharacterPart[] = [
  body('head', 4, [0, 0, 0], [0.265, 0.29, 0.255], 'head', 'skin'),
  body('neck', 3, [0, -0.025, 0], [0.15, 0.13, 0.15], 'upperTorso', 'skin'),
  body('chest', 2, [0, 0, 0], [0.54, 0.36, 0.34], 'upperTorso', 'uniform'),
  body(
    'abdomen',
    1,
    [0, -0.035, 0],
    [0.42, 0.27, 0.3],
    'lowerTorso',
    'uniform',
  ),
  body('hips', 0, [0, -0.015, 0], [0.43, 0.19, 0.31], 'lowerTorso', 'uniform'),
  ...([-1, 1] as const).flatMap((side): CharacterPart[] => {
    const left = side === -1,
      arm = left ? 6 : 10,
      forearm = left ? 7 : 11,
      hand = left ? 8 : 12;
    const thigh = left ? 14 : 18,
      shin = left ? 15 : 19,
      foot = left ? 16 : 20;
    const label = left ? 'left' : 'right';
    return [
      body(
        `${label}-upper-arm`,
        arm,
        [0, -0.14, 0],
        [0.2, 0.28, 0.21],
        left ? 'leftArm' : 'rightArm',
        'uniform',
      ),
      body(
        `${label}-forearm`,
        forearm,
        [0, -0.13, 0],
        [0.16, 0.26, 0.18],
        left ? 'leftArm' : 'rightArm',
        'uniform',
      ),
      body(
        `${label}-hand`,
        hand,
        [0, -0.055, 0],
        [0.125, 0.14, 0.14],
        left ? 'leftHand' : 'rightHand',
        'glove',
      ),
      body(
        `${label}-thigh`,
        thigh,
        [0, -0.18, 0],
        [0.23, 0.36, 0.25],
        left ? 'leftLeg' : 'rightLeg',
        'uniform',
      ),
      body(
        `${label}-calf`,
        shin,
        [0, -0.16, 0],
        [0.19, 0.32, 0.2],
        left ? 'leftLeg' : 'rightLeg',
        'uniform',
      ),
      body(
        `${label}-boot`,
        foot,
        [0, 0, -0.065],
        [0.195, 0.16, 0.34],
        left ? 'leftFoot' : 'rightFoot',
        'boot',
      ),
      body(
        `${label}-knee-pad`,
        shin,
        [0, 0, -0.135],
        [0.23, 0.16, 0.085],
        null,
        'vest',
      ),
      body(
        `${label}-shoulder-pad`,
        arm,
        [side * 0.02, -0.055, 0],
        [0.22, 0.13, 0.23],
        null,
        'vest',
      ),
      body(
        `${label}-cuff`,
        forearm,
        [0, -0.23, 0],
        [0.17, 0.07, 0.19],
        null,
        'glove',
      ),
    ];
  }),
  body('helmet', 4, [0, 0.11, 0.015], [0.33, 0.18, 0.32], 'head', 'vest'),
  body(
    'helmet-rail',
    4,
    [0, 0.055, 0.015],
    [0.34, 0.035, 0.33],
    'head',
    'metal',
  ),
  body('goggles', 4, [0, 0.025, -0.14], [0.265, 0.075, 0.035], 'head', 'visor'),
  body(
    'face-wrap',
    4,
    [0, -0.072, -0.095],
    [0.255, 0.1, 0.15],
    'head',
    'glove',
  ),
  body(
    'plate-carrier',
    2,
    [0, -0.015, -0.16],
    [0.49, 0.32, 0.13],
    'upperTorso',
    'vest',
  ),
  body('belt', 0, [0, 0.035, 0], [0.45, 0.07, 0.34], null, 'glove'),
  ...([-0.15, 0, 0.15] as const).map((x) =>
    body(
      `magazine-pouch-${x}`,
      2,
      [x, -0.075, -0.255],
      [0.115, 0.185, 0.09],
      null,
      'vest',
    ),
  ),
  body('backpack', 2, [0, -0.015, 0.255], [0.37, 0.4, 0.21], null, 'vest'),
  body('radio', 2, [0.29, 0.04, 0.14], [0.065, 0.16, 0.07], null, 'metal'),
  body(
    'unit-patch',
    6,
    [-0.105, -0.08, 0],
    [0.025, 0.075, 0.08],
    null,
    'patch',
  ),
  body(
    'weapon-receiver',
    21,
    [0, 0.04, -0.1],
    [0.085, 0.11, 0.38],
    null,
    'metal',
  ),
  body(
    'weapon-barrel',
    21,
    [0, 0.055, -0.46],
    [0.035, 0.035, 0.38],
    null,
    'metal',
  ),
  body('weapon-stock', 21, [0, 0.02, 0.18], [0.075, 0.1, 0.2], null, 'glove'),
  body(
    'weapon-magazine',
    21,
    [0, -0.07, -0.09],
    [0.065, 0.15, 0.1],
    null,
    'glove',
  ),
];
export const characterHitboxes = characterParts.filter(
  (part) => part.region !== null,
);

export function partTransform(
  part: CharacterPart,
  bones: readonly RigTransform[],
  out: RigTransform,
): RigTransform {
  const bone = bones[part.joint]!;
  rotatePoint(bone, ...part.position, out);
  out.x += bone.x;
  out.y += bone.y;
  out.z += bone.z;
  out.qx = bone.qx;
  out.qy = bone.qy;
  out.qz = bone.qz;
  out.qw = bone.qw;
  return out;
}
