import type { Vector3Like } from '../types/movement';
import type { FootstepSurface } from '../movement/Footsteps';

export interface ArenaBox {
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: number;
  yaw?: number;
  pitch?: number;
  roll?: number;
  kind?: 'container' | 'crate' | 'barrel' | 'stair';
  footstepSurface?: FootstepSurface;
}

export const spawn: Vector3Like = { x: 0, y: 0.91, z: 12 };

/** The Depot's visible solid geometry and static colliders. */
export const arenaBoxes: readonly ArenaBox[] = [
  { position: [0, -0.5, 0], size: [40, 1, 32], color: 0x494b40 },
  { position: [0, 3, -16], size: [41, 6, 1], color: 0x40483f },
  { position: [0, 3, 16], size: [41, 6, 1], color: 0x333a34 },
  { position: [-20, 3, 0], size: [1, 6, 32], color: 0x3e453b },
  { position: [20, 3, 0], size: [1, 6, 32], color: 0x3e453b },
  // Human-scale cover: small crates around waist height; containers remain tall cover.
  {
    position: [-7, 1.15, -4],
    size: [2.6, 2.3, 6],
    color: 0x596348,
    kind: 'container',
  },
  {
    position: [7, 1.15, -7],
    size: [2.6, 2.3, 6],
    color: 0x7d5137,
    kind: 'container',
  },
  {
    position: [-10, 0.55, 7],
    size: [2, 1.1, 2],
    color: 0x626344,
    kind: 'crate',
  },
  {
    position: [6, 0.5, 5],
    size: [2.6, 1, 1.4],
    color: 0x4a5953,
    kind: 'crate',
  },
  {
    position: [0, 0.6, -12],
    size: [2, 1.2, 1.4],
    color: 0x6e6b4e,
    kind: 'crate',
  },
  { position: [13, 0.5, 8], size: [1.4, 1, 2], color: 0x6b6147, kind: 'crate' },
  // Left lane: 1.1 m clearance for slides and collision-safe standing recovery.
  { position: [-14, 1.7, 0], size: [4, 1.2, 7], color: 0x626344 },
  { position: [-16.2, 1.1, 0], size: [0.4, 2.2, 7], color: 0x40483f },
  { position: [-11.8, 1.1, 0], size: [0.4, 2.2, 7], color: 0x40483f },
  // Right lane: opposing walls for two-wall jump practice.
  { position: [12, 2, -1], size: [0.3, 4, 5], color: 0x4a5953 },
  { position: [15, 2, -1], size: [0.3, 4, 5], color: 0x4a5953 },
];
