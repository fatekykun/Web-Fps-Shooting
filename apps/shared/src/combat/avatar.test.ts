import { expect, it } from 'vitest';
import { intersectAvatar, standingAnchor, avatarScale } from './avatar';

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
