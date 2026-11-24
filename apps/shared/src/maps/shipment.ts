import type { ArenaDefinition, ArenaSpawn } from './arenas';
import type { ArenaBox } from './depot';
import {
  cargoCollision,
  containerSize,
  forkliftParts,
  type ShipmentContainer,
} from './shipmentCargo';

const colors = {
  red: 0xa34e3b,
  blue: 0x466b8e,
  green: 0x657450,
  gray: 0x788580,
};

const size = 36;
const wallHeight = 5;
const half = size / 2;

// Origin at the yard center, +X east, +Z south. The center runs around two offset stacks.
const containers: readonly ShipmentContainer[] = [
  { x: -14.3, z: -10.45, level: 0, yaw: 0, color: colors.red },
  {
    x: -14.35,
    z: -1.5,
    level: 0,
    yaw: 0,
    color: colors.blue,
    opening: 'through',
  },
  { x: -14.65, z: 9.3, level: 0, yaw: 0, color: colors.gray },
  { x: -6.4, z: -8.1, level: 0, yaw: 0, color: colors.blue },
  { x: 2.2, z: -11.6, level: 0, yaw: Math.PI / 2, color: colors.gray },
  { x: 4.6, z: -6.65, level: 0, yaw: 0, color: colors.red },
  { x: 14.6, z: -6.9, level: 0, yaw: Math.PI, color: colors.blue },
  { x: -1.5, z: -3.3, level: 0, yaw: Math.PI / 2, color: colors.green },
  { x: -1.5, z: -3.3, level: 1, yaw: Math.PI / 2, color: colors.blue },
  { x: -1.5, z: -3.3, level: 2, yaw: Math.PI / 2, color: colors.red },
  { x: 4.75, z: 3.7, level: 0, yaw: 0, color: colors.blue },
  { x: 4.75, z: 3.7, level: 1, yaw: 0, color: colors.gray },
  { x: -6.7, z: 4.85, level: 0, yaw: 0, color: colors.red },
  { x: -3.7, z: 11.05, level: 0, yaw: Math.PI / 2, color: colors.green },
  {
    x: 14.6,
    z: 9.4,
    level: 0,
    yaw: Math.PI,
    color: colors.green,
    opening: 'front',
  },
];

const floor: ArenaBox = {
  position: [0, -0.5, 0],
  size: [size + 1, 1, size + 1],
  color: 0x525859,
};
const perimeter: ArenaBox[] = [-1, 1].flatMap((side) => [
  {
    position: [0, wallHeight / 2, side * (half + 0.25)],
    size: [size + 1, wallHeight, 0.5],
    color: 0x56605a,
  },
  {
    position: [side * (half + 0.25), wallHeight / 2, 0],
    size: [0.5, wallHeight, size],
    color: 0x56605a,
  },
]);

const props: ArenaBox[] = [
  ...(
    [
      [-11.7, -14.4],
      [-8.5, -2.9],
      [8.7, 5.9],
      [14.98, 11.36],
      [7.15, 12.2],
    ] as const
  ).map(
    ([x, z]) =>
      ({
        position: [x, x === 14.98 ? 0.52 : 0.44, z],
        size: x === 14.98 ? [0.75, 0.88, 0.75] : [1, 0.88, 1],
        color: 0x9b825a,
        kind: 'crate',
      }) satisfies ArenaBox,
  ),
  ...(
    [
      [-12.6, -14.6],
      [-12.6, -13.96],
      [16.25, 0.1],
      [16.25, 0.76],
      [16.9, 0.43],
      [8.9, -9.2],
      [8.9, -8.55],
    ] as const
  ).map(
    ([x, z]) =>
      ({
        position: [x, 0.44, z],
        size: [0.57, 0.88, 0.57],
        color: 0x53717c,
        kind: 'barrel',
      }) satisfies ArenaBox,
  ),
  {
    position: [-13.1, 0.38, 13.6],
    size: [2.1, 0.76, 0.46],
    color: 0x7e8074,
    yaw: 0.3,
  },
  {
    position: [6.55, 0.36, -13.4],
    size: [1.95, 0.72, 0.44],
    color: 0x808073,
    yaw: -0.35,
  },
  {
    position: [14.2, 0.35, 14.15],
    size: [2.1, 0.7, 0.44],
    color: 0x828478,
    yaw: -0.24,
  },
  {
    position: [-7.95, 0.325, 12.75],
    size: [1.1, 0.65, 0.78],
    color: 0x626c5d,
    footstepSurface: 'metal',
  },
];
const pallets: readonly ArenaBox[] = [
  {
    position: [-9.55, 0.17, -11.95],
    size: [1.32, 0.34, 1.07],
    yaw: 0.23,
    color: 0xa4845b,
    footstepSurface: 'wood',
  },
  {
    position: [8.65, 0.255, -1.4],
    size: [1.58, 0.51, 1.2],
    yaw: -0.24,
    color: 0xa4845b,
    footstepSurface: 'wood',
  },
  {
    position: [-14.1, 0.17, 5.4],
    size: [1.35, 0.34, 1.17],
    yaw: -0.05,
    color: 0xa4845b,
    footstepSurface: 'wood',
  },
];
const forklift = forkliftParts([14.25, 0, -13.65], 0.15);
const cargo = containers.map(cargoCollision);
const northSpawns: ArenaSpawn[] = [-7.5, -2.5, 2.5, 7.5].map((x) => ({
  x,
  y: 0.91,
  z: -15.7,
  yaw: Math.PI,
}));
const southSpawns: ArenaSpawn[] = northSpawns.map(({ x, y, z }) => ({
  x: -x,
  y,
  z: -z,
  yaw: 0,
}));

export const shipment = {
  name: 'Shipment',
  venue: 'container yard',
  sector: '02',
  size,
  wallHeight,
  floor,
  perimeter,
  containerSize,
  containers,
  cargo,
  props,
  pallets,
  forklift,
  floodlights: [
    [-18.22, -18.22],
    [18.22, -18.22],
    [-18.22, 18.22],
    [18.22, 18.22],
  ] as const,
  spawns: {
    blue: northSpawns,
    orange: southSpawns,
    none: northSpawns.flatMap((point, index) => [point, southSpawns[index]!]),
  },
  colliders: [
    floor,
    ...perimeter,
    ...cargo.flat(),
    ...props,
    ...pallets,
    ...forklift.structure,
  ],
} satisfies ArenaDefinition & {
  size: number;
  wallHeight: number;
  floor: ArenaBox;
  perimeter: readonly ArenaBox[];
  containerSize: readonly [number, number, number];
  containers: readonly ShipmentContainer[];
  cargo: readonly ArenaBox[][];
  props: readonly ArenaBox[];
  pallets: readonly ArenaBox[];
  forklift: { structure: readonly ArenaBox[]; detail: readonly ArenaBox[] };
  floodlights: readonly (readonly [number, number])[];
};
