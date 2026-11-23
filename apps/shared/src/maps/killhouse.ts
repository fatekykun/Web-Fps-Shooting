import type { ArenaDefinition, ArenaSpawn } from './arenas';
import type { ArenaBox } from './depot';

type Surface =
  | 'concrete'
  | 'steel'
  | 'timber'
  | 'brick'
  | 'plywood'
  | 'sandbag'
  | 'container'
  | 'crate'
  | 'barrel'
  | 'vehicle'
  | 'target';

export type KillhousePart = ArenaBox & { surface: Surface };

const width = 42;
const depth = 36;
const height = 9;
const deckHeight = 1.45;
const towerHeight = 3;
const colors: Record<Surface, number> = {
  concrete: 0x77786d,
  steel: 0x56635d,
  timber: 0x9b8056,
  brick: 0x8d5948,
  plywood: 0x9b8a63,
  sandbag: 0x99865b,
  container: 0x587485,
  crate: 0x8b744f,
  barrel: 0x536a5d,
  vehicle: 0x626952,
  target: 0xaa9271,
};
const surfaces: Record<Surface, NonNullable<ArenaBox['footstepSurface']>> = {
  concrete: 'concrete',
  steel: 'metal',
  timber: 'wood',
  brick: 'concrete',
  plywood: 'wood',
  sandbag: 'dirt',
  container: 'metal',
  crate: 'wood',
  barrel: 'metal',
  vehicle: 'metal',
  target: 'wood',
};

function box(
  surface: Surface,
  position: ArenaBox['position'],
  size: ArenaBox['size'],
  color = colors[surface],
  yaw?: number,
): KillhousePart {
  return {
    surface,
    position,
    size,
    color,
    yaw,
    footstepSurface: surfaces[surface],
  };
}

const floor = box('concrete', [0, -0.5, 0], [width + 1, 1, depth + 1]);
const roof = box('steel', [0, height + 0.25, 0], [width + 1, 0.5, depth + 1]);
const walls = [-1, 1].flatMap((side) => [
  box(
    'steel',
    [side * (width / 2 + 0.25), height / 2, 0],
    [0.5, height, depth],
  ),
  box(
    'steel',
    [0, height / 2, side * (depth / 2 + 0.25)],
    [width + 1, height, 0.5],
  ),
]);
const structures: KillhousePart[] = [];
const stairs: KillhousePart[] = [];
const cover: KillhousePart[] = [];
const vehicleTrim: ArenaBox[] = [];
for (const side of [-1, 1]) {
  for (let z = -15; z <= 15; z += 5)
    structures.push(
      box('steel', [side * 20.86, 4.5, z], [0.29, 9, 0.2], 0x414e49),
    );
  for (let x = -17.5; x <= 17.5; x += 5)
    structures.push(
      box('steel', [x, 4.5, side * 17.86], [0.22, 9, 0.29], 0x414e49),
    );
}

// Each stair's local +Z edge sits on the lower landing.
function stair(
  x: number,
  z: number,
  rise: number,
  run: number,
  span: number,
  yaw: number,
) {
  stairs.push({
    ...box('timber', [x, rise / 2, z], [span, rise, run], undefined, yaw),
    kind: 'stair',
  });
  const direction = Math.cos(yaw);
  for (const side of [-1, 1]) {
    const edge = x + side * (span / 2 + 0.15);
    structures.push({
      ...box(
        'timber',
        [edge, rise / 2 + 0.88, z],
        [0.115, 0.13, Math.hypot(rise, run)],
        0xb99a6a,
      ),
      pitch: direction * Math.atan2(rise, run),
    });
    for (const position of [-0.43, 0.05, 0.43]) {
      const treadY = rise * (0.5 - position);
      structures.push(
        box(
          'timber',
          [edge, treadY + 0.44, z + direction * run * position],
          [0.12, 0.88, 0.12],
        ),
      );
    }
  }
}

function rail(x: number, y: number, z: number, sx: number, sz: number) {
  structures.push(box('timber', [x, y + 0.9, z], [sx, 0.13, sz], 0xaa8d61));
  structures.push(box('timber', [x, y + 0.19, z], [sx, 0.19, sz], 0x997c52));
  for (const side of [-1, 1]) {
    const dx = sx > sz ? side * (sx / 2 - 0.07) : 0;
    const dz = sz > sx ? side * (sz / 2 - 0.07) : 0;
    structures.push(
      box('timber', [x + dx, y + 0.43, z + dz], [0.14, 0.86, 0.14]),
    );
  }
}

