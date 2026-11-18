import type { JointPose } from './characterRig';

type Vec = { x: number; y: number; z: number };
type Quat = Vec & { w: number };
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
function rotation(p: JointPose): Quat {
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

/** Solve both arms in chest space. Fixed segment lengths also drive server hitboxes. */
export function solveWeaponArms(joints: JointPose[], reload: number): void {
  const weapon = joints[21]!,
    weaponRotation = rotation(weapon);
  const handRotation = multiply(weaponRotation, {
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
    const palm = rotate(handRotation, { x: 0, y: -0.055, z: 0 });
    const delta = {
      x: weapon.x + target.x - palm.x - shoulder.x,
      y: weapon.y + target.y - palm.y - shoulder.y,
      z: weapon.z + target.z - palm.z - shoulder.z,
    };
    const direction = normalize(delta),
      distance = clamp(length(delta), 0.025, 0.5399);
    const along = (0.28 ** 2 - 0.26 ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, 0.28 ** 2 - along ** 2));
    const pole = { x: left ? -1 : 1, y: -0.7, z: 0.3 };
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
  }
}
