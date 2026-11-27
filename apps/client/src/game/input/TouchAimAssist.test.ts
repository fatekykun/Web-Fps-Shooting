import { expect, it, vi } from 'vitest';
import { isTouchAimOpponent, TouchAimAssist } from './TouchAimAssist';

const eye = { x: 0, y: 1.5, z: 0 };
const center = { ...eye, z: -12 };

it('slows hip and ADS touch turns more at the center and leaves wide turns unaffected', () => {
  const wall = vi.fn(() => false);
  const assist = new TouchAimAssist(wall);
  expect(assist.scale(eye, 0, 0, 0, [center])).toBeCloseTo(0.72);
  expect(assist.scale(eye, 0, 0, 1, [center])).toBeCloseTo(0.55);
  const edge = assist.scale(eye, 0, 0, 1, [{ ...center, x: 0.3 }]);
  expect(edge).toBeGreaterThan(0.55);
  expect(edge).toBeLessThan(1);
  expect(assist.scale(eye, 0.4, 0, 1, [center])).toBe(1);
  expect(assist.scale(eye, 0, 0, 1, [{ ...center, z: 12 }])).toBe(1);
  expect(assist.scale(eye, 0, 0, 1, [{ ...center, z: -45 }])).toBe(1);
  expect(wall).toHaveBeenCalledTimes(3);
});

it('rejects obstructed targets and uses the strongest visible slowdown without stacking', () => {
  const assist = new TouchAimAssist((_, __, distance) => distance <= 12);
  expect(assist.scale(eye, 0, 0, 1, [center])).toBe(1);
  const clear = { ...center, x: 0.3, z: -15 };
  const scale = assist.scale(eye, 0, 0, 1, [clear]);
  expect(scale).toBeLessThan(1);
  expect(assist.scale(eye, 0, 0, 1, [center, clear, clear])).toBe(scale);
});

it('gently pulls toward the torso on both axes without snapping or overshooting', () => {
  const assist = new TouchAimAssist(() => false);
  const target = { ...center, x: 0.5, y: 1.25 };
  const tick = 1 / 60;
  const hip = assist.correction(eye, 0, 0, 0, [target], tick)!;
  const ads = assist.correction(eye, 0, 0, 1, [target], tick)!;
  expect(ads.yaw).toBeLessThan(hip.yaw);
  expect(ads.pitch).toBeLessThan(hip.pitch);
  expect(Math.hypot(ads.yaw, ads.pitch)).toBeLessThanOrEqual(
    (6 * Math.PI * tick) / 180 + 1e-9,
  );
  const heading = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 120; i++) {
    const step = assist.correction(
      eye,
      heading.yaw,
      heading.pitch,
      1,
      [target],
      tick,
    );
    if (!step) break;
    heading.yaw += step.yaw;
    heading.pitch += step.pitch;
  }
  expect(heading.yaw).toBeGreaterThan(Math.atan2(-0.5, 12));
  expect(heading.yaw).toBeLessThan(-0.035);
  expect(heading.pitch).toBeGreaterThan(Math.atan2(-0.25, Math.hypot(0.5, 12)));
});

it('only pulls near visible targets and leaves the sight alone at the center', () => {
  const assist = new TouchAimAssist((_, __, distance) => distance <= 12);
  const tick = 1 / 60;
  const blocked = { ...center, x: 0.25, z: -11 };
  expect(assist.correction(eye, 0, 0, 1, [blocked], tick)).toBeNull();
  expect(
    assist.correction(eye, 0, 0, 1, [{ ...center, x: 2 }], tick),
  ).toBeNull();
  expect(
    assist.correction(eye, 0, 0, 1, [{ ...center, x: 0.3, z: -45 }], tick),
  ).toBeNull();
  expect(
    assist.correction(eye, 0, 0, 1, [{ ...center, z: -14 }], tick),
  ).toBeNull();
  expect(
    assist.correction(
      eye,
      0,
      0,
      1,
      [blocked, { ...center, x: -0.4, z: -14 }],
      tick,
    )?.yaw,
  ).toBeGreaterThan(0);
});

it('filters self, teammates, dead players and protected players out of online assistance', () => {
  const owner = { id: 'self', team: 'blue' } as const;
  const foe = {
    id: 'foe',
    team: 'orange',
    alive: true,
    protected: false,
  } as const;
  expect(isTouchAimOpponent(owner, foe)).toBe(true);
  expect(isTouchAimOpponent(owner, { ...foe, id: owner.id })).toBe(false);
  expect(isTouchAimOpponent(owner, { ...foe, team: 'blue' })).toBe(false);
  expect(isTouchAimOpponent(owner, { ...foe, alive: false })).toBe(false);
  expect(isTouchAimOpponent(owner, { ...foe, protected: true })).toBe(false);
  expect(
    isTouchAimOpponent({ ...owner, team: 'none' }, { ...foe, team: 'none' }),
  ).toBe(true);
});
