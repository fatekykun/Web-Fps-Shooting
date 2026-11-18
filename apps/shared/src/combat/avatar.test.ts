import { expect, it } from 'vitest';
import {
  intersectAvatar,
  standingAnchor,
  avatarScale,
  avatarParts,
  avatarPartPose,
} from './avatar';

const pose = {
  x: 0,
  y: standingAnchor,
  z: 0,
  yaw: 0,
  pitch: 0,
  halfHeight: 0.55,
};
const ray = { x: 0, y: 0, z: -1 };
it('uses the visible head and torso parts and ignores the gaps and cosmetic gun', () => {
  expect(intersectAvatar({ x: 0, y: 1.48, z: 5 }, ray, pose, 10)?.head).toBe(
    true,
  );
  expect(intersectAvatar({ x: 0, y: 1, z: 5 }, ray, pose, 10)?.head).toBe(
    false,
  );
  expect(
    intersectAvatar(
      { x: 0.28, y: 1.08, z: -0.8 },
      { x: 0, y: 0, z: 1 },
      pose,
      0.2,
    ),
  ).toBeNull();
  expect(intersectAvatar({ x: 0, y: 0.3, z: 5 }, ray, pose, 10)).toBeNull();
  expect(intersectAvatar({ x: 0, y: 1.48, z: 5 }, ray, pose, 3)).toBeNull();
});

it.each([
  ['standing', 0.55, 0, 0],
  ['walking', 0.55, 0.7, 0],
  ['sprinting', 0.55, 1, 0],
  ['jumping', 0.55, 0.5, 2],
  ['sliding', 0.2, 0.2, 0],
  ['backsliding', 0.2, 0.2, 0],
  ['diving', 0.04, 0.1, 1],
  ['recovering', 0.35, 0.1, 0],
] as const)(
  'keeps all eleven rig regions attached during %s, including yaw and head pitch',
  (_, halfHeight, gaitAmount, lift) => {
    const animated = {
      ...pose,
      x: 3,
      y: standingAnchor + lift,
      z: -4,
      halfHeight,
      yaw: 1.1,
      pitch: 0.4,
      gaitPhase: 1.2,
      gaitAmount,
    };
    const c = Math.cos(animated.yaw),
      s = Math.sin(animated.yaw);
    const body = avatarParts.filter((part) => part.region !== null);
    expect(new Set(body.map((part) => part.region)).size).toBe(11);
    for (const part of body) {
      const local = avatarPartPose(part, animated, {
        x: 0,
        y: 0,
        z: 0,
        rotationX: 0,
      });
      // Approach the part's own front face; a frontal world ray can correctly hit
      // the leg before a foot swinging behind it.
      const cp = Math.cos(local.rotationX),
        sp = Math.sin(local.rotationX),
        scale = avatarScale(halfHeight);
      const length = Math.hypot(cp, sp * scale);
      const direction = {
        x: (-s * cp) / length,
        y: (sp * scale) / length,
        z: (-c * cp) / length,
      };
      const center = {
        x: animated.x + c * local.x + s * local.z,
        y: animated.y - standingAnchor + local.y * avatarScale(halfHeight),
        z: animated.z - s * local.x + c * local.z,
      };
      const origin = {
        x: center.x - direction.x * 5,
        y: center.y - direction.y * 5,
        z: center.z - direction.z * 5,
      };
      const hit = intersectAvatar(origin, direction, animated, 10);
      expect(hit?.region, part.region!).toBe(part.region);
      expect(
        Math.hypot(
          hit!.point.x - origin.x,
          hit!.point.y - origin.y,
          hit!.point.z - origin.z,
        ),
      ).toBeCloseTo(hit!.distance);
    }
  },
);

it('moves an animated hand with its shoulder, rather than classifying it by world height', () => {
  const hand = avatarParts.find((part) => part.region === 'leftHand')!;
  const animated = { ...pose, gaitPhase: Math.PI / 2, gaitAmount: 1 };
  const current = avatarPartPose(hand, animated, {
    x: 0,
    y: 0,
    z: 0,
    rotationX: 0,
  });
  expect(current.z).not.toBe(hand.position[2]);
  expect(
    intersectAvatar(
      { x: current.x, y: current.y, z: -5 },
      { x: 0, y: 0, z: 1 },
      animated,
      10,
    )?.region,
  ).toBe('leftHand');
});
it('moves hitboxes with yaw, head pitch and actual low posture', () => {
  expect(
    intersectAvatar(
      { x: 5, y: 1.48, z: 0 },
      { x: -1, y: 0, z: 0 },
      { ...pose, yaw: Math.PI / 2, pitch: 0.7 },
      10,
    )?.head,
  ).toBe(true);
  const low = { ...pose, halfHeight: 0.04 };
  expect(intersectAvatar({ x: 0, y: 1.48, z: 5 }, ray, low, 10)).toBeNull();
  expect(
    intersectAvatar({ x: 0, y: 1.48 * avatarScale(0.04), z: 5 }, ray, low, 10)
      ?.head,
  ).toBe(true);
});

it.each([
  [0, 1.48, 'head'],
  [0, 1.15, 'upperTorso'],
  [0, 0.8, 'lowerTorso'],
  [-0.36, 1.12, 'leftArm'],
  [0.36, 1.12, 'rightArm'],
  [-0.36, 0.84, 'leftHand'],
  [0.36, 0.84, 'rightHand'],
  [-0.15, 0.43, 'leftLeg'],
  [0.15, 0.43, 'rightLeg'],
  [-0.15, 0.08, 'leftFoot'],
  [0.15, 0.08, 'rightFoot'],
])('classifies the rendered hit region at (%s, %s)', (x, y, region) => {
  expect(
    intersectAvatar({ x: Number(x), y: Number(y), z: 5 }, ray, pose, 10)
      ?.region,
  ).toBe(region);
});
