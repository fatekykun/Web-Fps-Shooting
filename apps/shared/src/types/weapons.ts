export type WeaponId = 'rifle' | 'smg' | 'shotgun' | 'sniper';
export type HitRegion = 'head' | 'upperTorso' | 'lowerTorso' | 'arms' | 'legs';

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
  headMultiplier: number;
  range: number;
  scopeMagnification?: number;
  scopedMovementScale?: number;
  boltCycleTime?: number;
  regionDamage?: Readonly<Record<HitRegion, number>>;
}

export interface AccuracyContext {
  speed: number;
  grounded: boolean;
  verticalSpeed: number;
}
