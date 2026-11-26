import type { JointPose } from './characterRig';

type Vec = { x: number; y: number; z: number };
type Quat = Vec & { w: number };
export const strideRadiansPerMeter = Math.PI / 1.8;

/** The free support arm uses the same distance-driven cycle in both views. */
export function sprintArmPose(phase: number, motion = 1) {
  const swing = Math.sin(phase) * motion;
  return {
    upperPitch: 0.15 + swing * 0.8,
    upperRoll: -0.12,
    elbowPitch: 0.45 + Math.max(0, -swing) * 0.3,
    wristPitch: 0.1,
  };
}
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const length = (v: Vec) => Math.hypot(v.x, v.y, v.z);
const normalize = (v: Vec): Vec => {
  const n = length(v) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};
function multiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
const inverse = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
function rotation(p: Pick<JointPose, 'rx' | 'ry' | 'rz'>): Quat {
  const cx = Math.cos(p.rx / 2),
    sx = Math.sin(p.rx / 2),
    cy = Math.cos(p.ry / 2),
    sy = Math.sin(p.ry / 2),
    cz = Math.cos(p.rz / 2),
    sz = Math.sin(p.rz / 2);
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}
function rotate(q: Quat, v: Vec): Vec {
  const r = multiply(multiply(q, { ...v, w: 0 }), inverse(q));
  return { x: r.x, y: r.y, z: r.z };
}
function setRotation(out: JointPose, q: Quat): void {
  const m13 = clamp(2 * (q.x * q.z + q.y * q.w), -1, 1);
  out.ry = Math.asin(m13);
  if (Math.abs(m13) < 0.9999999) {
    out.rx = Math.atan2(
      2 * (q.x * q.w - q.y * q.z),
      1 - 2 * (q.x * q.x + q.y * q.y),
    );
    out.rz = Math.atan2(
      2 * (q.z * q.w - q.x * q.y),
      1 - 2 * (q.y * q.y + q.z * q.z),
    );
  } else {
    out.rx = Math.atan2(
      2 * (q.y * q.z + q.x * q.w),
      1 - 2 * (q.x * q.x + q.z * q.z),
    );
    out.rz = 0;
  }
}

function blendRotation(a: Quat, b: Quat, weight: number): Quat {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  if (dot < 0) {
    b.x *= -1;
    b.y *= -1;
    b.z *= -1;
    b.w *= -1;
    dot = -dot;
  }
  const angle = Math.acos(clamp(dot, -1, 1)),
    sine = Math.sin(angle);
  const from = sine < 1e-6 ? 1 - weight : Math.sin((1 - weight) * angle) / sine;
  const to = sine < 1e-6 ? weight : Math.sin(weight * angle) / sine;
  const q = {
    x: a.x * from + b.x * to,
    y: a.y * from + b.y * to,
    z: a.z * from + b.z * to,
    w: a.w * from + b.w * to,
  };
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  q.x /= n;
  q.y /= n;
  q.z /= n;
  q.w /= n;
  return q;
}
function blendLocalRotation(
  joint: JointPose,
  rx: number,
  rz: number,
  weight: number,
): void {
  setRotation(
    joint,
    blendRotation(rotation(joint), rotation({ rx, ry: 0, rz }), weight),
  );
}

/** Shortest rotation from the limb's local -Y axis to its solved direction. */
function limbRotation(v: Vec): Quat {
  const d = normalize(v),
    w = 1 - d.y;
  if (w < 1e-8) return { x: 1, y: 0, z: 0, w: 0 };
  const n = Math.hypot(d.z, d.x, w);
  return { x: -d.z / n, y: 0, z: d.x / n, w: w / n };
}

/** Grip centers in weapon space; the same anchors are used by both hand chains. */
export const remoteWeaponGrips = {
  right: { x: 0, y: -0.045, z: 0.025 },
  left: { x: -0.07, y: 0.015, z: -0.12 },
} as const;

const mix = (from: number, to: number, weight: number) =>
  from + (to - from) * weight;

function slideFrame(joints: JointPose[]) {
  const pelvis = joints[0]!,
    spine = joints[1]!,
    chest = joints[2]!;
  const hips = rotation(pelvis);
  const torso = multiply(hips, rotation(spine));
  const spineOffset = rotate(hips, spine);
  const chestOffset = rotate(torso, chest);
  const position = {
    x: pelvis.x + spineOffset.x + chestOffset.x,
    y: pelvis.y + spineOffset.y + chestOffset.y,
    z: pelvis.z + spineOffset.z + chestOffset.z,
  };
  return { position, toChest: inverse(multiply(torso, rotation(chest))) };
}

