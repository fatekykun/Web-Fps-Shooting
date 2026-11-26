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

function createBatchMaterial(
  source: MeshStandardMaterial,
): MeshStandardMaterial {
  const material = source.clone();
  material.color.set(0xffffff);
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 operatorSurface;\nvarying vec2 vOperatorSurface;',
      )
      .replace(
        '#include <color_vertex>',
        '#include <color_vertex>\nvOperatorSurface = operatorSurface;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vOperatorSurface;',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = vOperatorSurface.x;',
      )
      .replace(
        '#include <metalnessmap_fragment>',
        '#include <metalnessmap_fragment>\nmetalnessFactor = vOperatorSurface.y;',
      )
      .replace(
        '#include <opaque_fragment>',
        `float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
        outgoingLight += diffuseColor.rgb * 0.12 * rim * rim * rim;
        #include <opaque_fragment>`,
      );
  };
  return material;
}

/** Batch the operators' opaque primitives while keeping their authored surface values. */
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
    const key = `${source.side}:${source.map?.uuid ?? ''}`;
    let group = groups.get(key);
    if (!group) {
      group = { source, pieces: [] };
      groups.set(key, group);
    }
    const piece = mesh.geometry.clone();
    const original = piece.getAttribute('color');
    const count = piece.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const surface = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      color.copy(source.color);
      if (original) {
        color.r *= original.getX(i);
        color.g *= original.getY(i);
        color.b *= original.getZ(i);
      }
      color.toArray(colors, i * 3);
      surface[i * 2] = source.roughness;
      surface[i * 2 + 1] = source.metalness;
    }
    piece.setAttribute('color', new BufferAttribute(colors, 3));
    piece.setAttribute('operatorSurface', new BufferAttribute(surface, 2));
    group.pieces.push(piece);
  }
  const batches: SkinnedMesh[] = [];
  for (const { source, pieces } of groups.values()) {
    const combined = mergeGeometries(pieces);
    for (const piece of pieces) piece.dispose();
    if (!combined) continue;
    const material = createBatchMaterial(source);
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
