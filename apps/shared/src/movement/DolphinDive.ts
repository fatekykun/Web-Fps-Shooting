import { movementConfig, type Vector3Like } from '../index';
import { startSlide } from './Sliding';

export function startDive(velocity: Vector3Like): void {
  startSlide(velocity, movementConfig.diveInitialSpeed);
  velocity.y = movementConfig.diveUpImpulse;
}

export function dive(
  velocity: Vector3Like,
  grounded: boolean,
  dt: number,
): void {
  const decay = Math.exp(-(grounded ? 2.5 : 0.35) * dt);
  velocity.x *= decay;
  velocity.z *= decay;
}
