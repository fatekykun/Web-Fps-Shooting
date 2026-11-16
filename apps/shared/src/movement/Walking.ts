import { updateWalking, type MovementInput, type Vector3Like } from '../index';

export function walk(
  velocity: Vector3Like,
  input: MovementInput,
  dt: number,
): void {
  updateWalking(velocity, input, dt);
}
