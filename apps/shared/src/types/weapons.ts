export type GunId = 'rifle' | 'smg' | 'shotgun' | 'sniper';
export type WeaponId = GunId | 'melee';
export type WeaponCategory = WeaponId;
export type RecoilCategory = GunId | 'lmg' | 'pistol';

export interface RecoilProfile {
  /** Camera degrees per shot, before pattern and multipliers. */
  vertical: number;
  horizontal: number;
  maxVertical: number;
  maxHorizontal: number;
  firstShotMultiplier: number;
  sustainedMultiplier: number;
  cameraKick: number;
  /** Camera spring rates in 1/s. */
  cameraAttack: number;
  cameraRecovery: number;
  /** Viewmodel distances in meters and rotations in degrees. */
  weaponKickback: number;
  weaponSway: number;
  weaponPitch: number;
  weaponYaw: number;
  weaponRoll: number;
  springStiffness: number;
  /** Viewmodel damping ratio. One is critical damping. */
  springDamping: number;
  hipMultiplier: number;
  adsMultiplier: number;
  weaponAdsMultiplier: number;
  pattern: readonly (readonly [vertical: number, horizontal: number])[];
  randomness: number;
  resetDelay: number;
}
export type HitRegion =
  | 'head'
  | 'upperTorso'
  | 'lowerTorso'
  | 'leftArm'
  | 'rightArm'
  | 'leftHand'
  | 'rightHand'
  | 'leftLeg'
  | 'rightLeg'
  | 'leftFoot'
  | 'rightFoot';

export interface DamageRangePoint {
  /** One world unit is one meter. Distances must be ascending, starting at zero. */
  distance: number;
  multiplier: number;
}

export interface WeaponInput {
  fire: boolean;
  aim: boolean;
  firePressed: boolean;
  aimPressed?: boolean;
  reloadPressed: boolean;
  switchTo: WeaponId | null;
  autoReload?: boolean;
}

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  category: WeaponCategory;
  automatic: boolean;
  /** Rounds per trigger press for a burst weapon. Each round uses fireInterval. */
  burstSize?: number;
  magazine: number;
  reserve: number;
  fireInterval: number;
  /** Seconds per reload, or per shell when reloadPerShell is enabled. */
  reloadTime: number;
  reloadPerShell?: boolean;
  adsTime: number;
  adsFov: number;
  hipSpread: number;
  adsSpread: number;
  movementSpread: number;
  jumpSpread: number;
  fallSpread: number;
  bloomPerShot: number;
  maxBloom: number;
  bloomRecovery: number;
  recoil: Readonly<RecoilProfile>;
  pellets: number;
  damage: number;
  bodyMultipliers: Readonly<Record<HitRegion, number>>;
  /** Empty explicitly means no falloff; the last multiplier persists to maximum range. */
  damageFalloff: readonly Readonly<DamageRangePoint>[];
  /** Maximum hitscan travel in meters, separate from effective damage range. */
  range: number;
  scopeMagnification?: number;
  scopedMovementScale?: number;
  boltCycleTime?: number;
}

export interface AccuracyContext {
  speed: number;
  grounded: boolean;
  verticalSpeed: number;
}
