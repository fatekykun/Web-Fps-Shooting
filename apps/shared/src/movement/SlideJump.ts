import { movementConfig } from '../config/movement';
import type { Vector3Like } from '../types/movement';

interface SlideJumpTuning {
  slideJumpMomentumRetention: number;
  slideJumpRedirectionStrength: number;
  slideJumpMinimumSpeed: number;
  slideJumpMaximumSpeed: number;
  maxHorizontalSpeed: number;
}

/** Redirect horizontal momentum only. The controller owns the vertical jump impulse. */
export function redirectSlideMomentum(
  velocity: Vector3Like,
  facingYaw: number,
  momentumSpeed: number,
  tuning: Readonly<SlideJumpTuning> = movementConfig,
): boolean {
  const retainedSpeed = Math.min(
    momentumSpeed * Math.max(0, Math.min(1, tuning.slideJumpMomentumRetention)),
    tuning.slideJumpMaximumSpeed,
    tuning.maxHorizontalSpeed,
  );
  if (retainedSpeed < tuning.slideJumpMinimumSpeed || retainedSpeed <= 0)
    return false;
  const strength = Math.max(
    0,
    Math.min(1, tuning.slideJumpRedirectionStrength),
  );
  const currentYaw =
    Math.hypot(velocity.x, velocity.z) > 0.00001
      ? Math.atan2(-velocity.x, -velocity.z)
      : facingYaw;
  // Blend the shortest angular turn, avoiding the zero-vector cancellation of a
  // 180-degree linear blend. Yaw already projects facing onto the horizontal plane.
  const turn = Math.atan2(
    Math.sin(facingYaw - currentYaw),
    Math.cos(facingYaw - currentYaw),
  );
  const launchYaw = currentYaw + turn * strength;
  velocity.x = -Math.sin(launchYaw) * retainedSpeed;
  velocity.z = -Math.cos(launchYaw) * retainedSpeed;
  return true;
}
