import {
  Bone,
  Color,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Skeleton,
  Vector3,
  type Material,
} from 'three';
import { createTacticalGeometry } from './TacticalGeometry';
import { sprintArmPose } from '@breakpoint/shared/character';

const down = new Vector3(0, -1, 0);
const identity = new Quaternion();
const upperLength = 0.32,
  foreLength = 0.32;

/** Grip IK blends to a camera-space free support arm during sprint carry. */
export class FirstPersonArms {
  readonly root = new Group();
  readonly bones: Bone[] = [];
  readonly skeleton: Skeleton;
  private readonly geometry = createTacticalGeometry();
  private readonly mesh: InstancedMesh;
  private readonly transform = new Matrix4();
  private readonly scale = new Vector3();
  private readonly direction = new Vector3();
  private readonly bend = new Vector3();
  private readonly elbow = new Vector3();
  private readonly target = new Vector3();
  private readonly upperRotation = new Quaternion();
  private readonly foreRotation = new Quaternion();
  private readonly color = new Color();
  private readonly inverse = new Matrix4();
  private readonly freeShoulder = new Vector3();
  private readonly freeRotation = new Quaternion();
  private readonly parentRotation = new Quaternion();
  private readonly freeEuler = new Euler();
  private colorsReady = false;

  constructor(material: Material) {
    this.root.name = 'first-person-arms';
    for (const side of ['left', 'right']) {
      const upper = new Bone(),
        forearm = new Bone(),
        wrist = new Bone();
      upper.name = `${side}UpperArm`;
      forearm.name = `${side}Forearm`;
      wrist.name = `${side}Wrist`;
      upper.add(forearm);
      forearm.add(wrist);
      this.root.add(upper);
      forearm.position.y = -upperLength;
      wrist.position.y = -foreLength;
      this.bones.push(upper, forearm, wrist);
    }
    this.mesh = new InstancedMesh(this.geometry, material, 16);
    this.mesh.name = 'tactical-arms-mesh';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.root.add(this.mesh);
    this.update(0);
    this.skeleton = new Skeleton(this.bones);
  }

  update(
    reload: number,
    brace = 0,
    carry = 0,
    phase = 0,
    motion = 1,
    grips?: { firing: Vector3; support: Vector3 },
  ): void {
    this.root.updateWorldMatrix(true, false);
    this.inverse.copy(this.root.matrixWorld).invert();
    this.root.getWorldQuaternion(this.parentRotation).invert();
    const free = sprintArmPose(phase, motion);
    let instance = 0;
    for (let side = 0; side < 2; side++) {
      const left = side === 0;
      const upper = this.bones[side * 3]!,
        forearm = this.bones[side * 3 + 1]!,
        wrist = this.bones[side * 3 + 2]!;
      const shoulderLead =
        left && grips ? Math.min(0, grips.support.z + 0.17) : 0;
      upper.position.set(
        left ? -0.26 - brace * 0.01 : 0.26 + brace * 0.02,
        -0.35 - brace * 0.035,
        0.35 - brace * 0.015 + shoulderLead,
      );
      this.target.set(
        left ? -0.045 + reload * 0.08 : 0.045,
        left ? -0.075 - reload * 0.18 : -0.1,
        left ? -0.17 + reload * 0.2 : 0.12,
      );
      if (grips) {
        const grip = left ? grips.support : grips.firing;
        this.target.set(
          grip.x + (left ? -0.045 + reload * 0.08 : 0.045),
          grip.y - (left ? 0.018 + reload * 0.18 : 0),
          grip.z + (left ? reload * 0.2 : 0),
        );
      }
      this.direction.copy(this.target).sub(upper.position);
      const distance = Math.min(
        upperLength + foreLength - 0.0001,
        this.direction.length(),
      );
      this.direction.normalize();
      const along =
        (upperLength ** 2 - foreLength ** 2 + distance ** 2) / (2 * distance);
      const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
      this.bend
        .set(left ? -0.3 : 0.3, -1, 0)
        .addScaledVector(this.direction, -this.bend.dot(this.direction))
        .normalize();
      this.elbow
        .copy(upper.position)
        .addScaledVector(this.direction, along)
        .addScaledVector(this.bend, height);
      this.direction.copy(this.elbow).sub(upper.position).normalize();
      this.upperRotation.setFromUnitVectors(down, this.direction);
      upper.quaternion.copy(this.upperRotation);
      this.direction.copy(this.target).sub(this.elbow).normalize();
      this.foreRotation.setFromUnitVectors(down, this.direction);
      forearm.quaternion
        .copy(this.upperRotation)
        .invert()
        .multiply(this.foreRotation);
      wrist.quaternion.copy(this.foreRotation).invert();
      if (left) wrist.rotateZ(reload * 0.6);
      if (left && carry > 0) {
        // The free arm swings beside the body in camera space, independently
        // of the raised weapon. The firing arm keeps its existing grip IK.
        this.freeShoulder.set(-0.26, -0.2, -0.4).applyMatrix4(this.inverse);
        upper.position.lerp(this.freeShoulder, carry);
        this.freeRotation.setFromEuler(
          this.freeEuler.set(free.upperPitch, 0, free.upperRoll),
        );
        this.freeRotation.premultiply(this.parentRotation);
        upper.quaternion.slerp(this.freeRotation, carry);
        this.freeRotation.setFromEuler(
          this.freeEuler.set(free.elbowPitch, 0, 0),
        );
        forearm.quaternion.slerp(this.freeRotation, carry);
        this.freeRotation.setFromEuler(
          this.freeEuler.set(free.wristPitch, 0, 0),
        );
        wrist.quaternion.slerp(this.freeRotation, carry);
      }
      this.root.updateMatrixWorld(true);
      this.inverse.copy(this.root.matrixWorld).invert();
      const part = (
        bone: Bone,
        position: readonly [number, number, number],
        size: readonly [number, number, number],
        tint: number,
      ) => {
        this.transform.compose(
          this.target.set(...position),
          identity,
          this.scale.set(...size),
        );
        this.transform.premultiply(bone.matrixWorld);
        // Matrices are local to the weapon root, which supplies all ADS/recoil/carry motion.
        this.transform.premultiply(this.inverse);
        this.mesh.setMatrixAt(instance, this.transform);
        if (!this.colorsReady)
          this.mesh.setColorAt(instance, this.color.setHex(tint));
        instance++;
      };
      part(
        upper,
        [0, -upperLength / 2, 0],
        [0.125, upperLength, 0.14],
        0x6c7a58,
      );
      part(
        forearm,
        [0, -foreLength / 2, 0],
        [0.11, foreLength, 0.12],
        0x788567,
      );
      part(forearm, [0, -0.29, 0], [0.12, 0.075, 0.125], 0x424d3e);
      part(wrist, [0, -0.012, 0], [0.09, 0.1, 0.13], 0x384338);
      part(
        wrist,
        [left ? 0.042 : -0.042, 0.012, -0.015],
        [0.03, 0.055, 0.06],
        0x46503e,
      );
      for (let finger = 0; finger < 3; finger++)
        part(
          wrist,
          [-0.024 + finger * 0.024, -0.045, -0.025],
          [0.023, 0.045, 0.07],
          0x46503e,
        );
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!this.colorsReady && this.mesh.instanceColor)
      this.mesh.instanceColor.needsUpdate = true;
    this.colorsReady = true;
  }

  dispose(): void {
    this.mesh.dispose();
    this.geometry.dispose();
    this.skeleton.dispose();
    this.root.clear();
  }
}
