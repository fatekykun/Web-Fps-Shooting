import {
  Box3,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  parseEquipment,
  type Equipment,
  type WeaponSkin,
} from '@breakpoint/shared/weapons/loadouts';
import type { WeaponId } from '@breakpoint/shared';
import { WeaponViewmodel } from '../weapons/WeaponViewmodel';
import { weaponAsset } from '../weapons/WeaponAssets';
import { weaponMuzzles } from '../weapons/WeaponMuzzles';

const muzzleAnchors: Partial<Record<WeaponSkin, string>> = {
  'memento-mori': 'FX_Muzzle_Anchor',
  'lotus-lava': 'muzzle_vfx',
  'neon-blade': 'Muzzle_Anchor',
};

/** One pool per visible finish. Character pose and skin geometry have separate lifetimes. */
export class RemoteWeaponSkins {
  private readonly models = new Map<
    WeaponSkin,
    readonly InstancedMesh[] | undefined
  >();
  private molten?: WeaponViewmodel;
  private disposed = false;

  constructor(private readonly scene: Scene) {}

  begin(): void {
    for (const meshes of this.models.values())
      if (meshes) for (const mesh of meshes) mesh.count = 0;
  }

  append(
    weapon: WeaponId,
    skin: WeaponSkin | undefined,
    pose: Matrix4,
  ): boolean {
    if (!skin || skin === 'standard') return false;
    if (!this.models.has(skin)) {
      const equipment = parseEquipment({ weapon, skin });
      if (!equipment) return false;
      this.models.set(skin, undefined);
      void this.load(equipment).catch(() => {});
    }
    const meshes = this.models.get(skin);
    if (!meshes?.length) return false;
    for (const mesh of meshes) mesh.setMatrixAt(mesh.count++, pose);
    return true;
  }

  end(): void {
    for (const meshes of this.models.values())
      if (meshes)
        for (const mesh of meshes) {
          mesh.visible = mesh.count > 0;
          if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;
        }
  }

  private async load({ weapon, skin }: Equipment): Promise<void> {
    const asset = await weaponAsset(skin);
    if (this.disposed) return;
    let source: Object3D | undefined = asset?.scene;
    if (!source && skin === 'cinder-wyrm') {
      this.molten = new WeaponViewmodel();
      source = this.molten.showcaseModel(weapon, true);
    }
    if (!source) return;
    source.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(source);
    const anchorName = muzzleAnchors[skin];
    const end =
      (anchorName
        ? source.getObjectByName(anchorName)?.getWorldPosition(new Vector3())
        : undefined) ??
      (skin === 'glorious-blaze'
        ? new Vector3(0, 0.0234, -0.6816)
        : new Vector3(...weaponMuzzles[weapon].firstPerson));
    const tip = new Vector3(...weaponMuzzles[weapon].remote);
    const length = Math.max(0.01, bounds.max.z - bounds.min.z);
    const scale = (Math.abs(tip.z) + 0.13) / length;
    const normalized = new Matrix4()
      .makeRotationY(skin === 'memento-mori' ? Math.PI : 0)
      .scale(new Vector3(scale, scale, scale));
    normalized.setPosition(tip.sub(end.applyMatrix4(normalized)));
    const groups = new Map<
      string,
      { material: Material; geometry: BufferGeometry[] }
    >();
    const pieces = new Matrix4();
    const instance = new Matrix4();
    source.traverse((node) => {
      if (
        !(node instanceof Mesh) ||
        Array.isArray(node.material) ||
        !node.visible
      )
        return;
      let ancestor: Object3D | null = node;
      while (ancestor && ancestor !== source) {
        if (
          ancestor.name === 'Ammo_Display_Static_33' ||
          ancestor.name === 'ADS_reticle_optional'
        )
          return;
        ancestor = ancestor.parent;
      }
      const count = node instanceof InstancedMesh ? node.count : 1;
      if (count === 0) return;
      const material = node.material;
      const key = `${material.id}/${Object.keys(node.geometry.attributes).sort().join(',')}`;
      let group = groups.get(key);
      if (!group) {
        group = { material, geometry: [] };
        groups.set(key, group);
      }
      pieces.multiplyMatrices(normalized, node.matrixWorld);
      for (let index = 0; index < count; index++) {
        const geometry = node.geometry.index
          ? node.geometry.toNonIndexed()
          : node.geometry.clone();
        if (node instanceof InstancedMesh) {
          node.getMatrixAt(index, instance);
          geometry.applyMatrix4(instance);
        }
        group.geometry.push(geometry.applyMatrix4(pieces));
      }
    });
    const meshes: InstancedMesh[] = [];
    for (const { material, geometry } of groups.values()) {
      const joined = mergeGeometries(geometry);
      for (const piece of geometry) piece.dispose();
      if (!joined) continue;
      const mesh = new InstancedMesh(joined, material, 8);
      mesh.name = `remote-weapon-${skin}`;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.count = 0;
      meshes.push(mesh);
      this.scene.add(mesh);
    }
    this.models.set(skin, meshes);
  }

  dispose(): void {
    this.disposed = true;
    for (const meshes of this.models.values())
      if (meshes)
        for (const mesh of meshes) {
          mesh.removeFromParent();
          mesh.geometry.dispose();
          mesh.dispose();
        }
    this.molten?.dispose();
    this.models.clear();
  }
}
