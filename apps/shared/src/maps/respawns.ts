import type { ArenaSpawn } from './arenas';

export interface RespawnCandidate extends ArenaSpawn {
  zone: string;
  team?: 'blue' | 'orange';
  weight?: number;
}

export interface RespawnLayout {
  /** Half dimensions of the playable interior. */
  bounds: readonly [number, number];
  candidates: readonly RespawnCandidate[];
}

function zone(
  id: string,
  yaw: number,
  points: readonly (readonly [number, number])[],
  team?: RespawnCandidate['team'],
): RespawnCandidate[] {
  return points.map(([x, z]) => ({ x, y: 0.91, z, yaw, zone: id, team }));
}

export const respawnLayouts = {
  depot: {
    bounds: [19.5, 15.5],
    candidates: [
      ...zone(
        'northwest',
        (-3 * Math.PI) / 4,
        [
          [-17, -11],
          [-12, -9],
          [-5, -12],
        ],
        'orange',
      ),
      ...zone(
        'northeast',
        (3 * Math.PI) / 4,
        [
          [7, -12],
          [13, -11],
          [17, -8],
        ],
        'orange',
      ),
      ...zone(
        'southwest',
        0,
        [
          [-17, 8],
          [-12, 11],
          [-6, 8],
        ],
        'blue',
      ),
      ...zone(
        'southeast',
        0,
        [
          [6, 10],
          [12, 12],
          [17, 8],
        ],
        'blue',
      ),
      ...zone('west', -Math.PI / 2, [
        [-17.8, -2],
        [-10, -1],
      ]),
      ...zone('east', Math.PI / 2, [
        [10.4, -2],
        [17.3, 2],
      ]),
    ],
  },
  shipment: {
    bounds: [18, 18],
    candidates: [
      ...zone(
        'northwest',
        Math.PI,
        [
          [-9.5, -14.2],
          [-16.7, -14.9],
        ],
        'blue',
      ),
      ...zone(
        'northeast',
        Math.PI,
        [
          [9.7, -14],
          [16.9, -14.8],
        ],
        'blue',
      ),
      ...zone(
        'southwest',
        0,
        [
          [-9.7, 14],
          [-16.9, 14.8],
        ],
        'orange',
      ),
      ...zone(
        'southeast',
        0,
        [
          [9.5, 14.2],
          [16.7, 14.9],
        ],
        'orange',
      ),
      ...zone('west', -Math.PI / 2, [
        [-17.1, -5.3],
        [-12.3, 1.6],
        [-16.9, 5.4],
      ]),
      ...zone('east', Math.PI / 2, [
        [17.1, 5.3],
        [12.3, -1.6],
        [16.9, -5.4],
      ]),
    ],
  },
  killhouse: {
    bounds: [21, 18],
    candidates: [
      ...zone(
        'northwest',
        (-3 * Math.PI) / 4,
        [
          [-17.9, -13.2],
          [-10.1, -14.1],
        ],
        'blue',
      ),
      ...zone(
        'northeast',
        (3 * Math.PI) / 4,
        [
          [17.9, -13.2],
          [10.1, -14.1],
        ],
        'blue',
      ),
      ...zone(
        'southwest',
        -Math.PI / 4,
        [
          [-17.9, 13.2],
          [-10.1, 14.1],
        ],
        'orange',
      ),
      ...zone(
        'southeast',
        Math.PI / 4,
        [
          [17.9, 13.2],
          [10.1, 14.1],
        ],
        'orange',
      ),
      ...zone('west', -Math.PI / 2, [
        [-18.6, -2.8],
        [-12.5, -1.2],
        [-6.9, 0],
      ]),
      ...zone('east', Math.PI / 2, [
        [18.6, 2.8],
        [15.6, -1.25],
        [6.7, 0.2],
      ]),
    ],
  },
} satisfies Record<string, RespawnLayout>;
