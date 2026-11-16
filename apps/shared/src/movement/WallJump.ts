import { capHorizontalSpeed, movementConfig, type Vector3Like } from '../index';

export function wallJump(velocity: Vector3Like, normal: Vector3Like): void {
  const outwardSpeed = velocity.x * normal.x + velocity.z * normal.z;
  const impulse = Math.max(0, movementConfig.wallJumpImpulse - outwardSpeed);
  velocity.x += normal.x * impulse;
  velocity.z += normal.z * impulse;
  velocity.y = movementConfig.wallJumpUpImpulse;
  capHorizontalSpeed(velocity);
}
