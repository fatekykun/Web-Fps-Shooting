import { expect, it } from 'vitest';
import { intersectAvatar, standingAnchor } from './avatar';
import {
  characterHitboxes,
  createRigTransforms,
  evaluateRig,
  partTransform,
  rotatePoint,
} from './characterRig';

const base = {
  x: 0,
  y: standingAnchor,
  z: 0,
  yaw: 0,
  pitch: 0,
  halfHeight: 0.55,
};
it('hits the natural head/torso, respects range and ignores cosmetic weapon geometry', () => {
  expect(
    intersectAvatar({ x: 0, y: 1.53, z: 5 }, { x: 0, y: 0, z: -1 }, base, 10)
      ?.head,
  ).toBe(true);
  expect(
    intersectAvatar({ x: 0, y: 1.16, z: 5 }, { x: 0, y: 0, z: -1 }, base, 10)
      ?.region,
  ).toBe('upperTorso');
  expect(
    intersectAvatar({ x: 0, y: 1.53, z: 5 }, { x: 0, y: 0, z: -1 }, base, 3),
  ).toBeNull();
  expect(
    intersectAvatar({ x: 0, y: 0.3, z: 5 }, { x: 0, y: 0, z: -1 }, base, 10),
  ).toBeNull();
  expect(
    intersectAvatar(
      { x: 0.15, y: 1.1, z: -1.5 },
      { x: 0, y: 0, z: 1 },
      base,
      0.3,
    ),
  ).toBeNull();
});

it.each([
  ['idle', 0.55, 0, 0, 0, 0, 0],
  ['walking', 0.55, 0.7, 0, 0, 0, 0],
  ['running', 0.55, 1, 0, 0, 0, 0],
  ['sprinting', 0.55, 1, 1, 0, 0, 0],
  ['jumping', 0.55, 0.3, 0, 1, 0, 0],
  ['sliding', 0.2, 0.1, 0, 0, 1, 0],
  ['backsliding', 0.2, 0.1, 0, 0, 1, 0],
  ['diving', 0.04, 0, 0, 0, 0, 1],
  ['recovering', 0.35, 0.1, 0, 0, 0.4, 0],
] as const)(
  'keeps all eleven articulated hit regions valid during %s',
  (_, halfHeight, gaitAmount, sprintBlend, airBlend, slideBlend, diveBlend) => {
    const pose = {
      ...base,
      x: 3,
      y: standingAnchor + 2,
      z: -4,
      yaw: 1.1,
      pitch: 0.4,
      halfHeight,
      gaitPhase: 1.2,
      animationTime: 3,
      gaitAmount,
      sprintBlend,
      airBlend,
      slideBlend,
      diveBlend,
      reloadBlend: 0.5,
      reloadProgress: 0.3,
    };
    const rig = createRigTransforms();
    evaluateRig(pose, rig);
    const c = Math.cos(pose.yaw),
      s = Math.sin(pose.yaw);
    expect(new Set(characterHitboxes.map((part) => part.region)).size).toBe(11);
    for (const part of characterHitboxes) {
      const t = partTransform(part, rig, {
        x: 0,
        y: 0,
        z: 0,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
      });
      const center = {
        x: pose.x + c * t.x + s * t.z,
        y: pose.y - standingAnchor + t.y,
        z: pose.z - s * t.x + c * t.z,
      };
      const hits = [
        [0, 0, -1],
        [0, 0, 1],
        [-1, 0, 0],
        [1, 0, 0],
        [0, -1, 0],
        [0, 1, 0],
      ].some(([x, y, z]) => {
        const local = rotatePoint(t, x!, y!, z!, { x: 0, y: 0, z: 0 });
        const direction = {
          x: c * local.x + s * local.z,
          y: local.y,
          z: -s * local.x + c * local.z,
        };
        const origin = {
          x: center.x - direction.x * 0.5,
          y: center.y - direction.y * 0.5,
          z: center.z - direction.z * 0.5,
        };
        const hit = intersectAvatar(origin, direction, pose, 0.6);
        if (hit?.region !== part.region) return false;
        expect(
          Math.hypot(
            hit.point.x - origin.x,
            hit.point.y - origin.y,
            hit.point.z - origin.z,
          ),
        ).toBeCloseTo(hit.distance);
        return true;
      });
      expect(hits, part.name).toBe(true);
    }
  },
);

it('bends elbows and knees and lowers posture without squashing limb dimensions', () => {
  const standing = createRigTransforms(),
    sliding = createRigTransforms();
  evaluateRig(base, standing);
  evaluateRig({ ...base, halfHeight: 0.2, slideBlend: 1 }, sliding);
  expect(sliding[4]!.y).toBeLessThan(standing[4]!.y - 0.4);
  for (const [a, b, length] of [
    [6, 7, 0.28],
    [7, 8, 0.26],
    [14, 15, 0.36],
    [15, 16, 0.32],
  ]) {
    const p = sliding[a!]!,
      q = sliding[b!]!;
    expect(Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)).toBeCloseTo(length!);
  }
});

it('slides feet-first with a low seated pelvis, one extended leg, a tucked leg and a level head', () => {
  const rig = createRigTransforms();
  evaluateRig({ ...base, halfHeight: 0.2, slideBlend: 1 }, rig);
  expect(rig[0]!.y).toBeLessThan(0.3);
  expect(rig[20]!.z).toBeLessThan(rig[0]!.z - 0.5);
  expect(Math.abs(rig[16]!.z - rig[0]!.z)).toBeLessThan(0.25);
  const facing = rotatePoint(rig[4]!, 0, 0, -1, { x: 0, y: 0, z: 0 });
  expect(Math.abs(facing.y)).toBeLessThan(0.05);
  expect(rig[4]!.y).toBeLessThan(0.95);
  for (const slideBlend of [0.1, 0.25, 0.5, 0.75, 1]) {
    evaluateRig({ ...base, halfHeight: 0.2, slideBlend }, rig);
    for (const part of characterHitboxes.filter((part) =>
      part.region?.includes('Foot'),
    )) {
      const transform = partTransform(part, rig, {
        x: 0,
        y: 0,
        z: 0,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
      });
      for (const x of [-0.5, 0.5])
        for (const y of [-0.5, 0.5])
          for (const z of [-0.5, 0.5]) {
            const corner = rotatePoint(
              transform,
              x * part.size[0],
              y * part.size[1],
              z * part.size[2],
              { x: 0, y: 0, z: 0 },
            );
            expect(
              transform.y + corner.y,
              `sole clearance at blend ${slideBlend}`,
            ).toBeGreaterThanOrEqual(-0.015);
          }
    }
  }
});
