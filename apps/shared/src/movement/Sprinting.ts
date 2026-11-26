import {
  movementConfig,
  updateGroundVelocity,
  type MovementInput,
  type Vector3Like,
} from '../index';

export function wantsSprint(input: MovementInput): boolean {
  return Boolean(input.sprint && input.forward > 0);
}

export function sprint(
  velocity: Vector3Like,
  input: MovementInput,
  dt: number,
  speedScale = 1,
): void {
  updateGroundVelocity(
    velocity,
    input,
    dt,
    movementConfig.sprintSpeed * speedScale,
    movementConfig.sprintAcceleration,
  );
}
