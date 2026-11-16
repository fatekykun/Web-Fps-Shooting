import { movementConfig } from '../config/movement';
import type { MovementInput, Vector3Like } from '../types/movement';

/** Only writes horizontal velocity. Vertical motion belongs to the controller. */
export function updateWalking(
  velocity: Vector3Like,
  input: MovementInput,
  dt: number,
): void {
  updateGroundVelocity(velocity, input, dt, movementConfig.walkSpeed);
}

/** Writes a reusable, normalized horizontal wish direction. */
export function wishDirection(input: MovementInput, result: Vector3Like): void {
  const length = Math.hypot(input.forward, input.right);
  const forward = input.forward / Math.max(1, length);
  const right = input.right / Math.max(1, length);
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  result.x = right * cos - forward * sin;
  result.y = 0;
  result.z = -forward * cos - right * sin;
}

export function capHorizontalSpeed(
  velocity: Vector3Like,
  cap: number = movementConfig.maxHorizontalSpeed,
): void {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed > cap) {
    velocity.x *= cap / speed;
    velocity.z *= cap / speed;
  }
}

export function updateGroundVelocity(
  velocity: Vector3Like,
  input: MovementInput,
  dt: number,
  targetSpeed: number,
  acceleration: number = movementConfig.groundAcceleration,
): void {
  const length = Math.hypot(input.forward, input.right);
  if (length === 0) {
    const decay = Math.exp(-movementConfig.groundFriction * dt);
    velocity.x *= decay;
    velocity.z *= decay;
    if (Math.hypot(velocity.x, velocity.z) < 0.01) {
      velocity.x = 0;
      velocity.z = 0;
    }
    return;
  }

  const forward = input.forward / Math.max(1, length);
  const right = input.right / Math.max(1, length);
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const directionX = right * cos - forward * sin;
  const directionZ = -forward * cos - right * sin;
  const speed = Math.hypot(velocity.x, velocity.z);
  // Landing and canceling bleed excess speed gradually, rather than snapping to walk speed.
  if (
    speed > targetSpeed &&
    (velocity.x * directionX + velocity.z * directionZ) / speed > 0.85
  ) {
    targetSpeed +=
      (speed - targetSpeed) * Math.exp(-movementConfig.overspeedFriction * dt);
  }
  const targetX = directionX * targetSpeed;
  const targetZ = directionZ * targetSpeed;
  const deltaX = targetX - velocity.x;
  const deltaZ = targetZ - velocity.z;
  const deltaLength = Math.hypot(deltaX, deltaZ);
  const amount = Math.min(1, (acceleration * dt) / deltaLength);
  if (deltaLength > 0) {
    velocity.x += deltaX * amount;
    velocity.z += deltaZ * amount;
  }
}
