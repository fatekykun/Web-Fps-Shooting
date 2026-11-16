import { describe, expect, it } from 'vitest';
import { movementConfig } from '../config/movement';
import { updateWalking } from './walking';

describe('walking velocity', () => {
  function walk(forward: number, right: number, yaw = 0) {
    const velocity = { x: 0, y: -3, z: 0 };
    for (let i = 0; i < 60; i++)
      updateWalking(velocity, { forward, right, yaw }, 1 / 60);
    return velocity;
  }

  it('accelerates to 5 m/s without changing vertical velocity', () => {
    const velocity = walk(1, 0);
    expect(velocity.z).toBeCloseTo(-movementConfig.walkSpeed);
    expect(velocity.x).toBe(0);
    expect(velocity.y).toBe(-3);
  });

  it('normalizes diagonal input and rotates it with camera yaw', () => {
    const diagonal = walk(1, 1);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(5);
    const rotated = walk(1, 0, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(-5);
    expect(rotated.z).toBeCloseTo(0);
  });

  it('brakes promptly on release and reverses without exceeding the cap', () => {
    const velocity = walk(1, 0);
    for (let i = 0; i < 30; i++)
      updateWalking(velocity, { forward: 0, right: 0, yaw: 0 }, 1 / 60);
    expect(Math.hypot(velocity.x, velocity.z)).toBeLessThan(0.02);
    for (let i = 0; i < 30; i++) {
      updateWalking(velocity, { forward: -1, right: 1, yaw: 0 }, 1 / 60);
      expect(Math.hypot(velocity.x, velocity.z)).toBeLessThanOrEqual(5.00001);
    }
    expect(velocity.z).toBeGreaterThan(0);
  });
});
