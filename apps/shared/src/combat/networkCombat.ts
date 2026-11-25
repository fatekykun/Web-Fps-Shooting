import type { Vector3Like } from '../types/movement';
import type { WeaponId } from '../types/weapons';
import type { GameMode } from '../config/match';

export const playerCombatConfig = Object.freeze({
  health: 100,
  respawnSeconds: 3,
  heldInputTicks: 6,
  killFeedSeconds: 6,
});
const defaultProtection = { seconds: 1.5, fallbackSeconds: 2, damageScale: 0 };
export const spawnProtectionByMode: Readonly<
  Record<GameMode, Readonly<typeof defaultProtection>>
> = {
  ffa: { ...defaultProtection },
  tdm: { ...defaultProtection },
};
export interface AmmoState {
  magazine: number;
  reserve: number;
}
export interface OwnerCombat {
  life: number;
  health: number;
  alive: boolean;
  respawnIn: number;
  protected: boolean;
  selected: WeaponId;
  nextWeapon?: WeaponId;
  ammo: Record<WeaponId, AmmoState>;
  reloading: boolean;
  equipping: boolean;
  reloadProgress: number;
  cycling: boolean;
  cycleProgress: number;
  ads: number;
  spread: number;
  shots: number;
  hitSequence: number;
  lastDamage: number;
  critical: boolean;
  damageSequence: number;
}
export interface ShotTrace {
  end: Vector3Like;
  normal: Vector3Like | null;
}
export interface ServerShot {
  id: number;
  shooter: string;
  weapon: WeaponId;
  origin: Vector3Like;
  traces: ShotTrace[];
}
export interface KillEvent {
  id: number;
  killer: string;
  victim: string;
  weapon: WeaponId;
  headshot: boolean;
  killerId?: string;
  victimId?: string;
  /** Authoritative location of the defeated character's feet. */
  position?: Vector3Like;
  effect?: 'soul-requiem';
}
