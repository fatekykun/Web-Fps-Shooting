import {
  Bone,
  Box3,
  Group,
  Matrix4,
  Quaternion,
  SkinnedMesh,
  Sphere,
  Vector3,
  type Object3D,
} from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import {
  rigJoints,
  type CharacterPose,
  type JointName,
} from '@breakpoint/shared/character';
import type { TacticalSkeleton } from './TacticalSkeleton';

const bodyJoints = [
  ['Hips', 'pelvis'],
  ['Spine', 'spine'],
  ['Chest', 'chest'],
  ['Neck', 'neck'],
  ['Head', 'head'],
  ['UpperLeg_L', 'leftThigh'],
  ['LowerLeg_L', 'leftShin'],
  ['Foot_L', 'leftAnkle'],
  ['UpperLeg_R', 'rightThigh'],
  ['LowerLeg_R', 'rightShin'],
  ['Foot_R', 'rightAnkle'],
] as const;

const up = new Vector3(0, 1, 0);
const right = new Vector3(1, 0, 0);
// The authored models face +Z. The game uses -Z as forward.
const facing = new Quaternion().setFromAxisAngle(up, Math.PI);
const tacticalHipHeight = rigJoints[0].position[1];
const tacticalPalm = new Vector3(0, -0.055, 0);
const weaponJoint = rigJoints.findIndex(({ name }) => name === 'weapon');
// Fit the standing silhouette to the shared character's head and floor anchor.
const standingHeight = 1.7;
const restBounds = new WeakMap<Object3D, Box3>();

function bind(model: Object3D, name: string, joint: JointName) {
  const bone = operatorBone(model, name);
  return {
    bone,
    source: rigJoints.findIndex((entry) => entry.name === joint),
    restRotation: bone.getWorldQuaternion(new Quaternion()),
  };
}
type Binding = ReturnType<typeof bind>;

function operatorBone(model: Object3D, name: string): Bone {
  const bone = model.getObjectByName(name);
  if (!(bone instanceof Bone))
    throw new Error(`Missing operator joint ${name}`);
  return bone;
}

function bindArm(model: Object3D, side: 'left' | 'right', scale: number) {
  const left = side === 'left';
  const suffix = left ? 'L' : 'R';
  const upper = bind(model, `UpperArm_${suffix}`, `${side}UpperArm`);
  const lower = bind(model, `LowerArm_${suffix}`, `${side}Forearm`);
  const hand = bind(model, `Hand_${suffix}`, `${side}Wrist`);
  const fingers: { bone: Bone; rest: Quaternion; curl: number }[] = [];
  hand.bone.traverse((bone) => {
    if (!(bone instanceof Bone) || !/_(02|03)$/.test(bone.name)) return;
    const index = bone.name.startsWith('Index');
    const thumb = bone.name.startsWith('Thumb');
    const angle = thumb ? 0.26 : !left && index ? 0.3 : 0.77;
    fingers.push({
      bone,
      rest: bone.quaternion.clone(),
      curl: angle * (left ? -1 : 1),
    });
  });
  return {
    upper,
    lower,
    hand,
    upperLength: lower.bone.position.length() * scale,
    lowerLength: hand.bone.position.length() * scale,
    upperDirection: lower.bone.position.clone().normalize(),
    lowerDirection: hand.bone.position.clone().normalize(),
    palm: new Vector3(left ? 0.018 : -0.018, -0.048, 0).multiplyScalar(scale),
    wrist: new Vector3(),
    rotation: new Quaternion(),
    fingers,
  };
}
type Arm = ReturnType<typeof bindArm>;

function bindBoot(model: Object3D, side: 'L' | 'R', floor: number) {
  const foot = operatorBone(model, `Foot_${side}`);
  const toes = operatorBone(model, `Toes_${side}`);
  const depth = toes.position.z;
  // Approximate heel and toe contacts in the authored boot's local space.
  const sole = floor - foot.getWorldPosition(new Vector3()).y;
  return {
    foot,
    heel: new Vector3(0, sole, -0.45 * depth),
    toe: new Vector3(0, sole, 1.35 * depth),
  };
}

