import type { ArenaBox } from './depot';

export const containerSize = [2.4, 2.6, 6] as const;

export type ShipmentContainer = {
  x: number;
  z: number;
  level: number;
  yaw: number;
  color: number;
  opening?: 'through' | 'front';
};

export function placeYardPart(
  anchor: ArenaBox['position'],
  yaw: number,
  offset: ArenaBox['position'],
  size: ArenaBox['size'],
  color: number,
): ArenaBox {
  const [x, y, z] = offset;
  const sine = Math.sin(yaw),
    cosine = Math.cos(yaw);
  return {
    position: [
      anchor[0] + x * cosine + z * sine,
      anchor[1] + y,
      anchor[2] - x * sine + z * cosine,
    ],
    size,
    color,
    yaw,
  };
}

export function containerAnchor({
  x,
  z,
  level,
}: ShipmentContainer): ArenaBox['position'] {
  return [x, (level + 0.5) * containerSize[1], z];
}

/** Shared metal shell, door leaves and threshold wedges for the playable containers. */
export function cargoCollision(model: ShipmentContainer): ArenaBox[] {
  const [width, height, length] = containerSize;
  const anchor = containerAnchor(model);
  const metal = (
    offset: ArenaBox['position'],
    size: ArenaBox['size'],
    color = model.color,
  ): ArenaBox => ({
    ...placeYardPart(anchor, model.yaw, offset, size, color),
    footstepSurface: 'metal',
  });
  if (!model.opening) return [metal([0, 0, 0], containerSize)];
  const thickness = 0.08;
  const floorHeight = thickness;
  const parts = [
    metal(
      [0, -height / 2 + floorHeight / 2, 0],
      [width, floorHeight, length],
      0x6c6e62,
    ),
    metal([0, height / 2 - thickness / 2, 0], [width, thickness, length]),
    ...[-1, 1].map((side) =>
      metal(
        [side * (width / 2 - thickness / 2), 0, 0],
        [thickness, height, length],
      ),
    ),
  ];
  for (const end of [-1, 1]) {
    if (end < 0 && model.opening === 'front') {
      parts.push(
        metal([0, 0, -length / 2 + thickness / 2], [width, height, thickness]),
      );
      continue;
    }
    for (const side of [-1, 1]) {
      parts.push(
        metal(
          [side * (width / 2 - 0.045), 0, end * (length / 2 + 0.53)],
          [0.09, height - 0.18, 1.06],
        ),
      );
    }
    parts.push({
      ...metal(
        [0, -height / 2 + floorHeight / 2, end * (length / 2 + 0.22)],
        [width - 0.18, floorHeight, 0.49],
        0x727769,
      ),
      kind: 'stair',
      yaw: model.yaw + (end < 0 ? Math.PI : 0),
    });
  }
  return parts;
}

export function forkliftParts(anchor: ArenaBox['position'], yaw: number) {
  const yellow = 0xba8c29,
    steel = 0x353c3c,
    rubber = 0x26292a;
  const part = (
    offset: ArenaBox['position'],
    size: ArenaBox['size'],
    color: number,
  ) => placeYardPart(anchor, yaw, offset, size, color);
  const structure = [
    part([0, 0.56, -0.13], [1.52, 0.74, 2.3], yellow),
    part([0, 2.22, -0.15], [1.52, 0.1, 1.5], steel),
    part([0, 0.65, 1.19], [1.24, 0.77, 0.12], steel),
  ];
  const detail = [
    part([0, 0.97, -0.57], [1.41, 0.25, 1.02], yellow),
    part([0.12, 1.18, -0.46], [0.59, 0.12, 0.48], rubber),
    part([0.12, 1.36, -0.68], [0.59, 0.39, 0.12], rubber),
    part([0.12, 1.25, 0.48], [0.67, 0.19, 0.39], steel),
    part([0.15, 1.45, 0.37], [0.13, 0.3, 0.11], steel),
    {
      ...part([0.15, 1.6, 0.34], [0.38, 0.05, 0.38], rubber),
      kind: 'barrel' as const,
      pitch: -0.34,
    },
    part([0, 1.35, 1.04], [1.16, 0.12, 0.12], steel),
    part([0, 1.99, 1.04], [1.05, 0.1, 0.12], steel),
    part([0.48, 2.35, -0.55], [0.18, 0.17, 0.18], 0xd48231),
  ];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      structure.push(
        part([side * 0.68, 1.56, -0.15 + end * 0.68], [0.09, 1.26, 0.1], steel),
      );
      detail.push({
        ...part([side * 0.76, 0.35, end * 0.8], [0.66, 0.24, 0.66], rubber),
        kind: 'barrel',
        roll: Math.PI / 2,
      });
      detail.push({
        ...part([side * 0.887, 0.35, end * 0.8], [0.31, 0.019, 0.31], 0x7e7460),
        kind: 'barrel',
        roll: Math.PI / 2,
      });
    }
    structure.push(part([side * 0.46, 1.12, 1.04], [0.13, 2.18, 0.19], steel));
    structure.push(part([side * 0.38, 0.16, 1.83], [0.16, 0.16, 1.47], steel));
    detail.push(
      part([side * 0.59, 0.84, 1.039], [0.22, 0.16, 0.065], 0xe1c68f),
    );
  }
  return {
    structure: structure.map((box): ArenaBox => ({
      ...box,
      footstepSurface: 'metal',
    })),
    detail,
  };
}
