import { movementConfig } from '../index';

export function wantsSlideCancel(requested: boolean, elapsed: number): boolean {
  return Boolean(requested && elapsed >= movementConfig.slideCancelDelay);
}
