import {
  CanvasTexture,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  LinearFilter,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Scene,
} from 'three';
import { arenas, placeYardPart } from '@breakpoint/shared/maps';
import type { ArenaPart as Part } from './BatchedArena';

const yard = arenas.shipment;

export function addShipmentBoundary(trim: Part[], paint: Part[]): Part[] {
  const panels: Part[] = [];
  for (const wall of yard.perimeter) {
    const [x, , z] = wall.position;
    const across = z !== 0;
    const yaw = across ? 0 : Math.PI / 2;
    const anchor = [x, 0, z] as const;
    const part = (
      offset: Part['position'],
      size: Part['size'],
      color: number,
    ) => placeYardPart(anchor, yaw, offset, size, color);
    const length = across ? wall.size[0] : wall.size[2];
    trim.push(part([0, 0.25, 0], [length, 0.5, 0.5], 0x777a71));
    for (const y of [0.54, 2.29, 3.32, 4.92])
      trim.push(part([0, y, 0], [length, 0.047, 0.058], 0x5c6662));
    for (let bay = 0; bay < 9; bay++) {
      const along = -16 + bay * 4;
      panels.push(part([along, 2.71, 0], [4.02, 4.44, 0.01], 0xc1c8bf));
      trim.push(part([along - 2, 2.5, 0], [0.126, 5, 0.14], 0x5e6964));
      if ((bay + (x + z > 0 ? 1 : 0)) % 3 !== 1) {
        trim.push(
          part(
            [along, 1.33, 0],
            [3.92, 1.58, 0.067],
            bay % 2 ? 0x5c6e59 : 0x506453,
          ),
        );
        trim.push(part([along, 0.59, 0], [3.93, 0.11, 0.077], 0x3c4e43));
      }
      for (let link = 0; link < 8; link++) {
        trim.push({
          ...part(
            [along - 1.75 + link * 0.5, 3.65, 0],
            [0.58, 0.038, 0.068],
            0x708079,
          ),
          roll: (link % 2 ? -1 : 1) * 0.46,
        });
      }
    }
    trim.push(part([18.12, 2.5, 0], [0.126, 5, 0.14], 0x5e6964));
  }
  for (const [x, z] of yard.floodlights) {
    trim.push({
      position: [x, 3.47, z],
      size: [0.19, 6.9, 0.19],
      color: 0x424c48,
    });
    trim.push({
      position: [x, 6.86, z],
      size: [1.1, 0.18, 0.27],
      color: 0x424c48,
    });
    for (const offset of [-0.32, 0.32])
      paint.push({
        position: [x + offset, 6.85, z - Math.sign(z) * 0.15],
        size: [0.35, 0.12, 0.032],
        color: 0xe0d4a3,
      });
  }
  return panels;
}

/** One cutout mesh batch gives the boundary a readable wire pattern with open sightlines. */
export function addShipmentFence(
  scene: Scene,
  panels: readonly Part[],
): () => void {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#d4dcd4';
  for (let x = 0; x < 16; x++) {
    context.fillRect(x, (x + 8) % 16, 1, 1);
    context.fillRect(x, (23 - x) % 16, 1, 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.colorSpace = SRGBColorSpace;
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({
    map: texture,
    side: DoubleSide,
    alphaTest: 0.24,
  });
  const fence = new InstancedMesh(geometry, material, panels.length);
  const matrix = new Matrix4();
  const scale = new Vector3();
  panels.forEach(({ position, size, yaw }, index) => {
    matrix
      .makeRotationY(yaw ?? 0)
      .scale(scale.set(size[0], size[1], 1))
      .setPosition(...position);
    fence.setMatrixAt(index, matrix);
  });
  fence.computeBoundingSphere();
  scene.add(fence);
  return () => {
    fence.removeFromParent();
    fence.dispose();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  };
}

export function buildPortBackdrop(): Part[] {
  const parts: Part[] = [];
  const add = (
    position: Part['position'],
    size: Part['size'],
    color: number,
    roll?: number,
  ) => parts.push({ position, size, color, roll });
  add([0, -0.3, 0], [92, 0.42, 92], 0x646d6f);
  add([1, 3.5, -34], [38, 7, 8], 0x7b8583);
  add([1, 7.15, -34], [39, 0.35, 8.5], 0x636e72);
  for (const x of [-12, -4, 4, 12])
    add([x, 3.1, -29.97], [3.7, 3.7, 0.06], 0x535e61);
  for (const [x, z] of [
    [-32.5, -10.5],
    [28, 7],
  ] as const) {
    add([x, 6.7, z], [0.72, 13.4, 0.7], 0x65747a);
    add([x + 7.5, 6.7, z], [0.72, 13.4, 0.7], 0x65747a);
    add([x + 3.75, 13.5, z], [12.3, 0.64, 0.78], 0x718085);
    add([x + 1.4, 10.6, z], [0.28, 4.0, 0.3], 0x65747a, -0.84);
    add([x + 6.1, 10.6, z], [0.28, 4.0, 0.3], 0x65747a, 0.84);
    add([x + 8.9, 10.28, z], [0.075, 5.9, 0.075], 0x525e64);
    add([x + 8.9, 7.34, z], [2.65, 0.17, 0.32], 0x59646a);
  }
  for (const [x, z, color, levels] of [
    [-22.4, 4.2, 0x657d83, 2],
    [-23.4, 12, 0x90726a, 2],
    [23.1, -11.4, 0x75806c, 2],
    [23.6, 5.4, 0x65767c, 1],
    [20.4, -24.8, 0x987b66, 2],
    [-19.6, -24.2, 0x657882, 2],
    [6.5, 23.45, 0x768272, 2],
  ] as const) {
    for (let level = 0; level < levels; level++) {
      add([x, 1.3 + level * 2.6, z], [2.4, 2.6, 6], color);
      add([x, 2.54 + level * 2.6, z], [2.47, 0.12, 6.07], 0x536367);
    }
  }
  return parts;
}
