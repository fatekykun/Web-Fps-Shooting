import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Object3D,
  Vector3,
  type Scene,
} from 'three';
import type { PublicPlayer } from '@breakpoint/shared/network';
import { RemoteInterpolation } from './RemoteInterpolation';
import { standingAnchor } from '@breakpoint/shared/avatar';
import {
  characterParts as parts,
  rigJoints,
} from '@breakpoint/shared/character';
import { TacticalSkeleton } from '../characters/TacticalSkeleton';
import { createTacticalGeometry } from '../characters/TacticalGeometry';
import { createReadableMaterial } from '../rendering/ReadableMaterial';
import { weaponMuzzles } from '../weapons/WeaponMuzzles';
import type { GunId, Vector3Like, WeaponId } from '@breakpoint/shared';
import { RemoteWeaponSkins } from './RemoteWeaponSkins';
import { operatorAsset } from '../characters/OperatorAssets';
import { OperatorRig } from '../characters/OperatorRig';
import type { ImportedOperator } from '@breakpoint/shared/operators';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

const colors = [
  0x87917a, 0x6b9ca8, 0x9f9676, 0x8d9386, 0x7e9274, 0x968373, 0x80969a,
  0xa49e88,
];
const chestJoint = rigJoints.findIndex(({ name }) => name === 'chest');
const rightWristJoint = rigJoints.findIndex(
  ({ name }) => name === 'rightWrist',
);
const palmOffset = new Matrix4().makeTranslation(0, -0.055, 0);
const weaponJoint = rigJoints.findIndex(({ name }) => name === 'weapon');

function avatarPalette(player: PublicPlayer) {
  const uniform =
    player.team === 'blue'
      ? 0x6b9ca8
      : player.team === 'orange'
        ? 0xa99174
        : colors[player.slot]!;
  return {
    uniform,
    vest: player.team === 'blue' ? 0x42666b : 0x57604a,
    skin: 0xc4a27e,
    glove: 0x303a34,
    boot: 0x29322e,
    metal: 0x46534f,
    visor: 0x789c9d,
    patch: uniform,
  };
}

export class RemotePlayers {
  private readonly meleeMatrix = new Matrix4();
  private readonly geometry = createTacticalGeometry();
  private readonly material = createReadableMaterial();
  private readonly mesh = new InstancedMesh(
    this.geometry,
    this.material,
    8 * parts.length,
  );
  private readonly rigs = Array.from(
    { length: 8 },
    () => new TacticalSkeleton(),
  );
  private readonly part = new Object3D();
  private readonly poses = Array.from({ length: 8 }, () => ({
    id: '',
    weapon: 'rifle' as WeaponId,
    muzzle: new Vector3(),
    aimPoint: new Vector3(),
    customBody: false,
  }));
  private readonly color = new Color();
  private readonly poseMatrix = new Matrix4();
  private readonly eliminationRig = new TacticalSkeleton();
  private readonly eliminated = new Map<string, number>();
  private count = 0;
  private readonly tints = new Uint32Array(8 * parts.length).fill(0xffffffff);
  private colorsChanged = false;
  private readonly skins: RemoteWeaponSkins;
  private readonly operatorModels = new Map<
    ImportedOperator,
    GLTF | undefined
  >();
  private readonly operators = new Map<
    number,
    { id: ImportedOperator; rig: OperatorRig }
  >();

  get playerCount(): number {
    return this.count / parts.length;
  }

  muzzleWorldPosition(id: string, weapon: GunId, out: Vector3): boolean {
    for (let i = 0; i < this.playerCount; i++) {
      const pose = this.poses[i]!;
      if (pose.id === id && pose.weapon === weapon) {
        out.copy(pose.muzzle);
        return true;
      }
    }
    return false;
  }

  aimPoint(id: string): Vector3 | undefined {
    for (let i = 0; i < this.playerCount; i++) {
      const pose = this.poses[i]!;
      if (pose.id === id)
        return pose.aimPoint.setFromMatrixPosition(
          this.rigs[i]!.bones[chestJoint]!.matrixWorld,
        );
    }
    return undefined;
  }

