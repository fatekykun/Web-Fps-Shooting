export type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'sniper';
export type WeaponCategory = 'rifle' | 'smg' | 'shotgun' | 'sniper';
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
  magazine: number;
  reserve: number;
  fireInterval: number;
  reloadTime: number;
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
  recoilPitch: number;
  recoilYaw: number;
  recoilRecovery: number;
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
