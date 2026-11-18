import { expect, it } from 'vitest';
import { CharacterAnimation } from './characterAnimation';
import { createRigTransforms, evaluateRig } from './characterRig';
import { strideRadiansPerMeter } from './weaponHandling';

it('uses the first-person carry timing and distance cadence without a second sprint blend delay', () => {
  for (const fps of [30, 60, 144]) {
    const a = new CharacterAnimation();
    for (let i = 0; i < fps / 2; i++) {
      a.step(1 / fps, 8, true, 'sprinting');
      a.weapon(1 / fps, false, 0, 0);
    }
    expect(a.values.carryBlend).toBeCloseTo(1 - Math.exp(-6), 10);
    expect(a.values.gaitPhase).toBeCloseTo(
      (4 * strideRadiansPerMeter) % (Math.PI * 2),
      10,
    );
    a.step(1 / fps, 0, true, 'walking');
    const carry = a.values.carryBlend;
    a.weapon(1 / fps, false, 0, 0);
    expect(a.values.carryBlend).toBeCloseTo(carry * Math.exp(-18 / fps), 10);
  }
});

it('smoothly exits sprint carry for aim, fire and reload and decays confirmed shot recoil', () => {
  const a = new CharacterAnimation();
  for (let i = 0; i < 60; i++) {
    a.step(1 / 60, 8, true, 'sprinting');
    a.weapon(1 / 60, false, 0, 0);
  }
  expect(a.values.carryBlend).toBeGreaterThan(0.99);
  a.weapon(1 / 60, false, 0, 0, false);
  expect(a.values.carryBlend).toBeGreaterThan(0.5);
  for (let i = 0; i < 30; i++) a.weapon(1 / 60, false, 0, 1, false);
  expect(a.values.carryBlend).toBeLessThan(0.001);
  a.fire();
  expect(a.values.fireBlend).toBe(1);
  for (let i = 0; i < 30; i++) a.step(1 / 60, 0, true, 'walking');
  expect(a.values.fireBlend).toBeLessThan(0.001);
  a.reset();
  expect(a.values.fireBlend).toBe(0);
});

it('blends idle, walk, run and sprint without snapping and preserves frame-rate-independent damping', () => {
  const results = [30, 60, 144].map((fps) => {
    const animation = new CharacterAnimation();
    for (let i = 0; i < fps / 2; i++)
      animation.step(1 / fps, 8, true, 'sprinting');
    const sprint = animation.values.sprintBlend;
    expect(sprint).toBeGreaterThan(0.99);
    animation.step(1 / fps, 0, true, 'walking');
    expect(animation.values.sprintBlend).toBeGreaterThan(0.5);
    return sprint;
  });
  results.forEach((value) => expect(value).toBeCloseTo(results[0]!, 10));
  const a = createRigTransforms(),
    b = createRigTransforms();
  evaluateRig({ pitch: 0, halfHeight: 0.55, animationTime: 0 }, a);
  evaluateRig({ pitch: 0, halfHeight: 0.55, animationTime: 0.7 }, b);
  expect(b[4]!.y).not.toBe(a[4]!.y);
});

it('blends slide-jump, landing, reload cancellation and directional additive hit reactions', () => {
  const a = new CharacterAnimation();
  for (let i = 0; i < 20; i++) a.step(1 / 60, 10, true, 'sliding');
  expect(a.values.slideBlend).toBeGreaterThan(0.99);
  a.step(1 / 60, 10, false, 'airborne');
  expect(a.values.slideBlend).toBeGreaterThan(0.7);
  expect(a.values.airBlend).toBeGreaterThan(0);
  a.step(1 / 60, 4, true, 'walking');
  expect(a.values.landingBlend).toBe(1);
  a.weapon(0.1, true, 0.5, 0.8);
  expect(a.values.reloadBlend).toBeGreaterThan(0.5);
  const previous = a.values.reloadBlend;
  a.weapon(1 / 60, false, 0, 0.9);
  expect(a.values.reloadBlend).toBeGreaterThan(0);
  expect(a.values.reloadBlend).toBeLessThan(previous);
  expect(a.values.reloadProgress).toBe(0.5);
  a.hit(1.2);
  expect(a.values.hitYaw).toBeCloseTo(1.2);
  for (let i = 0; i < 60; i++) a.step(1 / 60, 0, true, 'walking');
  expect(a.values.hitBlend).toBeLessThan(0.001);
  expect(a.values.landingBlend).toBeLessThan(0.001);
  a.reset();
  expect(Object.values(a.values).every((value) => value === 0)).toBe(true);
});
