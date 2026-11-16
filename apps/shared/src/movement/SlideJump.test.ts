import { expect, it } from 'vitest';
import { movementConfig } from '../config/movement';
import { redirectSlideMomentum } from './SlideJump';

it.each([0, Math.PI, Math.PI / 2, -Math.PI / 2])(
  'projects horizontal facing at yaw %s without touching vertical velocity',
  (yaw) => {
    const velocity = { x: 0, y: -3, z: -8 };
    expect(redirectSlideMomentum(velocity, yaw, 8)).toBe(true);
    expect(velocity.x).toBeCloseTo(
      -Math.sin(yaw) * 8 * movementConfig.slideJumpMomentumRetention,
    );
    expect(velocity.z).toBeCloseTo(
      -Math.cos(yaw) * 8 * movementConfig.slideJumpMomentumRetention,
    );
    expect(velocity.y).toBe(-3);
  },
);
it('supports partial angular redirection without cancelling 180-degree momentum', () => {
  const velocity = { x: 0, y: 4, z: -8 };
  redirectSlideMomentum(velocity, Math.PI, 8, {
    ...movementConfig,
    slideJumpRedirectionStrength: 0.5,
  });
  expect(velocity.x).toBeCloseTo(
    -8 * movementConfig.slideJumpMomentumRetention,
  );
  expect(velocity.z).toBeCloseTo(0);
  expect(velocity.y).toBe(4);
});
it('caps retained speed and cannot amplify momentum through tuning', () => {
  const velocity = { x: 0, y: 2, z: -8 };
  redirectSlideMomentum(velocity, Math.PI, 8, {
    ...movementConfig,
    slideJumpMomentumRetention: 2,
    slideJumpMaximumSpeed: 6,
  });
  expect(Math.hypot(velocity.x, velocity.z)).toBeCloseTo(6);
  redirectSlideMomentum(velocity, 0, 6, {
    ...movementConfig,
    slideJumpMomentumRetention: 2,
  });
  expect(Math.hypot(velocity.x, velocity.z)).toBeCloseTo(6);
});
it('does not fabricate a minimum-speed boost from a stopped or blocked slide', () => {
  const velocity = { x: 0, y: 3, z: -1 };
  expect(redirectSlideMomentum(velocity, Math.PI, 1)).toBe(false);
  expect(velocity).toEqual({ x: 0, y: 3, z: -1 });
});
