import { Mesh } from 'three';
import { filterEquipmentMaps } from '../rendering/EquipmentSurface';
import {
  skinDefinitions,
  type WeaponSkin,
} from '@breakpoint/shared/weapons/loadouts';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const cache = new Map<string, Promise<GLTF>>();
type ModelSkin = {
  [Skin in WeaponSkin]: (typeof skinDefinitions)[Skin] extends { model: string }
    ? Skin
    : never;
}[WeaponSkin];

/** Parsed GLBs are shared across renderers. Each caller owns its mutable transforms and batches. */
export function weaponAsset(skin: ModelSkin): Promise<GLTF>;
export function weaponAsset(skin: WeaponSkin): Promise<GLTF> | undefined;
export function weaponAsset(skin: WeaponSkin): Promise<GLTF> | undefined {
  const definition = skinDefinitions[skin];
  if (!('model' in definition)) return undefined;
  const { model } = definition;
  let pending = cache.get(model);
  if (!pending) {
    const folder = `${import.meta.env.BASE_URL}models/`;
    pending = fetch(`${folder}${model}`)
      .then((response) => {
        if (!response.ok)
          throw new Error(`${model} returned HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) =>
        new GLTFLoader()
          .setMeshoptDecoder(MeshoptDecoder)
          .parseAsync(bytes, folder),
      )
      .then((asset) => {
        asset.scene.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          for (const material of Array.isArray(node.material)
            ? node.material
            : [node.material])
            filterEquipmentMaps(material);
        });
        return asset;
      })
      .catch((error: unknown) => {
        cache.delete(model);
        throw error;
      });
    cache.set(model, pending);
  }
  return pending;
}
