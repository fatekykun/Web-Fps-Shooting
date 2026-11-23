import type { Vector3Like } from '../types/movement';
import { arenaBoxes, type ArenaBox } from './depot';
import { shipment } from './shipment';
import { killhouse } from './killhouse';
import { respawnLayouts, type RespawnLayout } from './respawns';

export * from './depot';
export type { RespawnCandidate } from './respawns';

export interface ArenaSpawn extends Vector3Like {
  yaw: number;
}

export interface ArenaDefinition {
  name: string;
  venue: string;
  sector: string;
  respawns?: RespawnLayout;
  spawns: Record<'none' | 'blue' | 'orange', readonly ArenaSpawn[]>;
  colliders: readonly ArenaBox[];
}

const depot = {
  name: 'The Depot',
  venue: 'training arena',
  sector: '01',
  colliders: arenaBoxes,
  spawns: {
    none: Array.from({ length: 8 }, (_, slot) => ({
      x: -14 + slot * 4,
      y: 0.91,
      z: 12,
      yaw: 0,
    })),
    blue: [-14, -6, 6, 14].map((x) => ({ x, y: 0.91, z: 12, yaw: 0 })),
    orange: [-14, -6, 6, 14].map((x) => ({
      x,
      y: 0.91,
      z: -13.5,
      yaw: Math.PI,
    })),
  },
} satisfies ArenaDefinition;

export const arenas = {
  depot: { ...depot, respawns: respawnLayouts.depot },
  shipment: { ...shipment, respawns: respawnLayouts.shipment },
  killhouse: { ...killhouse, respawns: respawnLayouts.killhouse },
} satisfies Record<string, ArenaDefinition>;
export type ArenaId = keyof typeof arenas;

export function isArenaId(value: unknown): value is ArenaId {
  return typeof value === 'string' && Object.hasOwn(arenas, value);
}
