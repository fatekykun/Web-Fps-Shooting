import type { ArenaDefinition, ArenaSpawn } from './arenas';
import type { ArenaBox } from './depot';

const colors = {
  red: 0x995442,
  blue: 0x56798c,
  green: 0x687747,
  yellow: 0xb59143,
};

const [width, height, length] = [2.4, 2.6, 6];
const size = 36;
const wallHeight = 5;
const half = size / 2;

type Container = {
  x: number;
  z: number;
  level: number;
  yaw: number;
  color: number;
};

const north: readonly Container[] = [
  { x: -14.3, z: -10, level: 0, yaw: 0, color: colors.red },
  { x: 14.5, z: -10, level: 0, yaw: Math.PI, color: colors.blue },
  { x: -15.1, z: -0.6, level: 0, yaw: 0, color: colors.yellow },
  { x: -6.4, z: -8.1, level: 0, yaw: 0, color: colors.blue },
  { x: -0.5, z: -7.4, level: 0, yaw: Math.PI / 2, color: colors.red },
  { x: 8.6, z: -8.6, level: 0, yaw: 0, color: colors.green },
  { x: -1.5, z: -3.3, level: 0, yaw: Math.PI / 2, color: colors.green },
  { x: -1.5, z: -3.3, level: 1, yaw: Math.PI / 2, color: colors.yellow },
];
const containers = [
  ...north,
  ...north.map((container) => ({
    ...container,
    x: -container.x,
    z: -container.z,
    yaw: container.yaw + Math.PI,
  })),
];

const floor: ArenaBox = {
  position: [0, -0.5, 0],
  size: [size + 1, 1, size + 1],
  color: 0x79796c,
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

const props: ArenaBox[] = [];
for (const side of [-1, 1]) {
  for (const [x, z, long] of [
    [-11.6, -14.8, false],
    [11.4, -14.1, true],
    [-10, -4.8, false],
    [9.1, -3.1, false],
    [4.6, -6.8, false],
  ] as const) {
    props.push({
      position: [x * side, 0.5, z * side],
      size: [long ? 1.8 : 1.15, 1, 1.15],
      color: long ? 0x98815e : 0x8b7652,
      kind: 'crate',
    });
  }
  for (const [x, z] of [
    [-12.8, -14.8],
    [12.8, -14.1],
    [12.8, -13.45],
    [-7.6, -4.3],
  ] as const) {
    props.push({
      position: [x * side, 0.46, z * side],
      size: [0.56, 0.92, 0.56],
      color: 0x536d76,
      kind: 'barrel',
    });
  }
}

const containerBoxes: ArenaBox[] = containers.map(
  ({ x, z, level, yaw, color }) => ({
    position: [x, (level + 0.5) * height, z],
    size:
      Math.abs(Math.sin(yaw)) > 0.5
        ? [length, height, width]
        : [width, height, length],
    color,
    kind: 'container',
  }),
);
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
  sector: '02',
  size,
  wallHeight,
  floor,
  perimeter,
  containerSize: [width, height, length] as const,
  containers,
  props,
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
  colliders: [floor, ...perimeter, ...containerBoxes, ...props],
} satisfies ArenaDefinition & {
  size: number;
  wallHeight: number;
  floor: ArenaBox;
  perimeter: readonly ArenaBox[];
  containerSize: readonly [number, number, number];
  containers: readonly Container[];
  props: readonly ArenaBox[];
  floodlights: readonly (readonly [number, number])[];
};
