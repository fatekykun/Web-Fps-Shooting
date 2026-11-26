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
import { weaponAsset } from './WeaponAssets';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createReadableMaterial } from '../rendering/ReadableMaterial';
import { weaponMuzzles } from './WeaponMuzzles';
import type { ScopeAperture } from './SniperScope';
import type { WeaponSight } from './WeaponSights';

const scale = 0.36;
const shell = 0;
const glow = 1;
const cell = 2;

/** Batches the authored indexed meshes while keeping the reload cell independent. */
export class LotusLava {
  readonly model = new Group();
  readonly adsPose: WeaponSight['ads'];
  readonly aperture: ScopeAperture;
  readonly grips: { firing: Vector3; support: Vector3 };
  private readonly energyCell = new Group();
  private readonly armor = createReadableMaterial({ vertexColors: true }, 0.2);
  private readonly emission = new MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });

  static async load(signal: AbortSignal): Promise<LotusLava> {
    const { scene } = await weaponAsset('lotus-lava');
    signal.throwIfAborted();
    return new LotusLava(scene);
  }

  private constructor(scene: Object3D) {
    scene.updateMatrixWorld(true);
    const anchor = (name: string) => {
      const node = scene.getObjectByName(name);
      if (!node) throw new Error(`Lotus Lava is missing ${name}`);
      return node.getWorldPosition(new Vector3()).multiplyScalar(scale);
    };
    this.model.name = 'lotus-lava';
    this.model.visible = false;
    this.model.scale.setScalar(scale);
    const offset = this.model.position
      .set(...weaponMuzzles.sniper.firstPerson)
      .sub(anchor('muzzle_vfx'));
    const rear = anchor('ADS_HUD_anchor').add(offset);
    const eyeAnchor = anchor('ADS_anchor').add(offset);
    // Leave enough eye relief for the magnified image to take over the physical bore.
    const opening = 0.27 * scale;
    const eye = Math.min(
      -eyeAnchor.z,
      -rear.z - opening / (2 * 0.86 * Math.tan(Math.PI / 6)),
    );
    this.aperture = { eye, rear: rear.z, opening };
    this.adsPose = { position: [-rear.x, -rear.y, eye], rotation: [0, 0, 0] };
    this.grips = {
      firing: anchor('grip_anchor').add(offset),
      support: anchor('support_hand_anchor').add(offset),
    };

    const batches: BufferGeometry[][] = [[], [], []];
    try {
      scene.traverse((node) => {
        if (!(node instanceof Mesh) || node.name === 'ADS_reticle_optional')
          return;
        const source = node.material as MeshStandardMaterial;
        const illuminated = source.emissive.getHex() !== 0;
        const bucket = node.name.startsWith('energy_cell__')
          ? cell
          : illuminated
            ? glow
            : shell;
        const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
        const tint = source.color.clone();
        if (illuminated)
          tint
            .multiplyScalar(0.52)
            .add(
              source.emissive
                .clone()
                .multiplyScalar(source.emissiveIntensity * 0.52),
            );
        const colors = new Float32Array(
          geometry.getAttribute('position').count * 3,
        );
        for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
        geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
        batches[bucket]!.push(geometry);
      });
      for (const [index, geometries] of batches.entries()) {
        const geometry = mergeGeometries(geometries);
        if (!geometry)
          throw new Error('Lotus Lava could not batch model geometry');
        const parent = index === cell ? this.energyCell : this.model;
        parent.add(
          new Mesh(geometry, index === glow ? this.emission : this.armor),
        );
      }
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const geometries of batches)
        for (const geometry of geometries) geometry.dispose();
    }
    this.model.add(this.energyCell);
  }

  update(reload: number): void {
    this.energyCell.position.set(-0.12 * reload, -0.62 * reload, 0.2 * reload);
    this.energyCell.rotation.z = -0.17 * reload;
  }

  dispose(): void {
    this.model.removeFromParent();
    for (const part of [this.model, this.energyCell])
      for (const node of part.children)
        if (node instanceof Mesh) node.geometry.dispose();
    this.armor.dispose();
    this.emission.dispose();
  }
}
