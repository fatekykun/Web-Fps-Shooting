import { expect, it } from 'vitest';
import { weaponConfigs, weaponOrder } from '../config/weapons';
import { effectiveRange, weaponStatistics } from './statistics';

it.each(weaponOrder)(
  '%s has independent, complete gameplay profiles and six bounded display ratings',
  (id) => {
    const config = weaponConfigs[id];
    expect(config.id).toBe(id);
    expect(Object.keys(config.bodyMultipliers)).toHaveLength(11);
    expect(
      Object.values(config.bodyMultipliers).every((value) => value > 0),
    ).toBe(true);
    expect(config.damageFalloff[0]).toEqual({ distance: 0, multiplier: 1 });
    for (let i = 1; i < config.damageFalloff.length; i++) {
      expect(config.damageFalloff[i]!.distance).toBeGreaterThan(
        config.damageFalloff[i - 1]!.distance,
      );
      expect(config.damageFalloff[i]!.multiplier).toBeLessThanOrEqual(
        config.damageFalloff[i - 1]!.multiplier,
      );
      expect(config.damageFalloff[i]!.multiplier).toBeGreaterThanOrEqual(0);
    }
    const stats = weaponStatistics(config);
    expect(stats.map((stat) => stat.id)).toEqual([
      'fireRate',
      'damage',
      'range',
      'control',
      'accuracy',
      'ads',
    ]);
    expect(stats.every((stat) => stat.rating >= 0 && stat.rating <= 100)).toBe(
      true,
    );
    expect(stats.find((stat) => stat.id === 'fireRate')!.value).toBeCloseTo(
      60 / config.fireInterval,
    );
    expect(stats.find((stat) => stat.id === 'damage')!.value).toBe(
      config.damage,
    );
    expect(stats.find((stat) => stat.id === 'ads')!.value).toBeCloseTo(
      config.adsTime * 1000,
    );
  },
);

it('derives ratings from individual values, allowing different weapons in the same category', () => {
  const original = weaponConfigs.rifle;
  const custom = {
    ...original,
    name: 'Alternate rifle',
    damage: 90,
    fireInterval: 0.2,
    recoilPitch: 0.1,
    adsSpread: 0.05,
    adsTime: 0.08,
    damageFalloff: [],
  };
  const stats = weaponStatistics(custom);
  expect(custom.category).toBe(original.category);
  expect(
    stats.every(
      (stat, index) =>
        stat.rating !== weaponStatistics(original)[index]!.rating,
    ),
  ).toBe(true);
  expect(effectiveRange(custom)).toBe(original.range);
  expect(original.damage).toBe(25);
});
