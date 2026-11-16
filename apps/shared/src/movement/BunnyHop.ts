import {
  capHorizontalSpeed,
  movementConfig,
  wishDirection,
  type MovementInput,
  type Vector3Like,
} from '../index';

export function bunnyHop(velocity: Vector3Like): void {
  velocity.y = movementConfig.jumpImpulse;
  velocity.x *= movementConfig.hopRetention;
  velocity.z *= movementConfig.hopRetention;
  capHorizontalSpeed(velocity);
}

export function airMove(
  velocity: Vector3Like,
  input: MovementInput,
  dt: number,
  wish: Vector3Like,
): void {
  wishDirection(input, wish);
  const wishSpeed =
    input.sprint && input.forward > 0
      ? movementConfig.sprintSpeed
      : movementConfig.walkSpeed;
  const available = wishSpeed - (velocity.x * wish.x + velocity.z * wish.z);
  if (available > 0) {
    const acceleration = Math.min(
      available,
      movementConfig.airAcceleration * dt,
    );
    velocity.x += wish.x * acceleration;
    velocity.z += wish.z * acceleration;
  }
  const decay = Math.exp(
    -(input.forward || input.right
      ? movementConfig.airDrag
      : movementConfig.airBraking) * dt,
  );
  velocity.x *= decay;
  velocity.z *= decay;
  capHorizontalSpeed(velocity);
}
