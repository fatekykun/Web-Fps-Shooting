import type { WeaponId } from '@breakpoint/shared';
import { sniperEyePosition } from './SniperScope';

export type WeaponPart = readonly [
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: number,
  roll?: number,
];
type Point = readonly [number, number, number];
export interface WeaponSight {
  readonly kind: 'red-dot' | 'notch' | 'bead' | 'scope';
  readonly ads: { readonly position: Point; readonly rotation: Point };
  /** Aiming tip, bead or optic-window axis and rear sight line in weapon-local space. */
  readonly front: Point;
  readonly rear?: Point;
  readonly parts: readonly WeaponPart[];
  readonly reticle?: {
    readonly center: Point;
    readonly radius: number;
    readonly halfWindow: readonly [number, number];
  };
}

function rifleSight(): WeaponPart[] {
  return [
    // Rail-mounted reflex housing with an open window and chamfered upper corners.
    [0, 0.084, 0.01, 0.08, 0.028, 0.12, 0x36423e],
    [0, 0.104, 0.035, 0.07, 0.022, 0.055, 0x2f403b],
    [-0.04, 0.141, 0.035, 0.012, 0.07, 0.035, 0x222e2d],
    [0.04, 0.141, 0.035, 0.012, 0.07, 0.035, 0x222e2d],
    [-0.034, 0.181, 0.035, 0.012, 0.028, 0.035, 0x222e2d, -Math.PI / 4],
    [0.034, 0.181, 0.035, 0.012, 0.028, 0.035, 0x222e2d, Math.PI / 4],
    [0, 0.194, 0.035, 0.054, 0.012, 0.035, 0x222e2d],
    [0, 0.105, 0.035, 0.092, 0.012, 0.035, 0x222e2d],
    [0.052, 0.13, 0.035, 0.018, 0.022, 0.03, 0x475952],
  ];
}
function sniperScope(): WeaponPart[] {
  const parts: WeaponPart[] = [[0, 0.125, 0, 0.05, 0.1, 0.065, 0x3c4941]];
  // Existing faceted hollow optic; no generic iron-sight pieces under the tube.
  for (const [radius, z, length, color] of [
    [0.039, -0.055, 0.39, 0x364b4e],
    [0.054, -0.265, 0.08, 0x202f34],
    [0.049, 0.16, 0.064, 0x172a31],
  ]) {
    for (let segment = 0; segment < 12; segment++) {
      const angle = (segment * Math.PI * 2) / 12;
      parts.push([
        Math.cos(angle) * radius!,
        0.19 + Math.sin(angle) * radius!,
        z!,
        0.012,
        2 * radius! * Math.tan(Math.PI / 12),
        length!,
        color!,
        angle,
      ]);
    }
  }
  return parts;
}

/** Geometry and eye alignment share one local coordinate system; FOV/timing stay in shared weaponConfigs. */
export const weaponSights: Readonly<Record<WeaponId, WeaponSight>> = {
  rifle: {
    kind: 'red-dot',
    ads: { position: [0, -0.146, -0.61], rotation: [0, 0, 0] },
    front: [0, 0.146, 0.0175],
    rear: [0, 0.146, 0.0525],
    parts: rifleSight(),
    reticle: {
      center: [0, 0.146, 0.035],
      radius: 0.0025,
      halfWindow: [0.031, 0.032],
    },
  },
  smg: {
    kind: 'notch',
    ads: { position: [0, -0.116, -0.56], rotation: [0, 0, 0] },
    front: [0, 0.116, -0.335],
    rear: [0, 0.116, 0.14],
    parts: [
      [0, 0.0805, 0.14, 0.066, 0.025, 0.045, 0x35463e],
      [-0.019, 0.094, 0.14, 0.018, 0.022, 0.025, 0x35463e],
      [0.019, 0.094, 0.14, 0.018, 0.022, 0.025, 0x35463e],
      // Low, swept V-notch shoulders instead of the rifle's tall closed frame.
      [-0.019, 0.108, 0.14, 0.026, 0.009, 0.03, 0x273b3d, -0.33],
      [0.019, 0.108, 0.14, 0.026, 0.009, 0.03, 0x273b3d, 0.33],
      [0, 0.0625, -0.335, 0.035, 0.04, 0.03, 0x415955],
      [0, 0.099, -0.335, 0.01, 0.034, 0.018, 0xd8b57e],
      [-0.022, 0.095, -0.335, 0.009, 0.035, 0.024, 0x2e4240],
      [0.022, 0.095, -0.335, 0.009, 0.035, 0.024, 0x2e4240],
    ],
  },
  shotgun: {
    kind: 'bead',
    ads: { position: [0, -0.101, -0.62], rotation: [0, 0, 0] },
    front: [0, 0.101, -0.66],
    parts: [
      // Raised barrel rib on three solid supports, with no rear aperture/notch.
      [0, 0.08, -0.39, 0.024, 0.012, 0.6, 0x58685a],
      ...[-0.24, -0.46, -0.65].map((z): WeaponPart => [
        0,
        0.059,
        z,
        0.018,
        0.032,
        0.025,
        0x42554c,
      ]),
      [0, 0.089, -0.66, 0.012, 0.008, 0.015, 0x374c43],
      // Crossed tiny boxes form a faceted round bead in the same instanced draw.
      [0, 0.101, -0.66, 0.018, 0.012, 0.018, 0xe6c991],
      [0, 0.101, -0.66, 0.018, 0.012, 0.018, 0xe6c991, Math.PI / 3],
      [0, 0.101, -0.66, 0.018, 0.012, 0.018, 0xe6c991, -Math.PI / 3],
    ],
  },
  sniper: {
    kind: 'scope',
    ads: { position: [0, -0.19, sniperEyePosition(1)], rotation: [0, 0, 0] },
    front: [0, 0.19, -0.265],
    rear: [0, 0.19, 0.16],
    parts: sniperScope(),
  },
};
