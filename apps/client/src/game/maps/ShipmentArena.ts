import type { Scene } from 'three';
import { arenas } from '@breakpoint/shared/maps';
import {
  BatchedArena,
  type ArenaPart as Part,
  type ArenaSurface as Surface,
} from './BatchedArena';
import { addShipmentCargo, addShipmentPallet } from './ShipmentCargoVisuals';
import {
  addShipmentBoundary,
  addShipmentFence,
  buildPortBackdrop,
} from './ShipmentPort';

const yard = arenas.shipment;

function decorateGround(trim: Part[], paint: Part[]): void {
  for (const side of [-1, 1]) {
    for (const z of [-11, -7, -3, 1, 5, 9, 13])
      paint.push({
        position: [side * 11.2, 0.007, z],
        size: [0.075, 0.01, 1.18],
        color: 0xa7924d,
      });
    const tint = side < 0 ? 0x638fa2 : 0xb66c4c;
    for (const point of yard.spawns[side < 0 ? 'blue' : 'orange']) {
      paint.push({
        position: [point.x, 0.009, point.z + side * 0.85],
        size: [2.25, 0.01, 0.1],
        color: tint,
      });
      for (const direction of [-1, 1])
        paint.push({
          position: [point.x + direction * 0.25, 0.009, point.z],
          size: [0.08, 0.01, 0.64],
          yaw: (side * direction * Math.PI) / 3,
          color: tint,
        });
    }
  }
  for (const [x, z, length] of [
    [-16.9, -2.6, 12.2],
    [10.3, 4.8, 9.3],
    [17.2, -7.8, 8.4],
  ] as const) {
    trim.push({
      position: [x, 0.004, z],
      size: [0.27, 0.007, length],
      color: 0x303739,
    });
    for (let offset = -length / 2 + 0.15; offset < length / 2; offset += 0.23)
      trim.push({
        position: [x, 0.011, z + offset],
        size: [0.23, 0.007, 0.046],
        color: 0x60686a,
      });
  }
  for (const [x, z, w, l, yaw, color] of [
    [12.1, -12.8, 6.2, 3.6, 0, 0x737775],
    [-14.5, -1.45, 4.4, 8.35, 0, 0x6a6d66],
    [7.7, 10.5, 3.5, 1.2, 0.31, 0x3c484d],
    [-6.3, -13.8, 1.67, 1.12, -0.12, 0x444b48],
    [11.4, 4.9, 1.8, 1.1, 0.42, 0x3b484c],
    [13.8, -13.32, 0.92, 1.38, 0.32, 0x444748],
    [4.7, -1.65, 1.82, 0.67, -0.23, 0x414b4b],
  ] as const)
    trim.push({ position: [x, 0.0025, z], size: [w, 0.003, l], color, yaw });
  for (const [x, z] of [
    [12.25, -10.86],
    [15.7, -10.86],
    [-15.8, 2.97],
    [-12.78, 2.97],
  ] as const) {
    for (let stripe = 0; stripe < 5; stripe++)
      paint.push({
        position: [x + stripe * 0.18, 0.012, z],
        size: [0.093, 0.008, 0.63],
        yaw: 0.65,
        color: stripe % 2 ? 0x9b8346 : 0xb89a4e,
      });
  }
  for (const [x, z] of [
    [12.4, -11.32],
    [15.86, -11.35],
    [-12.58, 3.3],
  ] as const) {
    trim.push({
      position: [x, 0.034, z],
      size: [0.25, 0.068, 0.25],
      color: 0x3c423d,
    });
    trim.push({
      position: [x, 0.145, z],
      size: [0.17, 0.19, 0.17],
      color: 0xb7662d,
    });
    trim.push({
      position: [x, 0.265, z],
      size: [0.098, 0.12, 0.098],
      color: 0xc78142,
    });
  }
}

/** The playable freight follows the same shell geometry as client and server hit tests. */
export class ShipmentArena extends BatchedArena {
  private readonly removeFence: () => void;

  constructor(scene: Scene) {
    const solids: Surface[] = [{ ...yard.floor, tile: 7 }];
    const trim: Part[] = [...yard.forklift.structure];
    const barrels: Part[] = [];
    const paint: Part[] = [];
    const panels = addShipmentBoundary(trim, paint);
    yard.containers.forEach((model, index) =>
      addShipmentCargo(model, yard.cargo[index]!, solids, trim, paint),
    );
    for (const pallet of yard.pallets) addShipmentPallet(pallet, trim);
    for (const part of yard.forklift.detail)
      (part.kind === 'barrel' ? barrels : trim).push(part);
    for (const prop of yard.props) {
      if (prop.kind === 'barrel') {
        barrels.push(prop);
        const [x, y, z] = prop.position;
        for (const dy of [-0.27, 0.26])
          barrels.push({
            position: [x, y + dy, z],
            size: [0.58, 0.062, 0.58],
            color: 0x929789,
          });
      } else solids.push({ ...prop, tile: prop.kind === 'crate' ? 3 : 0 });
    }
    decorateGround(trim, paint);
    super(
      scene,
      { solids, trim, barrels, paint, overhead: buildPortBackdrop() },
      {
        sky: 0xa0b0b9,
        fill: [0xe5eef0, 0x7a8075, 1.84],
        key: [0xffe8cc, 1.66],
        keyPosition: [-20, 29, -12],
        normalBias: 0.035,
        textureTheme: 'yard',
      },
    );
    this.removeFence = addShipmentFence(scene, panels);
  }

  override dispose(): void {
    this.removeFence();
    super.dispose();
  }
}
