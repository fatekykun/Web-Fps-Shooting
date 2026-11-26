import { Mesh, type BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Hilt center in the glove's local space. X runs from wrist to knuckles.
export const meleeGrip = { across: 0.058, rise: 0.032, depth: 0.031 };

export interface GloveGeometries {
  grip: BufferGeometry;
  open: BufferGeometry;
}

let pending: Promise<GloveGeometries> | undefined;

/** Both wrists share immutable, prebuilt geometry. Each viewmodel owns its finish. */
export function meleeGloveAsset(): Promise<GloveGeometries> {
  if (!pending) {
    const folder = `${import.meta.env.BASE_URL}models/`;
    pending = fetch(`${folder}first_person_gloves.glb`)
      .then((response) => {
        if (!response.ok)
          throw new Error(`Glove asset returned HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((bytes) => new GLTFLoader().parseAsync(bytes, folder))
      .then(({ scene }) => {
        const grip = scene.getObjectByName('Grip');
        const open = scene.getObjectByName('Open');
        if (!(grip instanceof Mesh) || !(open instanceof Mesh)) {
          throw new Error('Glove asset is missing a grip or open hand.');
        }
        return { grip: grip.geometry, open: open.geometry };
      })
      .catch((error: unknown) => {
        pending = undefined;
        throw error;
      });
  }
  return pending;
}
