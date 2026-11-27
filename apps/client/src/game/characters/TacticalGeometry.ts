import { BufferGeometry, Float32BufferAttribute } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Rounded, tapered armor segments with shared smooth normals along the sides. */
export function createTacticalGeometry(): BufferGeometry {
  const sides = 12;
  const radii = [0.41, 0.5, 0.43] as const;
  const positions: number[] = [];
  const normals: number[] = [];
  const uv: number[] = [];
  function push(level: number, index: number, cap = 0): void {
    const angle = (index / sides) * Math.PI * 2;
    const x = Math.sin(angle);
    const z = Math.cos(angle);
    positions.push(x * radii[level]!, level / 2 - 0.5, z * radii[level]!);
    if (cap) normals.push(0, cap, 0);
    else {
      const tilt = [-0.18, -0.02, 0.14][level]!;
      const length = Math.hypot(1, tilt);
      normals.push(x / length, tilt / length, z / length);
    }
    uv.push(index / sides, level / 2);
  }
  for (let side = 0; side < sides; side++) {
    for (let level = 0; level < 2; level++) {
      push(level, side);
      push(level, side + 1);
      push(level + 1, side);
      push(level, side + 1);
      push(level + 1, side + 1);
      push(level + 1, side);
    }
    for (const cap of [-1, 1]) {
      const level = cap < 0 ? 0 : 2;
      positions.push(0, cap * 0.5, 0);
      normals.push(0, cap, 0);
      uv.push((side + 0.5) / sides, 0.5);
      push(level, cap < 0 ? side + 1 : side, cap);
      push(level, cap < 0 ? side : side + 1, cap);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const indexed = mergeVertices(geometry, 1e-7);
  indexed.computeBoundingSphere();
  return indexed;
}
