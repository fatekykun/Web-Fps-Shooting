import type { Scene } from 'three';
import type { GraphicsSettings } from '../rendering/graphicsConfig';
import { arenas } from '@breakpoint/shared/maps';
import {
  BatchedArena,
  type ArenaPart,
  type ArenaSurface,
} from './BatchedArena';
import { addKillhouseSigns } from './KillhouseSigns';

const house = arenas.killhouse;
type HousePart = (typeof house.cover)[number];
const tiles = {
  concrete: 7,
  steel: 1,
  timber: 5,
  plywood: 5,
  pallet: 5,
  brick: 6,
  sandbag: 0,
  container: 2,
  crate: 3,
  barrel: 1,
  vehicle: 1,
  target: 5,
} satisfies Record<HousePart['surface'], number>;

const steel = 0x3b4648;
const windowTint = 0xa2becb;

function part(
  position: ArenaPart['position'],
  size: ArenaPart['size'],
  color: number,
): ArenaPart {
  return { position, size, color };
}

function stairs(model: HousePart): ArenaSurface[] {
  const [x, , z] = model.position;
  const [width, rise, run] = model.size;
  const count = Math.ceil(rise / 0.165);
  const tread = run / count;
  const direction = Math.cos(model.yaw ?? 0);
  return Array.from({ length: count }, (_, index) => {
    const top = ((index + 1) * rise) / count;
    return {
      ...part(
        [x, top / 2, z + (run / 2 - (index + 0.5) * tread) * direction],
        [width, top, tread],
        model.color,
      ),
      tile: 5,
    };
  });
}

function localPart(
  model: ArenaPart,
  x: number,
  y: number,
  z: number,
  size: ArenaPart['size'],
  color: number,
): ArenaPart {
  const yaw = model.yaw ?? 0;
  const cosine = Math.cos(yaw),
    sine = Math.sin(yaw);
  const [mx, my, mz] = model.position;
  return {
    ...part(
      [mx + x * cosine + z * sine, my + y, mz - x * sine + z * cosine],
      size,
      color,
    ),
    yaw,
  };
}

function containerTrim(model: ArenaPart, trim: ArenaPart[]): void {
  const [width, height, length] = model.size;
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      trim.push(
        localPart(
          model,
          side * (width / 2 - 0.04),
          0,
          end * (length / 2),
          [0.12, height, 0.13],
          steel,
        ),
      );
      trim.push(
        localPart(
          model,
          side * 0.49,
          0,
          end * (length / 2 + 0.025),
          [0.055, height - 0.18, 0.067],
          0x8f958a,
        ),
      );
    }
    for (let rib = 1; rib < 15; rib++)
      trim.push(
        localPart(
          model,
          side * (width / 2 + 0.012),
          0,
          length * (rib / 15 - 0.5),
          [0.04, height - 0.23, 0.075],
          model.color,
        ),
      );
    trim.push(
      localPart(
        model,
        0,
        side * (height / 2 - 0.04),
        length / 2 + 0.008,
        [width, 0.11, 0.07],
        steel,
      ),
    );
  }
  trim.push(
    localPart(
      model,
      0,
      0,
      length / 2 + 0.014,
      [0.045, height - 0.18, 0.027],
      steel,
    ),
  );
}

function palletSlats(model: ArenaPart, trim: ArenaPart[]): void {
  const [width, height, length] = model.size;
  const layers = Math.round(height / 0.28);
  for (let layer = 0; layer < layers; layer++) {
    const bottom = -height / 2 + layer * 0.28;
    for (const rail of [-1, 0, 1])
      trim.push(
        localPart(
          model,
          rail * (width / 2 - 0.09),
          bottom + 0.11,
          0,
          [0.14, 0.22, length],
          0x604b33,
        ),
      );
    for (let slat = 0; slat < 5; slat++)
      trim.push(
        localPart(
          model,
          0,
          bottom + 0.25,
          length * (slat / 5 - 0.4),
          [width, 0.06, length * 0.155],
          slat % 2 ? 0xad8959 : model.color,
        ),
      );
  }
}

/** Warehouse geometry shares instanced batches and the server's modular layout. */
export class KillhouseArena extends BatchedArena {
  private readonly removeSigns: () => void;

