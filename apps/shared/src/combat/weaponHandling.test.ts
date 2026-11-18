import { expect, it } from 'vitest';
import {
  characterParts,
  createRigTransforms,
  evaluateRig,
  partTransform,
  remoteWeaponGrips,
  rotatePoint,
  type CharacterPose,
} from './characterRig';

const base = { pitch: 0, halfHeight: 0.55 };
function gripError(pose: CharacterPose, left: boolean): number {
  const rig = createRigTransforms();
  evaluateRig(pose, rig);
  const hand = characterParts.find(
    (p) => p.name === (left ? 'left-hand' : 'right-hand'),
  )!;
  const palm = partTransform(hand, rig, {
    x: 0,
    y: 0,
    z: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    qw: 1,
  });
  const grip = remoteWeaponGrips[left ? 'left' : 'right'];
  const weapon = rig[21]!;
  const target = rotatePoint(weapon, grip.x, grip.y, grip.z, {
    x: 0,
    y: 0,
    z: 0,
  });
  return Math.hypot(
    palm.x - weapon.x - target.x,
    palm.y - weapon.y - target.y,
    palm.z - weapon.z - target.z,
  );
}

it.each([
  ['idle', {}],
  ['walk', { gaitPhase: 1.2, gaitAmount: 0.7 }],
  ['aim', { aimBlend: 1 }],
  ['sprint aim', { sprintBlend: 1, carryBlend: 0, aimBlend: 1 }],
  ['slide', { halfHeight: 0.2, slideBlend: 1 }],
  ['dive', { halfHeight: 0.04, diveBlend: 1 }],
  ['jump', { airBlend: 1 }],
  ['fire', { fireBlend: 1 }],
] as const)(
  'keeps both hands on the weapon through %s and the full look range',
  (_, state) => {
    for (const pitch of [-1.5, -0.6, 0, 0.6, 1.5]) {
      const pose = { ...base, ...state, pitch };
      expect(gripError(pose, false), `right hand at ${pitch}`).toBeLessThan(
        0.001,
      );
      expect(gripError(pose, true), `left hand at ${pitch}`).toBeLessThan(
        0.001,
      );
    }
  },
);

it('keeps the firing hand attached while the free support arm swings through a sprint and returns for ADS', () => {
  const points: { x: number; y: number; z: number }[] = [];
  for (const phase of [
    0,
    Math.PI / 2,
    Math.PI,
    (3 * Math.PI) / 2,
    Math.PI * 2,
  ]) {
    for (const pitch of [-1.5, 0, 1.5]) {
      const pose = {
        ...base,
        sprintBlend: 1,
        carryBlend: 1,
        gaitPhase: phase,
        gaitAmount: 1,
        pitch,
      };
      expect(gripError(pose, false)).toBeLessThan(0.001);
      expect(gripError(pose, true)).toBeGreaterThan(0.2);
      const rig = createRigTransforms();
      evaluateRig(pose, rig);
      if (pitch === 0) points.push({ ...rig[8]! });
      for (const [a, b, length] of [
        [6, 7, 0.28],
        [7, 8, 0.26],
      ]) {
        const upper = rig[a!]!,
          fore = rig[b!]!;
        expect(
          Math.hypot(upper.x - fore.x, upper.y - fore.y, upper.z - fore.z),
        ).toBeCloseTo(length!, 8);
      }
    }
  }
  expect(Math.abs(points[1]!.z - points[3]!.z)).toBeGreaterThan(0.5);
  expect(
    Math.hypot(
      points[0]!.x - points[4]!.x,
      points[0]!.y - points[4]!.y,
      points[0]!.z - points[4]!.z,
    ),
  ).toBeLessThan(1e-8);
  for (const carryBlend of [1, 0.75, 0.5, 0.25, 0]) {
    const pose = { ...base, sprintBlend: 1, carryBlend, gaitPhase: 1 };
    expect(gripError(pose, false)).toBeLessThan(0.001);
  }
  expect(
    gripError({ ...base, sprintBlend: 1, carryBlend: 1, aimBlend: 1 }, true),
  ).toBeLessThan(0.001);
  expect(
    gripError({ ...base, sprintBlend: 1, carryBlend: 0 }, true),
  ).toBeLessThan(0.001);
});

it('raises the muzzle for sprint, returns to the look direction in ADS and releases only the support hand to reload', () => {
  const rig = createRigTransforms();
  evaluateRig({ ...base, sprintBlend: 1, carryBlend: 1 }, rig);
  const raised = rotatePoint(rig[21]!, 0, 0, -1, { x: 0, y: 0, z: 0 });
  expect(raised.y).toBeGreaterThan(0.6);
  evaluateRig(
    { ...base, pitch: 0.5, sprintBlend: 1, carryBlend: 1, aimBlend: 1 },
    rig,
  );
  const aiming = rotatePoint(rig[21]!, 0, 0, -1, { x: 0, y: 0, z: 0 });
  expect(aiming.y).toBeCloseTo(Math.sin(0.5), 5);
  const reload = { ...base, reloadBlend: 1, reloadProgress: 0.5 };
  expect(gripError(reload, false)).toBeLessThan(0.001);
  expect(gripError(reload, true)).toBeGreaterThan(0.15);
});
