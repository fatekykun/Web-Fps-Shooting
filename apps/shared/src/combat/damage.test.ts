import { expect, it } from 'vitest';
import { weaponConfigs, weaponOrder } from '../config/weapons';
import { avatarParts } from './avatar';
import { calculateDamage, rangeDamageMultiplier } from './damage';
import type { HitRegion } from '../types/weapons';

it.each(weaponOrder)(
  '%s applies each region and its own range curve exactly once, preserving fractions',
  (id) => {
    const config = weaponConfigs[id];
    for (const { region } of avatarParts) {
      if (!region) continue;
      for (const point of config.damageFalloff) {
        expect(calculateDamage(config, region, point.distance)).toBeCloseTo(
          config.damage * config.bodyMultipliers[region] * point.multiplier,
          10,
        );
      }
      for (let i = 1; i < config.damageFalloff.length; i++) {
        const a = config.damageFalloff[i - 1]!,
          b = config.damageFalloff[i]!;
        expect(
          calculateDamage(config, region, (a.distance + b.distance) / 2),
        ).toBeCloseTo(
          (config.damage *
            config.bodyMultipliers[region] *
            (a.multiplier + b.multiplier)) /
            2,
          10,
        );
        expect(
          rangeDamageMultiplier(config.damageFalloff, b.distance - 1e-7),
        ).toBeCloseTo(
          rangeDamageMultiplier(config.damageFalloff, b.distance + 1e-7),
          5,
        );
      }
    }
  },
);

it('produces the ticket example 101.25 and interpolates between sniper breakpoints', () => {
  const config = {
    ...weaponConfigs.sniper,
    damage: 90,
    bodyMultipliers: { ...weaponConfigs.sniper.bodyMultipliers, head: 1.25 },
  };
  expect(calculateDamage(config, 'head', 50)).toBe(101.25);
  expect(rangeDamageMultiplier(config.damageFalloff, 37.5)).toBeCloseTo(0.95);
  expect(rangeDamageMultiplier(config.damageFalloff, 200)).toBe(0.6);
});

it('deals 100 sniper upper-body damage up to 25 meters and smoothly falls to 90 at 50 meters', () => {
  const config = weaponConfigs.sniper;
  expect(config.damage).toBe(90);
  for (const [distance, expected] of [
    [0, 100],
    [25, 100],
    [37.5, 95],
    [50, 90],
    [75, 80],
    [100, 70],
    [125, 60],
  ] as const) {
    expect(calculateDamage(config, 'upperTorso', distance)).toBeCloseTo(
      expected,
      10,
    );
  }
  expect(calculateDamage(config, 'head', 0)).toBeCloseTo(135);
  expect(calculateDamage(config, 'lowerTorso', 0)).toBeCloseTo(81);
  expect(calculateDamage(config, 'leftArm', 0)).toBeCloseTo(63);
  expect(calculateDamage(config, 'rightLeg', 0)).toBeCloseTo(63);
});

it('supports explicit no falloff, asymmetric limb multipliers and rejects invalid distances/regions', () => {
  const config = {
    ...weaponConfigs.rifle,
    damageFalloff: [],
    bodyMultipliers: {
      ...weaponConfigs.rifle.bodyMultipliers,
      leftHand: 0.42,
      rightHand: 0.63,
    },
  };
  expect(calculateDamage(config, 'leftHand', 70)).toBe(10.5);
  expect(calculateDamage(config, 'rightHand', 70)).toBe(15.75);
  expect(calculateDamage(config, 'head', 80)).toBe(45);
  for (const distance of [-1, NaN, Infinity, 80.001])
    expect(calculateDamage(config, 'head', distance)).toBe(0);
  expect(calculateDamage(config, 'forged' as HitRegion, 2)).toBe(0);
});
