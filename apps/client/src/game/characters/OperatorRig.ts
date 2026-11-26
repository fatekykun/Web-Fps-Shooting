import {
  Bone,
  Group,
  Matrix4,
  Quaternion,
  SkinnedMesh,
  Sphere,
  Vector3,
  type Object3D,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { rigJoints, type JointName } from '@breakpoint/shared/character';
import type { TacticalSkeleton } from './TacticalSkeleton';

const joints = [
  ['Hips', 'pelvis'],
  ['Spine', 'spine'],
  ['Chest', 'chest'],
  ['Neck', 'neck'],
  ['Head', 'head'],
  ['UpperArm_L', 'leftUpperArm'],
  ['LowerArm_L', 'leftForearm'],
  ['Hand_L', 'leftWrist'],
  ['UpperArm_R', 'rightUpperArm'],
  ['LowerArm_R', 'rightForearm'],
  ['Hand_R', 'rightWrist'],
  ['UpperLeg_L', 'leftThigh'],
  ['LowerLeg_L', 'leftShin'],
  ['Foot_L', 'leftAnkle'],
  ['UpperLeg_R', 'rightThigh'],
  ['LowerLeg_R', 'rightShin'],
  ['Foot_R', 'rightAnkle'],
] as const satisfies readonly (readonly [string, JointName])[];
const bindings = joints.map(
  ([name, joint]) =>
    [name, rigJoints.findIndex(({ name }) => name === joint)] as const,
);
const facing = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

export function disposeOperatorSkeleton(root: Object3D): void {
  const skeletons = new Set<SkinningSkeleton>();
  root.traverse((node) => {
    if (node instanceof SkinnedMesh) skeletons.add(node.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
}
type SkinningSkeleton = SkinnedMesh['skeleton'];

/** Maps the same presentation joints used by the hit rig and weapon grip into the authored skin. */
export class OperatorRig {
  readonly root = new Group();
  private readonly bones: { target: Bone; source: number }[];
  private readonly inverse = new Matrix4();
  private readonly rotation = new Quaternion();

  constructor(template: Object3D) {
    const model = clone(template);
    model.quaternion.copy(facing);
    model.traverse((node) => {
      if (node instanceof SkinnedMesh)
        node.boundingSphere = new Sphere(new Vector3(0, 0.56, 0), 1.7);
    });
    this.bones = bindings.map(([name, source]) => {
      const target = model.getObjectByName(name);
      if (!(target instanceof Bone))
        throw new Error(`Missing operator joint ${name}`);
      return { target, source };
    });
    this.root.matrixAutoUpdate = false;
    this.root.add(model);
  }

  update(rig: TacticalSkeleton): void {
    this.root.matrix.copy(rig.root.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
    for (const { target, source } of this.bones) {
      const parent = target.parent!;
      parent.updateWorldMatrix(true, false);
      const desired = rig.bones[source]!.matrixWorld;
      target.position
        .setFromMatrixPosition(desired)
        .applyMatrix4(this.inverse.copy(parent.matrixWorld).invert());
      target.quaternion
        .setFromRotationMatrix(parent.matrixWorld)
        .invert()
        .multiply(this.rotation.setFromRotationMatrix(desired))
        .multiply(facing);
    }
    this.root.updateMatrixWorld(true);
  }

  dispose(): void {
    disposeOperatorSkeleton(this.root);
    this.root.removeFromParent();
  }
}