  captureEliminationPose(
    player: PublicPlayer,
    origin: Vector3Like,
    write: (matrix: Matrix4, tint: number) => void,
  ): void {
    if (player.alive) this.eliminated.set(player.id, player.life);
    const index = this.poses.findIndex(
      (pose, i) => i < this.playerCount && pose.id === player.id,
    );
    if (index < 0 || this.poses[index]!.customBody) {
      const rig = this.eliminationRig;
      rig.root.position.set(origin.x, origin.y, origin.z);
      rig.root.rotation.y = player.yaw;
      rig.update(player);
      const palette = avatarPalette(player);
      for (const definition of parts) {
        if (definition.joint === weaponJoint) continue;
        this.part.position.set(...definition.position);
        this.part.scale.set(...definition.size);
        this.part.updateMatrix();
        this.part.matrix.premultiply(rig.bones[definition.joint]!.matrixWorld);
        write(this.part.matrix, palette[definition.color]);
      }
      return;
    }
    const root = this.rigs[index]!.root.position;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]!.joint === weaponJoint) continue;
      const instance = index * parts.length + i;
      this.mesh.getMatrixAt(instance, this.poseMatrix);
      const elements = this.poseMatrix.elements;
      elements[12]! += origin.x - root.x;
      elements[13]! += origin.y - root.y;
      elements[14]! += origin.z - root.z;
      write(this.poseMatrix, this.tints[instance]!);
    }
  }

  clearEliminations(): void {
    this.eliminated.clear();
  }

  constructor(private readonly scene: Scene) {
    this.skins = new RemoteWeaponSkins(scene);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    // The pool moves across the entire arena, so do not keep a stale instance bounding sphere.
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(buffer: RemoteInterpolation | undefined, now: number): void {
    for (const { rig } of this.operators.values()) rig.root.visible = false;
    if (!buffer) this.clearOperators();
    this.skins.begin();
    this.count = 0;
    this.colorsChanged = false;
    buffer?.sample(now, this.write);
    this.mesh.count = this.count;
    this.skins.end();
    if (this.count) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.colorsChanged && this.mesh.instanceColor)
        this.mesh.instanceColor.needsUpdate = true;
    }
  }

  private readonly write = (player: PublicPlayer): void => {
    const eliminatedLife = this.eliminated.get(player.id);
    if (eliminatedLife !== undefined) {
      if (player.alive && player.life === eliminatedLife) return;
      this.eliminated.delete(player.id);
    }
    if (!player.alive) return;
    const rig = this.rigs[this.playerCount]!;
    rig.root.position.set(player.x, player.y - standingAnchor, player.z);
    rig.root.rotation.y = player.yaw;
    rig.update(player);
    const pose = this.poses[this.playerCount]!;
    pose.id = player.id;
    pose.weapon = player.weapon;
    const operator = this.updateOperator(player, rig);
    pose.customBody = !!operator;
    const melee = player.weapon === 'melee';
    const weaponMatrix =
      operator?.weaponMatrix ??
      (melee
        ? this.meleeMatrix
            .copy(rig.bones[rightWristJoint]!.matrixWorld)
            .multiply(palmOffset)
        : rig.bones[weaponJoint]!.matrixWorld);
    const tip =
      player.weapon === 'melee'
        ? undefined
        : weaponMuzzles[player.weapon].remote;
    if (tip) pose.muzzle.set(...tip).applyMatrix4(weaponMatrix);
    const palette = avatarPalette(player);
    const custom = this.skins.append(player.weapon, player.skin, weaponMatrix);
    for (const definition of parts) {
      this.part.position.set(...definition.position);
      this.part.scale.set(...definition.size);
      if (tip && definition.name === 'weapon-barrel') {
        this.part.position.set(tip[0], tip[1], (-0.27 + tip[2]) / 2);
        this.part.scale.z = -0.27 - tip[2];
      }
      this.part.updateMatrix();
      this.part.matrix.premultiply(
        definition.joint === weaponJoint
          ? weaponMatrix
          : rig.bones[definition.joint]!.matrixWorld,
      );
      const teamPatch =
        definition.name === 'unit-patch' && player.team !== 'none';
      if (
        definition.joint === weaponJoint
          ? melee || custom
          : pose.customBody && !teamPatch
      )
        this.part.matrix.makeScale(0, 0, 0);
      this.mesh.setMatrixAt(this.count, this.part.matrix);
      const tint =
        player.hitBlend && player.hitBlend > 0.3
          ? 0xe4b6a0
          : player.protected
            ? player.team === 'orange'
              ? 0xffd0a0
              : 0x9aedef
            : palette[definition.color];
      if (this.tints[this.count] !== tint) {
        this.tints[this.count] = tint;
        this.mesh.setColorAt(this.count, this.color.setHex(tint));
        this.colorsChanged = true;
      }
      this.count++;
    }
  };

  private updateOperator(
    player: PublicPlayer,
    tactical: TacticalSkeleton,
  ): OperatorRig | undefined {
    const id = player.operator;
    const previous = this.operators.get(player.slot);
    if (previous && previous.id !== id) {
      previous.rig.dispose();
      this.operators.delete(player.slot);
    }
    if (!id || id === 'standard') return undefined;
    if (!this.operatorModels.has(id)) {
      this.operatorModels.set(id, undefined);
      void operatorAsset(id).then((asset) => {
        if (asset) this.operatorModels.set(id, asset);
      });
    }
    const asset = this.operatorModels.get(id);
    if (!asset) return undefined;
    let rig = this.operators.get(player.slot)?.rig;
    if (!rig) {
      try {
        rig = new OperatorRig(asset.scene);
      } catch {
        this.operatorModels.set(id, undefined);
        return undefined;
      }
      this.operators.set(player.slot, { id, rig });
      this.scene.add(rig.root);
    }
    rig.update(tactical, player);
    rig.root.visible = true;
    return rig;
  }

  private clearOperators(): void {
    for (const { rig } of this.operators.values()) rig.dispose();
    this.operators.clear();
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    for (const rig of this.rigs) rig.dispose();
    this.eliminationRig.dispose();
    this.skins.dispose();
    this.clearOperators();
    this.material.dispose();
  }
}