structures.push(box('timber', [0, towerHeight - 0.15, 0], [5.8, 0.3, 5.4]));
const towerSigns = [-1, 1].map((side) => {
  const board = box(
    'timber',
    [side * 2.13, towerHeight + 0.56, side * 2.64],
    [1.38, 0.5, 0.13],
    0x5f543f,
  );
  structures.push(board);
  return {
    position: [board.position[0], board.position[1], side * 2.709] as const,
    yaw: side > 0 ? 0 : Math.PI,
  };
});
for (const side of [-1, 1]) {
  for (const end of [-1, 1])
    structures.push(
      box('timber', [side * 2.56, 1.36, end * 2.36], [0.34, 2.72, 0.34]),
    );
  rail(side * 2.83, towerHeight, 0, 0.14, 5.4);
  for (const x of [-2.15, 2.15]) rail(x, towerHeight, side * 2.62, 1.48, 0.14);
  for (const slope of [-1, 1])
    structures.push({
      ...box(
        'timber',
        [0, 1.46, side * (2.37 + slope * 0.09)],
        [5.5, 0.17, 0.17],
        0x846a48,
      ),
      roll: slope * Math.atan2(2.05, 5.12),
    });
}
stair(0, -4.9, towerHeight, 4.4, 2.5, Math.PI);
stair(0, 4.9, towerHeight, 4.4, 2.5, 0);

function wreck(x: number, z: number, yaw: number, tint: number) {
  const vehiclePart = (
    dx: number,
    y: number,
    dz: number,
    size: ArenaBox['size'],
    color: number,
  ) =>
    box(
      'vehicle',
      [
        x + dx * Math.cos(yaw) + dz * Math.sin(yaw),
        y,
        z - dx * Math.sin(yaw) + dz * Math.cos(yaw),
      ],
      size,
      color,
      yaw,
    );

  cover.push(
    vehiclePart(0, 0.51, 0, [1.82, 0.48, 4.15], tint),
    vehiclePart(0, 0.77, 1.12, [1.75, 0.15, 1.6], tint),
    vehiclePart(0, 0.75, -1.51, [1.73, 0.16, 1.01], tint),
    vehiclePart(0, 0.98, -0.29, [1.54, 0.48, 1.78], 0x414640),
    vehiclePart(0, 1.24, -0.29, [1.61, 0.12, 1.7], tint),
  );
  for (const side of [-1, 1]) {
    for (const dz of [-1.31, 1.31]) {
      cover.push({
        ...vehiclePart(side * 0.91, 0.29, dz, [0.58, 0.21, 0.58], 0x30332e),
        kind: 'barrel',
        roll: Math.PI / 2,
      });
      vehicleTrim.push({
        ...vehiclePart(side * 1.02, 0.29, dz, [0.28, 0.025, 0.28], 0x77796b),
        kind: 'barrel',
        roll: Math.PI / 2,
      });
    }
    vehicleTrim.push(
      vehiclePart(side * 0.78, 0.97, -0.36, [0.027, 0.46, 0.074], tint),
      vehiclePart(side * 0.919, 0.57, -0.51, [0.021, 0.034, 0.19], 0x414640),
      vehiclePart(side * 0.59, 0.62, 2.077, [0.33, 0.17, 0.035], 0xc9bf98),
      vehiclePart(side * 0.61, 0.61, -2.077, [0.28, 0.15, 0.035], 0x864d3e),
    );
  }
  vehicleTrim.push(
    vehiclePart(0, 0.46, 2.077, [1.64, 0.1, 0.05], 0x53584c),
    vehiclePart(0, 0.63, 2.079, [0.65, 0.14, 0.034], 0x3a4038),
  );
}

function target(x: number, z: number, yaw: number) {
  cover.push(
    box('target', [x, 1.06, z], [0.73, 1.16, 0.17], colors.target, yaw),
    box('timber', [x, 0.25, z], [0.14, 0.5, 0.16]),
    box('timber', [x, 0.06, z], [0.78, 0.12, 0.64]),
  );
}

