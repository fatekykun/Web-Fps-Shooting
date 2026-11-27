import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Reuse vertices across bevel triangles while retaining normal and UV seams. */
export function createIndexedRoundedBox(radius: number) {
  return mergeVertices(new RoundedBoxGeometry(1, 1, 1, 1, radius), 1e-7);
}
