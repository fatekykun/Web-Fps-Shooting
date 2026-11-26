import {
  BufferAttribute,
  Color,
  MeshStandardMaterial,
  SkinnedMesh,
  type BufferGeometry,
} from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { operators, type ImportedOperator } from '@breakpoint/shared/operators';

const assets = new Map<ImportedOperator, Promise<GLTF | undefined>>();

/** Combine primitives that share a rig. Bake their tints while retaining the face texture. */
function batch(asset: GLTF): GLTF {
  const meshes: SkinnedMesh<BufferGeometry, MeshStandardMaterial>[] = [];
  asset.scene.traverse((node) => {
    if (
      node instanceof SkinnedMesh &&
      node.material instanceof MeshStandardMaterial
    )
      meshes.push(node);
  });
  const first = meshes[0];
  if (
    !first ||
    !meshes.every(
      (mesh) =>
        mesh.parent === first.parent && mesh.skeleton === first.skeleton,
    )
  )
    return asset;
  const groups = new Map<
    string,
    { source: MeshStandardMaterial; pieces: BufferGeometry[] }
  >();
  const color = new Color();
  for (const mesh of meshes) {
    const source = mesh.material;
    const key =
      source.map?.uuid ?? (source.metalness > 0.25 ? 'metal' : 'matte');
    let group = groups.get(key);
    if (!group) {
      group = { source, pieces: [] };
      groups.set(key, group);
    }
    const piece = mesh.geometry.clone();
    const original = piece.getAttribute('color');
    const colors = new Float32Array(piece.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length / 3; i++) {
      color.copy(source.color);
      if (original) {
        color.r *= original.getX(i);
        color.g *= original.getY(i);
        color.b *= original.getZ(i);
      }
      color.toArray(colors, i * 3);
    }
    piece.setAttribute('color', new BufferAttribute(colors, 3));
    group.pieces.push(piece);
  }
  const batches: SkinnedMesh[] = [];
  for (const { source, pieces } of groups.values()) {
    const combined = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    if (!combined) continue;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      map: source.map,
      roughness: source.roughness,
      metalness: source.metalness,
      emissive: 0x15191c,
      emissiveIntensity: 0.2,
    });
    const mesh = new SkinnedMesh(combined, material);
    mesh.copy(first, false);
    mesh.geometry = combined;
    mesh.material = material;
    mesh.bind(first.skeleton, first.bindMatrix);
    batches.push(mesh);
  }
  if (batches.length !== groups.size) {
    for (const mesh of batches) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    return asset;
  }
  first.parent!.add(...batches);
  for (const mesh of meshes) {
    mesh.removeFromParent();
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  return asset;
}

export function operatorAsset(id: ImportedOperator): Promise<GLTF | undefined> {
  let asset = assets.get(id);
  if (!asset) {
    asset = new GLTFLoader()
      .loadAsync(`${import.meta.env.BASE_URL}models/${operators[id].model}`)
      .then(batch)
      .catch(() => {
        assets.delete(id);
        return undefined;
      });
    assets.set(id, asset);
  }
  return asset;
}
