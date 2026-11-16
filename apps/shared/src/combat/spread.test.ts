import { describe, expect, it } from 'vitest';
import {
  calculateSpread,
  degreesToRadians,
  shotRandom,
  spreadDirection,
} from './spread';
import { weaponConfigs } from '../config/weapons';

describe('accuracy cone and seeded sampling', () => {
  const still = { speed: 0, grounded: true, verticalSpeed: 0 };
  it('reduces spread with ADS and adds movement, jump, fall and bloom penalties', () => {
    const config = weaponConfigs.rifle;
    const hip = calculateSpread(config, 0, 0, still);
    const ads = calculateSpread(config, 1, 0, still);
    expect(ads).toBeLessThan(hip);
    const moving = calculateSpread(config, 0, 0, { ...still, speed: 8 });
    const jumping = calculateSpread(config, 0, 0, {
      speed: 8,
      grounded: false,
      verticalSpeed: 5,
    });
    const falling = calculateSpread(config, 0, 0, {
      speed: 8,
      grounded: false,
      verticalSpeed: -5,
    });
    expect(moving).toBeGreaterThan(hip);
    expect(jumping).toBeGreaterThan(moving);
    expect(falling).toBeGreaterThan(jumping);
    expect(calculateSpread(config, 0, 2, still)).toBeGreaterThan(hip);
  });

  it('samples normalized directions inside the requested cone around the actual aim', () => {
    const angle = 6 * degreesToRadians;
    const forward = { x: 0, y: 0, z: 0 };
    const direction = { x: 0, y: 0, z: 0 };
    spreadDirection(0.8, 0.4, 0, 0, 0, forward);
    let samplesOnBothSides = 0;
    for (let i = 0; i < 1000; i++) {
      spreadDirection(
        0.8,
        0.4,
        angle,
        shotRandom(i * 2),
        shotRandom(i * 2 + 1),
        direction,
      );
      expect(Math.hypot(direction.x, direction.y, direction.z)).toBeCloseTo(1);
      const dot =
        direction.x * forward.x +
        direction.y * forward.y +
        direction.z * forward.z;
      expect(dot).toBeGreaterThanOrEqual(Math.cos(angle) - 1e-9);
      if (direction.x > forward.x) samplesOnBothSides++;
    }
    expect(samplesOnBothSides).toBeGreaterThan(200);
    expect(samplesOnBothSides).toBeLessThan(800);
    expect(shotRandom(42)).toBe(shotRandom(42));
  });
});
