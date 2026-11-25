import {
  movementConfig,
  capHorizontalSpeed,
  wishDirection,
  type MovementInput,
  type Vector3Like,
} from '../index';

export function startSlide(velocity: Vector3Like, minimumSpeed?: number): void {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed > 0) {
    const scale =
      minimumSpeed === undefined
        ? movementConfig.slideSpeedMultiplier
        : Math.max(speed, minimumSpeed) / speed;
    velocity.x *= scale;
    velocity.z *= scale;
  }
  capHorizontalSpeed(velocity);
}

export function slideMomentum(speed: number, backwards: boolean): number {
  const forwardStart = Math.min(
    movementConfig.maxHorizontalSpeed,
    movementConfig.sprintSpeed * movementConfig.slideSpeedMultiplier,
  );
  const start = backwards ? movementConfig.backslideSpeed : forwardStart;
  const exit = movementConfig.slideExitSpeed * (start / forwardStart);
  return Math.max(
    0,
    Math.min(1, (speed - exit) / Math.max(0.001, start - exit)),
  );
}

export function slide(
  velocity: Vector3Like,
  input: MovementInput,
  dt: number,
  wish: Vector3Like,
  elapsed: number,
): void {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 0.001) return;
  wishDirection(input, wish);
  const nx = velocity.x / speed;
  const nz = velocity.z / speed;
  const along = wish.x * nx + wish.z * nz;
  velocity.x += (wish.x - along * nx) * movementConfig.slideSteering * dt;
  velocity.z += (wish.z - along * nz) * movementConfig.slideSteering * dt;
  // Steering can redirect but never add speed to a slide.
  capHorizontalSpeed(velocity, speed);
  const progress = Math.min(
    1,
    (elapsed + 0.5 * dt) / movementConfig.slideDuration,
  );
  const deceleration =
    movementConfig.slideFriction + movementConfig.slideMomentumCurve * progress;
  const decay = Math.exp(-deceleration * dt);
  velocity.x *= decay;
  velocity.z *= decay;
}
