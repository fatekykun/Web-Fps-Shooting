import { movementConfig, type Vector3Like } from '../index';

/** A deliberate retreat impulse, preserving a bounded amount of lateral momentum. */
export function startBackslide(velocity: Vector3Like, yaw: number): void {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  const lateral = Math.max(
    -2.5,
    Math.min(2.5, velocity.x * cos - velocity.z * sin),
  );
  const backwards = Math.sqrt(
    movementConfig.backslideSpeed ** 2 - lateral ** 2,
  );
  velocity.x = backwards * sin + lateral * cos;
  velocity.z = backwards * cos - lateral * sin;
}
