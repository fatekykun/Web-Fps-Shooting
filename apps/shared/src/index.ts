export { movementConfig } from './config/movement';
export { updateWalking } from './physics/walking';
export {
  updateGroundVelocity,
  wishDirection,
  capHorizontalSpeed,
} from './physics/walking';
export type {
  MovementInput,
  MovementState,
  Vector3Like,
} from './types/movement';
export { combatConfig, weaponConfigs, weaponOrder } from './config/weapons';
export {
  calculateSpread,
  spreadDirection,
  shotRandom,
  degreesToRadians,
} from './combat/spread';
export type {
  WeaponId,
  WeaponInput,
  WeaponConfig,
  AccuracyContext,
} from './types/weapons';
