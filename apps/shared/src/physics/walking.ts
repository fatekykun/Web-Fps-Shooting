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
  preserveMomentum = false,
): void {
  const speed = Math.hypot(velocity.x, velocity.z);
  const length = Math.hypot(input.forward, input.right);
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const localForward = -velocity.x * sin - velocity.z * cos;
  const localRight = velocity.x * cos - velocity.z * sin;
  const braking =
    speed > movementConfig.walkSpeed + 0.001
      ? movementConfig.sprintBraking
      : Math.abs(localRight) > Math.abs(localForward)
        ? movementConfig.strafingBraking
        : localForward < 0
          ? movementConfig.backwardBraking
          : movementConfig.groundDeceleration;
  if (length === 0) {
    // Finite stopping time, no exponential tail or direction flip at zero.
    if (speed <= braking * dt) {
      velocity.x = 0;
      velocity.z = 0;
    } else {
      const scale = (speed - braking * dt) / speed;
      velocity.x *= scale;
      velocity.z *= scale;
    }
    return;
  }

  const forward = input.forward / Math.max(1, length);
  const right = input.right / Math.max(1, length);
  const directionX = right * cos - forward * sin;
  const directionZ = -forward * cos - right * sin;
  const alignment =
    speed > 0.00001
      ? (velocity.x * directionX + velocity.z * directionZ) / speed
      : 1;
  // Only the explicit posture-recovery state carries excess speed. A queued hop
  // launches before this ground rule, preserving slide-cancel and bunny-hop momentum.
  if (preserveMomentum && speed > targetSpeed && alignment > 0.85) {
    targetSpeed +=
      (speed - targetSpeed) * Math.exp(-movementConfig.overspeedFriction * dt);
  }
  if (!preserveMomentum && targetSpeed <= movementConfig.walkSpeed) {
    if (Math.abs(input.right) > Math.abs(input.forward))
      acceleration = movementConfig.strafingAcceleration;
    else if (input.forward < 0)
      acceleration = movementConfig.backwardAcceleration;
  }
  if (alignment < 0)
    acceleration = movementConfig.directionReversalAcceleration;
  else if (alignment < 0.85)
    acceleration = movementConfig.directionChangeAcceleration;
  else if (!preserveMomentum && speed > targetSpeed) acceleration = braking;
  const targetX = directionX * targetSpeed;
  const targetZ = directionZ * targetSpeed;
  const deltaX = targetX - velocity.x;
  const deltaZ = targetZ - velocity.z;
  const deltaLength = Math.hypot(deltaX, deltaZ);
  if (deltaLength > 0) {
    const amount = Math.min(1, (acceleration * dt) / deltaLength);
    velocity.x += deltaX * amount;
    velocity.z += deltaZ * amount;
  }
}
