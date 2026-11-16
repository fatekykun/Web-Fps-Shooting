import {
  movementConfig,
  capHorizontalSpeed,
  wishDirection,
  type MovementInput,
  type Vector3Like,
} from '../index';

export function startSlide(
  velocity: Vector3Like,
  initialSpeed: number = movementConfig.slideInitialSpeed,
): void {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed > 0) {
    const scale = Math.max(speed, initialSpeed) / speed;
    velocity.x *= scale;
    velocity.z *= scale;
  }
  capHorizontalSpeed(velocity);
}

export function slide(
  velocity: Vector3Like,
  input: MovementInput,
  dt: number,
  wish: Vector3Like,
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
  const decay = Math.exp(-movementConfig.slideFriction * dt);
  velocity.x *= decay;
  velocity.z *= decay;
}