const spawnRows: ArenaSpawn[][] = [];
for (const side of [-1, 1]) {
  structures.push(
    box('timber', [0, deckHeight - 0.14, side * 15.5], [16.4, 0.28, 4.9]),
  );
  for (const x of [-7.75, -2.65, 2.65, 7.75]) {
    structures.push(box('timber', [x, 0.65, side * 13.3], [0.28, 1.3, 0.32]));
    structures.push(box('timber', [x, 0.65, side * 17.6], [0.28, 1.3, 0.32]));
  }
  for (const x of [-5.4, 5.4])
    stair(x, side * 11.7, deckHeight, 2.7, 2.3, side < 0 ? 0 : Math.PI);
  for (const x of [-8.08, 8.08]) {
    rail(x, deckHeight, side * 15.5, 0.17, 4.9);
    rail(x * 0.93, deckHeight, side * 13.12, 1.2, 0.16);
  }
  // Inset plywood screens interrupt the straight view from the tower to spawns.
  structures.push(
    box('plywood', [0, deckHeight + 0.72, side * 13.18], [7.5, 1.44, 0.24]),
  );
  spawnRows.push(
    [-6.3, -2.1, 2.1, 6.3].map((x) => ({
      x,
      y: deckHeight + 0.91,
      z: side * 16.1,
      yaw: side < 0 ? Math.PI : 0,
    })),
  );

  cover.push(box('brick', [-6.8, 0.55, side * 7.8], [3.7, 1.1, 0.42]));
  cover.push(box('brick', [6.8, 0.55, side * 7.8], [3.7, 1.1, 0.42]));
  for (const x of [-15.8, 15.8]) {
    cover.push(box('plywood', [x, 0.98, side * 5.8], [0.22, 1.96, 2.8]));
    cover.push(
      box(
        'brick',
        [x + Math.sign(x) * 0.88, 0.51, side * 4.48],
        [1.9, 1.02, 0.38],
      ),
    );
  }
  for (const x of [-4.85, 4.85]) {
    for (let i = -1; i <= 1; i++)
      cover.push(
        box('sandbag', [x + i * 0.66, 0.16, side * 3.7], [0.65, 0.32, 0.66]),
      );
    for (const dx of [-0.33, 0.33])
      cover.push(
        box(
          'sandbag',
          [x + dx, 0.46, side * 3.7],
          [0.65, 0.28, 0.56],
          0xa79567,
        ),
      );
  }

  cover.push(box('crate', [side * 12.7, 0.51, side * 14.6], [1.1, 1.02, 1.15]));
  cover.push(box('crate', [-side * 3.9, 0.51, side * 2.15], [1.1, 1.02, 1.07]));
  cover.push(
    box(
      'crate',
      [side * 12.71, 1.42, side * 14.57],
      [0.88, 0.8, 0.94],
      0x9c8259,
    ),
    box('crate', [-side * 11.35, 0.45, side * 15.55], [0.9, 0.9, 0.91]),
    box('crate', [-side * 12.43, 0.36, side * 15.36], [0.87, 0.72, 0.82]),
    box('plywood', [side * 16.6, 0.89, side * 13.05], [0.22, 1.78, 3.25]),
    box('brick', [side * 15.22, 0.49, side * 14.57], [2.6, 0.98, 0.36]),
  );
  for (const [x, z] of [
    [side * 14.3, side * 13.85],
    [-side * 10.2, side * 10.3],
    [-side * 13.5, side * 15.05],
    [side * 16.13, side * 11.95],
  ] as const) {
    cover.push({
      ...box('barrel', [x, 0.45, z], [0.58, 0.9, 0.58]),
      kind: 'barrel',
    });
  }

  wreck(
    side * 13.7,
    side * 9.1,
    -0.53 + (side < 0 ? Math.PI : 0),
    side < 0 ? colors.vehicle : 0x887554,
  );
  target(side * 8.4, 6.1, 0);
}

target(2.75, -8.4, Math.PI);
cover.push(box('container', [-9.8, 1.3, -0.65], [2.4, 2.6, 5.6]));
cover.push(box('container', [9.8, 1.3, 0.65], [2.4, 2.6, 5.6], 0x985746));

const blue = spawnRows[0]!,
  orange = spawnRows[1]!;
export const killhouse = {
  name: 'Killhouse',
  venue: 'indoor training warehouse',
  sector: '03',
  width,
  depth,
  height,
  deckHeight,
  towerHeight,
  floor,
  roof,
  walls,
  structures,
  stairs,
  cover,
  vehicleTrim,
  towerSigns,
  spawns: {
    blue,
    orange,
    none: blue.flatMap((point, i) => [point, orange[i]!]),
  },
  colliders: [floor, roof, ...walls, ...structures, ...stairs, ...cover],
} satisfies ArenaDefinition & {
  width: number;
  depth: number;
  height: number;
  deckHeight: number;
  towerHeight: number;
  floor: KillhousePart;
  roof: KillhousePart;
  walls: readonly KillhousePart[];
  structures: readonly KillhousePart[];
  stairs: readonly KillhousePart[];
  cover: readonly KillhousePart[];
  vehicleTrim: readonly ArenaBox[];
  towerSigns: readonly { position: ArenaBox['position']; yaw: number }[];
};