export function disposeOperatorSkeleton(root: Object3D): void {
  const skeletons = new Set<SkinnedMesh['skeleton']>();
  root.traverse((node) => {
    if (node instanceof SkinnedMesh) skeletons.add(node.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
}

/** Retarget synchronized poses onto each GLB's original bone hierarchy. */
export class OperatorRig {
  readonly root = new Group();
  readonly weaponMatrix = new Matrix4();
  private readonly model: Object3D;
  private readonly hips: Bone;
  private readonly restHips: Vector3;
  private readonly bindings: Binding[];
  private readonly arms: [Arm, Arm];
  private readonly boots: ReturnType<typeof bindBoot>[];
  private readonly scale: number;
  private readonly floor: number;
  private readonly rotation = new Quaternion();
  private readonly parentRotation = new Quaternion();
  private readonly swing = new Quaternion();
  private readonly weaponBack = new Vector3();
  private readonly origin = new Vector3();
  private readonly elbow = new Vector3();
  private readonly wrist = new Vector3();
  private readonly axis = new Vector3();
  private readonly pole = new Vector3();
  private readonly scratch = new Vector3();

  constructor(template: Object3D) {
    let bounds = restBounds.get(template);
    if (!bounds) {
      bounds = new Box3().setFromObject(template);
      restBounds.set(template, bounds);
    }
    this.scale = standingHeight / (bounds.max.y - bounds.min.y);
    this.floor = -bounds.min.y * this.scale;

    const model = (this.model = clone(template));
    model.updateMatrixWorld(true);
    this.bindings = bodyJoints.map(([name, joint]) => bind(model, name, joint));
    this.hips = this.bindings[0]!.bone;
    this.restHips = this.hips.position.clone();
    this.arms = [
      bindArm(model, 'left', this.scale),
      bindArm(model, 'right', this.scale),
    ];
    this.boots = [
      bindBoot(model, 'L', bounds.min.y),
      bindBoot(model, 'R', bounds.min.y),
    ];

    model.quaternion.copy(facing);
    model.scale.setScalar(this.scale);
    model.traverse((node) => {
      if (node instanceof SkinnedMesh)
        node.boundingSphere = new Sphere(new Vector3(0, 0.56, 0), 1.7);
    });
    this.root.matrixAutoUpdate = false;
    this.root.add(model);
  }

  update(rig: TacticalSkeleton, pose: CharacterPose): void {
    this.root.matrix.copy(rig.root.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;
    const slide =
      pose.slideBlend ??
      Number(pose.movement === 'sliding' || pose.movement === 'backsliding');
    const air = pose.airBlend ?? 0;
    const dive = pose.diveBlend ?? Number(pose.movement === 'diving');
    const prone = pose.proneBlend ?? Number(pose.movement === 'prone');
    const phase = pose.gaitPhase ?? 0;
    const step =
      (pose.gaitAmount ?? 0) * (1 - slide) * (1 - dive) * (1 - prone);
    const pelvis = rig.bones[0]!.position;
    this.model.position.y = this.floor;
    // Move the pelvis from its own bind origin, leaving all other joint
    // translations intact. Deep poses sit closer to the tactical pelvis.
    this.hips.position
      .copy(this.restHips)
      .addScaledVector(
        this.scratch.set(
          -pelvis.x - Math.sin(phase) * step * 0.02,
          pelvis.y - tacticalHipHeight - Math.max(slide, dive, prone) * 0.09,
          -pelvis.z,
        ),
        1 / this.scale,
      );

    for (const binding of this.bindings) {
      this.sourceRotation(rig, binding);
      this.setWorldRotation(binding.bone, this.rotation);
    }
    // Roll through the planted foot and lift the toe into the next step.
    for (const [index, { foot }] of this.boots.entries()) {
      const toeRoll = Math.sin(phase - 0.8 + index * Math.PI) * step * 0.25;
      foot.rotateX(toeRoll);
    }
    this.groundBoots((1 - air) * (1 - dive) * (1 - prone));

    const reload =
      (pose.reloadBlend ?? 0) * Math.sin(Math.PI * (pose.reloadProgress ?? 0));
    const carry =
      (pose.carryBlend ?? pose.sprintBlend ?? 0) *
      (1 - (pose.aimBlend ?? 0)) ** 3 *
      (1 - reload);
    const [left, right] = this.arms;
    this.prepareWrist(rig, left);
    this.prepareWrist(rig, right);
    this.weaponMatrix.copy(rig.bones[weaponJoint]!.matrixWorld);
    this.weaponBack.set(0, 0, 1).transformDirection(this.weaponMatrix);
    // Slide the cosmetic weapon along its bore to give the shorter authored
    // arms a grip while keeping its aim direction and line of fire aligned.
    const setback = Math.min(
      0.18,
      Math.max(this.gripSetback(right), this.gripSetback(left) * (1 - carry)),
    );
    this.weaponMatrix.setPosition(
      this.scratch
        .setFromMatrixPosition(this.weaponMatrix)
        .addScaledVector(this.weaponBack, setback),
    );
    left.wrist.addScaledVector(this.weaponBack, setback);
    right.wrist.addScaledVector(this.weaponBack, setback);
    this.poseArm(rig, left, carry, 1 - reload * 0.75 - carry * 0.7);
    this.poseArm(rig, right, 0, 1);
    this.root.updateMatrixWorld(true);
  }

  private sourceRotation(
    rig: TacticalSkeleton,
    { source, restRotation }: Binding,
  ) {
    return this.rotation
      .setFromRotationMatrix(rig.bones[source]!.matrixWorld)
      .multiply(facing)
      .multiply(restRotation);
  }

  private setWorldRotation(bone: Bone, rotation: Quaternion): void {
    bone.parent!.getWorldQuaternion(this.parentRotation);
    bone.quaternion.copy(this.parentRotation.invert()).multiply(rotation);
  }

  private groundBoots(weight: number): void {
    if (weight <= 0) return;
    let bottom = Infinity;
    for (const { foot, heel, toe } of this.boots) {
      foot.updateWorldMatrix(true, false);
      bottom = Math.min(
        bottom,
        this.scratch.copy(heel).applyMatrix4(foot.matrixWorld).y,
        this.scratch.copy(toe).applyMatrix4(foot.matrixWorld).y,
      );
    }
    const displacement = this.root.matrixWorld.elements[13]! - bottom;
    this.model.position.y +=
      Math.max(-0.14, Math.min(0.17, displacement)) * weight;
  }

  private prepareWrist(rig: TacticalSkeleton, arm: Arm): void {
    const { hand, palm, rotation, wrist } = arm;
    rotation.copy(this.sourceRotation(rig, hand));
    wrist
      .copy(tacticalPalm)
      .applyMatrix4(rig.bones[hand.source]!.matrixWorld)
      .sub(this.scratch.copy(palm).applyQuaternion(rotation));
  }

  private gripSetback(arm: Arm): number {
    const delta = this.axis.subVectors(
      arm.wrist,
      arm.upper.bone.getWorldPosition(this.origin),
    );
    // Leave enough flex for an elbow bend at full extension.
    const reach = arm.upperLength + arm.lowerLength - 0.018;
    const along = delta.dot(this.weaponBack);
    const acrossSquared = delta.lengthSq() - along * along;
    return Math.max(
      0,
      -along - Math.sqrt(Math.max(0, reach * reach - acrossSquared)),
    );
  }

  private poseArm(
    rig: TacticalSkeleton,
    arm: Arm,
    carry: number,
    grip: number,
  ): void {
    const { upper, lower, hand, upperLength, lowerLength } = arm;
    this.wrist.copy(arm.wrist);

    // The support hand swings from its authored shoulder when sprinting.
    if (carry > 0) {
      this.setWorldRotation(upper.bone, this.sourceRotation(rig, upper));
      this.setWorldRotation(lower.bone, this.sourceRotation(rig, lower));
      this.wrist.lerp(hand.bone.getWorldPosition(this.scratch), carry);
    }

    upper.bone.getWorldPosition(this.origin);
    this.axis.subVectors(this.wrist, this.origin);
    const reach = this.axis.length();
    this.axis.multiplyScalar(1 / Math.max(reach, 1e-6));
    if (reach < 1e-6) this.axis.set(0, -1, 0);
    const distance = Math.max(
      Math.abs(upperLength - lowerLength) + 0.001,
      Math.min(upperLength + lowerLength - 0.005, reach),
    );
    this.pole
      .setFromMatrixPosition(rig.bones[lower.source]!.matrixWorld)
      .sub(this.origin)
      .addScaledVector(this.axis, -this.pole.dot(this.axis));
    if (this.pole.lengthSq() < 1e-8)
      this.pole.crossVectors(
        this.axis,
        Math.abs(this.axis.y) < 0.9 ? up : right,
      );
    this.pole.normalize();
    // Solve the elbow with the model's actual upper-arm and forearm lengths.
    const along =
      (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
    this.elbow
      .copy(this.axis)
      .multiplyScalar(along)
      .addScaledVector(
        this.pole,
        Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)),
      );
    this.wrist.copy(this.axis).multiplyScalar(distance).sub(this.elbow);
    this.aimLimb(rig, upper, arm.upperDirection, this.elbow);
    this.aimLimb(rig, lower, arm.lowerDirection, this.wrist);
    this.setWorldRotation(hand.bone, arm.rotation);

    for (const { bone, rest, curl } of arm.fingers) {
      bone.quaternion.copy(rest);
      bone.rotateZ(curl * Math.max(0.12, grip));
    }
  }

  private aimLimb(
    rig: TacticalSkeleton,
    binding: Binding,
    bindDirection: Vector3,
    direction: Vector3,
  ): void {
    this.sourceRotation(rig, binding);
    this.scratch.copy(bindDirection).applyQuaternion(this.rotation);
    this.swing.setFromUnitVectors(this.scratch, direction.normalize());
    this.setWorldRotation(binding.bone, this.rotation.premultiply(this.swing));
  }

  dispose(): void {
    disposeOperatorSkeleton(this.root);
    this.root.removeFromParent();
  }
}
