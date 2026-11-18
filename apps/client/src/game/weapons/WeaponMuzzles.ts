import type { WeaponId } from '@breakpoint/shared';

type Point = readonly [number, number, number];
interface MuzzleDefinition {
  barrelLength: number;
  firstPerson: Point;
  remote: Point;
}
/** Model-local barrel exits. The sniper's exit includes its muzzle brake. */
export const weaponMuzzles: Readonly<Record<WeaponId, MuzzleDefinition>> = {
  rifle: {
    barrelLength: 0.35,
    firstPerson: [0, 0.025, -0.53],
    remote: [0, 0.055, -0.65],
  },
  smg: {
    barrelLength: 0.2,
    firstPerson: [0, 0.025, -0.38],
    remote: [0, 0.055, -0.47],
  },
  shotgun: {
    barrelLength: 0.52,
    firstPerson: [0, 0.025, -0.7],
    remote: [0, 0.055, -0.79],
  },
  sniper: {
    barrelLength: 0.83,
    firstPerson: [0, 0.025, -1.06],
    remote: [0, 0.055, -1.1],
  },
};