  constructor(scene: Scene, settings?: GraphicsSettings) {
    const solids: ArenaSurface[] = [];
    const trim: ArenaPart[] = [...house.roomTrim];
    const barrels: ArenaPart[] = [];
    const paint: ArenaPart[] = [];
    const overhead: ArenaPart[] = [];
    const daylight: ArenaPart[] = [];
    for (const object of [
      house.floor,
      ...house.walls,
      ...house.structures,
      ...house.cover,
      ...house.rooms,
    ]) {
      const [x, y, z] = object.position;
      const [sx, sy, sz] = object.size;
      if (object.surface === 'barrel') {
        barrels.push(object);
        for (const dy of [-0.27, 0.25])
          barrels.push(
            part([x, y + dy, z], [sx + 0.011, 0.07, sz + 0.011], 0x8b907b),
          );
        continue;
      }
      if (object.surface === 'vehicle') {
        (object.kind === 'barrel' ? barrels : trim).push(object);
        continue;
      }
      if (object.surface === 'pallet') {
        palletSlats(object, trim);
        continue;
      }
      if (object.surface === 'sandbag') {
        trim.push(part([x, y, z], [sx, sy - 0.1, sz], object.color));
        for (const direction of [-1, 1])
          trim.push(
            part(
              [x, y + direction * (sy / 2 - 0.025), z],
              [sx - 0.095, 0.05, sz - 0.11],
              direction > 0 ? 0xae9868 : 0x87754e,
            ),
          );
        continue;
      }
      solids.push({ ...object, tile: tiles[object.surface] });
      if (object.surface === 'target') {
        const face = z + Math.cos(object.yaw ?? 0) * (sz / 2 + 0.005);
        paint.push(part([x, y + 0.26, face], [0.19, 0.22, 0.01], 0x433f35));
        paint.push(part([x, y - 0.11, face], [0.38, 0.45, 0.01], 0x433f35));
        paint.push(part([x, y + 0.08, face], [0.47, 0.15, 0.01], 0x433f35));
      } else if (object.surface === 'container') {
        containerTrim(object, trim);
      }
    }
    for (const detail of house.vehicleTrim)
      (detail.kind === 'barrel' ? barrels : trim).push(detail);
    solids.push(...house.stairs.flatMap(stairs));

    // A maintenance ladder dresses the scaffold; players reach the deck by stairs.
    for (const z of [0.92, 1.76])
      trim.push(part([2.84, 1.98, z], [0.1, 3.75, 0.105], 0x977a4d));
    for (let y = 0.35; y < house.towerHeight; y += 0.31)
      trim.push(part([2.855, y, 1.34], [0.086, 0.055, 0.91], 0xbe9b5f));

    // Repeating steel posts, girts and braces support the lit clerestory bays.
    for (const side of [-1, 1]) {
      for (const y of [2.08, 6.35, 8.23]) {
        overhead.push(part([side * 20.88, y, 0], [0.2, 0.15, 36], steel));
        overhead.push(part([0, y, side * 17.9], [42, 0.15, 0.2], steel));
      }
      for (let bay = 0; bay < 7; bay++) {
        const windowZ = -15 + bay * 5;
        overhead.push(
          part([side * 20.985, 7.35, windowZ], [0.035, 1.44, 3.78], steel),
        );
        for (const dz of [-1.43, -0.71, 0, 0.71, 1.43])
          paint.push(
            part(
              [side * 20.959, 7.35, windowZ + dz],
              [0.021, 1.09, 0.54],
              windowTint,
            ),
          );
        for (const slope of [-1, 1])
          overhead.push({
            ...part(
              [side * 20.9, 4.2, windowZ],
              [0.14, 0.15, Math.hypot(4.35, 3.8)],
              steel,
            ),
            pitch: slope * Math.atan2(3.8, 4.35),
          });
        if (bay % 2 === 0) {
          overhead.push(
            part([side * 20.88, 3.45, windowZ], [0.2, 0.23, 1.28], steel),
          );
          paint.push(
            part(
              [side * 20.762, 3.45, windowZ],
              [0.024, 0.135, 0.95],
              0xe8ba72,
            ),
          );
        }
      }
      for (let x = -17.5; x <= 17.5; x += 5) {
        overhead.push(part([x, 7.4, side * 17.988], [3.4, 1.29, 0.035], steel));
        for (const dx of [-1, 0, 1])
          paint.push(
            part([x + dx, 7.4, side * 17.955], [0.83, 0.88, 0.021], windowTint),
          );
      }
    }
    // Glazed bays read as daylight even with real-time shadows disabled.
    for (let x = -21; x <= 21; x += 7)
      overhead.push(part([x, 8.87, 0], [0.21, 0.28, 36], steel));
    for (let bay = 0; bay < 6; bay++) {
      const z = -15 + bay * 6;
      overhead.push(part([0, 8.12, z], [42, 0.18, 0.29], steel));
      overhead.push(part([0, 8.88, z - 3], [42, 0.27, 0.24], steel));
      for (let column = 0; column < 6; column++) {
        const x = -17.5 + column * 7;
        overhead.push({
          ...part([x, 8.53, z], [7.1, 0.13, 0.15], steel),
          roll: (column % 2 === 0 ? 1 : -1) * 0.1,
        });
        if ((column + bay) % 3 === 0 || column === 0 || column === 5) {
          overhead.push(part([x, 9.1, z], [7.03, 0.17, 6.04], 0x535d60));
          continue;
        }
        overhead.push(part([x, 8.96, z], [0.12, 0.14, 6], steel));
        overhead.push(part([x, 8.96, z], [7, 0.14, 0.14], steel));
        for (const dx of [-1.75, 1.75])
          for (const dz of [-1.5, 1.5]) {
            const tint = dx * dz > 0 ? 0xb9d0d8 : 0x91b4c9;
            paint.push(part([x + dx, 9.07, z + dz], [3.43, 0.07, 2.94], tint));
            if (bay > 0)
              daylight.push(
                part(
                  [x + dx + 2.5, 0.005, z + dz - 2.8],
                  [3.23, 0.002, 2.69],
                  0xe5d6b3,
                ),
              );
          }
      }
      for (const x of [-11.5, 0, 11.5]) {
        overhead.push(part([x, 7.91, z], [2.35, 0.125, 0.36], 0x49514a));
        paint.push(part([x, 7.836, z], [2.01, 0.024, 0.22], 0xe7ce98));
      }
    }
    overhead.push(part([0, 8.88, 18], [42, 0.27, 0.24], steel));

    // The drainage grates are flush scenery. Their surface cannot catch a capsule.
    for (const [x, z, length] of [
      [-17.9, -4.7, 14.4],
      [-5.9, 1.65, 7.2],
      [6.1, 4.8, 9.6],
      [18.15, -0.2, 12],
    ] as const) {
      trim.push(part([x, 0.006, z], [0.29, 0.01, length], 0x333938));
      for (let along = -length / 2 + 0.15; along < length / 2; along += 0.24)
        trim.push(part([x, 0.014, z + along], [0.25, 0.01, 0.04], 0x646a61));
    }
    for (const side of [-1, 1]) {
      const team = side < 0 ? 'blue' : 'orange';
      const tint = side < 0 ? 0x648c9c : 0xad7057;
      for (const spawn of house.spawns[team])
        paint.push(
          part(
            [spawn.x, house.deckHeight + 0.007, spawn.z],
            [2.15, 0.013, 0.105],
            tint,
          ),
        );
      for (let z = -13; z <= 13; z += 3)
        paint.push(
          part([side * 18.35, 0.008, z], [0.065, 0.012, 1.25], 0xa59058),
        );
      for (const x of [-3.22, 3.22])
        for (const z of [5.65, 9.1])
          paint.push(
            part([x, 0.009, side * z], [0.075, 0.013, 1.56], 0xb0a069),
          );
      for (const x of [-5.4, 5.4])
        paint.push(
          part([x, 0.01, side * 10.24], [2.28, 0.017, 0.105], 0xc3a065),
        );
    }

    super(
      scene,
      { solids, trim, barrels, paint, overhead, daylight },
      {
        sky: 0x8196a1,
        fill: [0xe4e9e6, 0x96958a, 1.8],
        key: [0xffe3bd, 1.48],
        keyPosition: [-9, 32, 13],
        normalBias: 0.035,
        textureTheme: 'warehouse',
      },
      settings,
    );
    this.removeSigns = addKillhouseSigns(scene);
  }

  override dispose(): void {
    this.removeSigns();
    super.dispose();
  }
}