interface ArmPose {
  reload: number;
  carry: number;
  phase: number;
  slide: number;
  brace: number;
  pitch: number;
}

/** Solve both arms in chest space. Fixed segment lengths also drive server hitboxes. */
export function solveWeaponArms(
  joints: JointPose[],
  { reload, carry, phase, slide, brace, pitch }: ArmPose,
): void {
  const weapon = joints[21]!;
  const frame = slide > 0 ? slideFrame(joints) : undefined;
  if (frame) {
    // The chest banks into the slide while the muzzle follows the look angle.
    const raisedWeapon = rotation({
      rx: pitch,
      ry: 0,
      rz: weapon.rz - 0.1,
    });
    setRotation(
      weapon,
      blendRotation(
        rotation(weapon),
        multiply(frame.toChest, raisedWeapon),
        slide,
      ),
    );
  }
  const weaponRotation = rotation(weapon);
  const gripRotation = multiply(weaponRotation, {
    x: Math.SQRT1_2,
    y: 0,
    z: 0,
    w: Math.SQRT1_2,
  });
  for (const left of [true, false]) {
    const shoulder = joints[left ? 5 : 9]!,
      upper = joints[left ? 6 : 10]!,
      forearm = joints[left ? 7 : 11]!,
      wrist = joints[left ? 8 : 12]!;
    const grip = remoteWeaponGrips[left ? 'left' : 'right'];
    const target = rotate(weaponRotation, {
      x: grip.x - (left ? reload * 0.06 : 0),
      y: grip.y - (left ? reload * 0.19 : 0),
      z: grip.z + (left ? reload * 0.08 : 0),
    });
    target.x += weapon.x;
    target.y += weapon.y;
    target.z += weapon.z;
    let handRotation = gripRotation;
    if (left && frame && brace > 0) {
      const floor = rotate(frame.toChest, {
        x: -0.43 - frame.position.x,
        y: 0.074 - frame.position.y,
        z: 0.12 - frame.position.z,
      });
      target.x = mix(target.x, floor.x, brace);
      target.y = mix(target.y, floor.y, brace);
      target.z = mix(target.z, floor.z, brace);
      const floorPalm = rotation({
        rx: Math.PI / 2,
        ry: 0,
        rz: -0.5,
      });
      handRotation = blendRotation(
        gripRotation,
        multiply(frame.toChest, floorPalm),
        brace,
      );
    }
    const palm = rotate(handRotation, { x: 0, y: -0.055, z: 0 });
    const delta = {
      x: target.x - palm.x - shoulder.x,
      y: target.y - palm.y - shoulder.y,
      z: target.z - palm.z - shoulder.z,
    };
    const direction = normalize(delta),
      distance = clamp(length(delta), 0.025, 0.5399);
    const along = (0.28 ** 2 - 0.26 ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, 0.28 ** 2 - along ** 2));
    const pole = { x: left ? -1 : 1, y: -0.7, z: 0.3 };
    if (left && frame && brace > 0) {
      const outward = rotate(frame.toChest, { x: -1, y: 0.1, z: 0.45 });
      pole.x = mix(pole.x, outward.x, brace);
      pole.y = mix(pole.y, outward.y, brace);
      pole.z = mix(pole.z, outward.z, brace);
    }
    const dot =
      pole.x * direction.x + pole.y * direction.y + pole.z * direction.z;
    const bend = normalize({
      x: pole.x - direction.x * dot,
      y: pole.y - direction.y * dot,
      z: pole.z - direction.z * dot,
    });
    const elbow = {
      x: direction.x * along + bend.x * height,
      y: direction.y * along + bend.y * height,
      z: direction.z * along + bend.z * height,
    };
    const upperRotation = limbRotation(elbow);
    const foreRotation = limbRotation({
      x: direction.x * distance - elbow.x,
      y: direction.y * distance - elbow.y,
      z: direction.z * distance - elbow.z,
    });
    setRotation(upper, upperRotation);
    setRotation(forearm, multiply(inverse(upperRotation), foreRotation));
    setRotation(wrist, multiply(inverse(foreRotation), handRotation));
    if (left && carry > 0) {
      const free = sprintArmPose(phase);
      blendLocalRotation(upper, free.upperPitch, free.upperRoll, carry);
      blendLocalRotation(forearm, free.elbowPitch, 0, carry);
      blendLocalRotation(wrist, free.wristPitch, 0, carry);
    }
  }
}
