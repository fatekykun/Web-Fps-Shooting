import { Bone, Group, Skeleton } from 'three';
import {
  createJointPoses,
  poseRigJoints,
  rigJoints,
  type CharacterPose,
} from '@breakpoint/shared/character';

/** Rigid skinning: each instanced segment is bound 100% to its named joint. */
export class TacticalSkeleton {
  readonly root = new Group();
  readonly bones = rigJoints.map((joint) => {
    const bone = new Bone();
    bone.name = joint.name;
    return bone;
  });
  readonly skeleton: Skeleton;
  private readonly locals = createJointPoses();

  constructor() {
    rigJoints.forEach((joint, index) =>
      (joint.parent < 0 ? this.root : this.bones[joint.parent]!).add(
        this.bones[index]!,
      ),
    );
    this.update({ pitch: 0, halfHeight: 0.55 });
    this.skeleton = new Skeleton(this.bones);
  }

  update(pose: CharacterPose): void {
    poseRigJoints(pose, this.locals);
    for (let i = 0; i < this.bones.length; i++) {
      const local = this.locals[i]!,
        bone = this.bones[i]!;
      bone.position.set(local.x, local.y, local.z);
      bone.rotation.set(local.rx, local.ry, local.rz, 'XYZ');
    }
    this.root.updateMatrixWorld(true);
  }

  dispose(): void {
    this.skeleton.dispose();
    this.root.clear();
  }
}
