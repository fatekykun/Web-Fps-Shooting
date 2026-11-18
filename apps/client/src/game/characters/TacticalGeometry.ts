import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Forty-eight flat-shaded triangles: rounded cross-section and tapered ends. */
export function createTacticalGeometry(): BufferGeometry {
  const positions: number[] = [];
  const ring = (level: number, index: number): [number, number, number] => {
    const radius = [0.41, 0.5, 0.43][level]!;
    const angle = (index * Math.PI) / 4 + Math.PI / 8;
    return [
      Math.sin(angle) * radius,
      [-0.5, 0, 0.5][level]!,
      Math.cos(angle) * radius,
    ];
  };
  const triangle = (a: number[], b: number[], c: number[]) =>
    positions.push(...a, ...b, ...c);
  for (let side = 0; side < 8; side++) {
    for (let level = 0; level < 2; level++) {
      const a = ring(level, side),
        b = ring(level, side + 1),
        c = ring(level + 1, side),
        d = ring(level + 1, side + 1);
      triangle(a, b, c);
      triangle(b, d, c);
    }
    triangle([0, -0.5, 0], ring(0, side + 1), ring(0, side));
    triangle([0, 0.5, 0], ring(2, side), ring(2, side + 1));
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const uv: number[] = [];
  for (let i = 0; i < positions.length; i += 3)
    uv.push(positions[i]! + 0.5, positions[i + 1]! + 0.5);
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
