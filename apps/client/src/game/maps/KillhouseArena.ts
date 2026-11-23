import type { Scene } from 'three';
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
  brick: 6,
  sandbag: 0,
  container: 2,
  crate: 3,
  barrel: 1,
  vehicle: 1,
  target: 5,
} satisfies Record<HousePart['surface'], number>;

const steel = 0x414e49;
const windowTint = 0x9eaaa1;

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

/** Warehouse geometry rendered in five static batches, including its walkable decks. */
export class KillhouseArena extends BatchedArena {
  private readonly removeSigns: () => void;

  constructor(scene: Scene) {
    const solids: ArenaSurface[] = [];
    const trim: ArenaPart[] = [];
    const barrels: ArenaPart[] = [];
    const paint: ArenaPart[] = [];
    const overhead: ArenaPart[] = [house.roof];
    for (const object of [
      house.floor,
      ...house.walls,
      ...house.structures,
      ...house.cover,
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
        for (const side of [-1, 1]) {
          trim.push(
            part(
              [x + side * (sx / 2 - 0.04), y, z - sz / 2 - 0.007],
              [0.09, sy, 0.02],
              steel,
            ),
          );
          trim.push(
            part(
              [x + side * 0.46, y, z - sz / 2 - 0.008],
              [0.05, sy - 0.16, 0.022],
              0x91978c,
            ),
          );
        }
      }
    }
    for (const detail of house.vehicleTrim)
      (detail.kind === 'barrel' ? barrels : trim).push(detail);
    solids.push(...house.stairs.flatMap(stairs));

    // False clerestory panes and solid roof trusses keep the room enclosed.
    for (const side of [-1, 1]) {
      for (let z = -15; z <= 15; z += 5) {
        const windowZ = Math.min(z + 1.8, 15.94);
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
        overhead.push({
          ...part([side * 20.92, 5.96, windowZ], [0.15, 0.16, 4.1], steel),
          pitch: side * 0.43,
        });
        if (z % 10 === 0) {
          overhead.push(
            part([side * 20.88, 3.45, z + 3.1], [0.2, 0.23, 1.28], steel),
          );
          paint.push(
            part(
              [side * 20.762, 3.45, z + 3.1],
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
    for (const z of [-15, -9, -3, 3, 9, 15]) {
      overhead.push(part([0, 8.05, z], [42, 0.18, 0.2], steel));
      for (const x of [-14, -7, 0, 7, 14])
        overhead.push({
          ...part([x, 8.54, z], [7.2, 0.12, 0.13], steel),
          roll: (x % 2 === 0 ? 1 : -1) * 0.092,
        });
      for (const x of [-11.5, 0, 11.5]) {
        overhead.push(part([x, 7.91, z], [2.35, 0.125, 0.36], 0x49514a));
        paint.push(part([x, 7.836, z], [2.01, 0.024, 0.22], 0xe7ce98));
      }
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
      { solids, trim, barrels, paint, overhead },
      {
        sky: 0x535a52,
        fill: [0xe5e6d9, 0x8d8f7d, 2.12],
        key: [0xffe0b7, 1.5],
        keyPosition: [-9, 32, 13],
        normalBias: 0.035,
        textureTheme: 'warehouse',
      },
    );
    this.removeSigns = addKillhouseSigns(scene);
  }

  override dispose(): void {
    this.removeSigns();
    super.dispose();
  }
}
