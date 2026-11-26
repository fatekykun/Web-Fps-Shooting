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
import { NeonAmmoDisplay } from './NeonAmmoDisplay';
import { weaponMuzzles } from './WeaponMuzzles';
import type { WeaponSight } from './WeaponSights';

const body = 0;
const energy = 1;
const magazine = 2;
const optic = 4;
const lens = 5;

export class NeonBlade {
  readonly model = new Group();
  readonly reticle = new Group();
  readonly sight: NonNullable<WeaponSight['reticle']>;
  readonly adsPose: WeaponSight['ads'];
  readonly grips: { firing: Vector3; support: Vector3 };
  private readonly magazine = new Group();
  private readonly ammo = new NeonAmmoDisplay();
  private readonly armorMaterial = createReadableMaterial(
    { vertexColors: true },
    0.21,
  );
  private readonly glowMaterial = new MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
  });
  private readonly glassMaterial = new MeshBasicMaterial({
    color: 0x5390bd,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });

  static async load(signal: AbortSignal): Promise<NeonBlade> {
    const { scene } = await weaponAsset('neon-blade');
    signal.throwIfAborted();
    return new NeonBlade(scene);
  }

  private constructor(scene: Object3D) {
    this.model.name = 'neon-blade';
    this.reticle.name = 'neon-blade-reticle';
    this.model.visible = this.reticle.visible = false;
    const batches: BufferGeometry[][] = [[], [], [], [], [], []];
    try {
      scene.updateMatrixWorld(true);
      const required = (name: string) => {
        const node = scene.getObjectByName(name);
        if (!node) throw new Error(`Neon Blade is missing ${name}`);
        return node;
      };
      const point = (name: string) =>
        required(name).getWorldPosition(new Vector3());
      const offset = this.model.position
        .set(...weaponMuzzles.smg.firstPerson)
        .sub(point('Muzzle_Anchor'));
      const opticCenter = point('ADS_Optic_Center');
      const center = opticCenter.clone().add(offset);
      const eye = point('ADS_Alignment_Anchor').add(offset);
      this.sight = {
        center: [center.x, center.y, center.z],
        radius: 0.0017,
        halfWindow: [0.035, 0.022],
      };
      this.adsPose = { position: [-eye.x, -eye.y, -0.56], rotation: [0, 0, 0] };
      this.grips = {
        firing: point('Right_Hand_Anchor').add(offset),
        support: point('Left_Hand_Anchor').add(offset),
      };

      const displayAnchor = required('Ammo_Display_Anchor').clone(false);
      displayAnchor.add(this.ammo.mesh);
      this.model.add(this.magazine, displayAnchor);
      for (const part of scene.children) {
        if (part.name === 'Ammo_Display_Static_33') continue;
        part.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          const source = node.material as MeshStandardMaterial;
          const glowing =
            source.emissiveIntensity > 0 && source.emissive.getHex() !== 0;
          const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
          const tint = source.color.clone();
          let bucket = part.name.startsWith('Magazine') ? magazine : body;
          if (glowing) {
            bucket += energy;
            tint
              .multiplyScalar(0.42)
              .add(
                source.emissive
                  .clone()
                  .multiplyScalar(source.emissiveIntensity * 0.47),
              );
          }
          if (part.name === 'ADS_Reticle') {
            bucket = optic;
            geometry.translate(-opticCenter.x, -opticCenter.y, -opticCenter.z);
          } else if (part.name === 'ADS_Transparent_Lens') bucket = lens;
          const colors = new Float32Array(
            geometry.getAttribute('position').count * 3,
          );
          for (let i = 0; i < colors.length; i += 3) tint.toArray(colors, i);
          geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
          batches[bucket]!.push(geometry);
        });
      }
      for (const [bucket, geometries] of batches.entries()) {
        if (!geometries.length) continue;
        const geometry = mergeGeometries(geometries);
        if (!geometry)
          throw new Error('Neon Blade could not batch model geometry');
        if (bucket === optic)
          this.reticle.add(new Mesh(geometry, this.glowMaterial));
        else if (bucket === lens)
          this.model.add(new Mesh(geometry, this.glassMaterial));
        else
          (bucket >= magazine ? this.magazine : this.model).add(
            new Mesh(
              geometry,
              bucket % 2 ? this.glowMaterial : this.armorMaterial,
            ),
          );
      }
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const geometries of batches)
        for (const geometry of geometries) geometry.dispose();
    }
  }

  update(
    reload: number,
    magazine: number,
    capacity: number,
    time: number,
    reducedMotion: boolean,
  ): void {
    this.magazine.position.set(-0.065 * reload, -0.15 * reload, 0.035 * reload);
    this.magazine.rotation.z = -0.23 * reload;
    this.ammo.update(magazine, capacity, time, reducedMotion);
  }

  dispose(): void {
    this.ammo.dispose();
    this.model.removeFromParent();
    this.reticle.removeFromParent();
    for (const group of [this.model, this.reticle])
      group.traverse((node) => {
        if (node instanceof Mesh) node.geometry.dispose();
      });
    this.armorMaterial.dispose();
    this.glowMaterial.dispose();
    this.glassMaterial.dispose();
  }
}
