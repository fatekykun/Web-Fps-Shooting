import {
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
  type BufferGeometry,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createReadableMaterial } from '../rendering/ReadableMaterial';
import { weaponMuzzles } from './WeaponMuzzles';
import type { WeaponSight } from './WeaponSights';

const scale = 0.9;

export class GloriousBlaze {
  readonly model = new Group();
  readonly adsPose: WeaponSight['ads'];
  readonly grips: { firing: Vector3; support: Vector3 };
  private readonly pump = new Group();
  private readonly supportRest: number;
  private readonly armor = createReadableMaterial(
    { vertexColors: true, emissiveIntensity: 0.24 },
    0.23,
  );
  private readonly energy = new MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });

  static async load(signal: AbortSignal): Promise<GloriousBlaze> {
    const response = await fetch(
      `${import.meta.env.BASE_URL}models/Glorious_Blaze_Shotgun.glb`,
      { signal },
    );
    if (!response.ok)
      throw new Error(`Glorious Blaze model returned HTTP ${response.status}`);
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();
    const { scene } = await new GLTFLoader().parseAsync(bytes, '');
    try {
      signal.throwIfAborted();
      return new GloriousBlaze(scene);
    } finally {
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<MeshStandardMaterial>();
      scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        geometries.add(node.geometry);
        materials.add(node.material as MeshStandardMaterial);
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  }

  private constructor(scene: Object3D) {
    scene.updateMatrixWorld(true);
    // Authored barrel exit, front fiber tip, pistol grip and pump grip in GLB coordinates.
    this.model.name = 'glorious-blaze';
    this.model.visible = false;
    this.model.scale.setScalar(scale);
    const offset = this.model.position
      .set(...weaponMuzzles.shotgun.firstPerson)
      .sub(new Vector3(0, 0.0234, -0.6816).multiplyScalar(scale));
    const point = (y: number, z: number) =>
      new Vector3(0, y, z).multiplyScalar(scale).add(offset);
    this.adsPose = {
      position: [0, -point(0.2352, -0.556).y, -0.62],
      rotation: [0, 0, 0],
    };
    this.grips = { firing: point(-0.106, 0.23), support: point(-0.061, -0.24) };
    this.supportRest = this.grips.support.z;
    this.model.add(this.pump);

    const sleeve = scene.getObjectByName('Pump_Sleeve');
    const batches: BufferGeometry[][] = [[], [], [], []];
    try {
      if (!sleeve) throw new Error('Glorious Blaze is missing its pump sleeve');
      scene.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        const material = node.material as MeshStandardMaterial;
        const emissive =
          material.emissiveIntensity > 0.3 && material.emissive.getHex() !== 0;
        const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
        const tint = material.color.clone();
        if (emissive)
          tint
            .multiplyScalar(0.5)
            .add(
              material.emissive
                .clone()
                .multiplyScalar(material.emissiveIntensity * 0.48),
            );
        const colors = new Float32Array(
          geometry.getAttribute('position').count * 3,
        );
        for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        const batch = (node.parent === sleeve ? 2 : 0) + (emissive ? 1 : 0);
        batches[batch]!.push(geometry);
      });
      for (const [index, parts] of batches.entries()) {
        if (!parts.length) continue;
        const geometry = mergeGeometries(parts);
        if (!geometry)
          throw new Error('Glorious Blaze could not batch the model geometry');
        (index >= 2 ? this.pump : this.model).add(
          new Mesh(geometry, index % 2 ? this.energy : this.armor),
        );
      }
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const parts of batches) for (const part of parts) part.dispose();
    }
  }

  update(shotAge: number, motion: number): void {
    const cycle = Math.max(0, Math.min(1, (shotAge - 0.19) / 0.55));
    const travel = Math.sin(Math.PI * cycle) * 0.11 * motion;
    this.pump.position.z = travel / scale;
    this.grips.support.z = this.supportRest + travel;
  }

  dispose(): void {
    this.model.removeFromParent();
    this.model.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
    this.armor.dispose();
    this.energy.dispose();
  }
}
