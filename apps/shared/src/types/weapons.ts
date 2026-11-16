export type WeaponId = 'rifle' | 'smg' | 'shotgun';

export interface WeaponInput {
  fire: boolean;
  aim: boolean;
  firePressed: boolean;
  reloadPressed: boolean;
  switchTo: WeaponId | null;
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
}

export interface AccuracyContext {
  speed: number;
  grounded: boolean;
  verticalSpeed: number;
}
