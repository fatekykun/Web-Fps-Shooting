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
