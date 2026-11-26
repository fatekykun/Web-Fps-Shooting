import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import {
  Bone,
  Box3,
  SkinnedMesh,
  Texture,
  Vector3,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  rigJoints,
  type CharacterPose,
  type JointName,
} from '@breakpoint/shared/character';
import { OperatorRig } from './OperatorRig';
import { prepareOperatorAsset } from './OperatorAssets';
import { TacticalSkeleton } from './TacticalSkeleton';

function chestWidth(scene: Object3D): number {
  let left = Infinity;
  let right = -Infinity;
  scene.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    const chest = node.skeleton.bones.findIndex(
      (bone) => bone.name === 'Chest',
    );
    const position = node.geometry.getAttribute('position');
    const joints = node.geometry.getAttribute('skinIndex');
    const weights = node.geometry.getAttribute('skinWeight');
    for (let vertex = 0; vertex < position.count; vertex++) {
      if (joints.getX(vertex) !== chest || weights.getX(vertex) < 0.95)
        continue;
      const x = position.getX(vertex);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  });
  return right - left;
}

it.each(['crimson_officer_character', 'ghost_character'])(
  '%s adds torso width and height while preserving the authored bones and grip',
  async (file) => {
    const bytes = await readFile(
      new URL(`../../../public/models/${file}.glb`, import.meta.url),
    );
    const loader = new GLTFLoader().register(() => ({
      name: 'Test texture',
      loadTexture: async () => new Texture(),
    }));
    const asset = await loader.parseAsync(new Uint8Array(bytes).buffer, '');
    const authoredChestWidth = chestWidth(asset.scene);
    const { scene } = prepareOperatorAsset(asset);
    expect(authoredChestWidth).toBeGreaterThan(0);
    expect(chestWidth(scene) / authoredChestWidth).toBeCloseTo(1.08, 2);
    const operator = new OperatorRig(scene);
    const tactical = new TacticalSkeleton();
    const bindOffsets = new Map<string, Vector3>();
    scene.traverse((node) => {
      if (node instanceof Bone && node.name !== 'Hips')
        bindOffsets.set(node.name, node.position.clone());
    });
    const target = (name: string) =>
      operator.root.getObjectByName(name)!.getWorldPosition(new Vector3());
    const anchor = (name: JointName) =>
      tactical.bones[rigJoints.findIndex((joint) => joint.name === name)]!;
    const update = (pose: Partial<CharacterPose> = {}) => {
      const state = { pitch: 0, halfHeight: 0.55, ...pose };
      tactical.update(state);
      operator.update(tactical, state);
    };
    const size = new Vector3();
    const bounds = () => new Box3().setFromObject(operator.root, true);
    const gripError = (side: 'left' | 'right') => {
      const mesh = operator.root.children[0]!;
      const hand = mesh.getObjectByName(side === 'left' ? 'Hand_L' : 'Hand_R')!;
      const palm = hand.localToWorld(
        new Vector3(side === 'left' ? 0.018 : -0.018, -0.048, 0),
      );
      const grip = anchor(side === 'left' ? 'leftWrist' : 'rightWrist');
      const weapon = anchor('weapon').getWorldPosition(new Vector3());
      const drawnWeapon = new Vector3().setFromMatrixPosition(
        operator.weaponMatrix,
      );
      const targetGrip = grip
        .localToWorld(new Vector3(0, -0.055, 0))
        .add(drawnWeapon.sub(weapon));
      return palm.distanceTo(targetGrip);
    };
    try {
      tactical.root.position.set(3, 0.4, -6);
      tactical.root.rotation.y = 1.1;
      update();
      const standingHeight = bounds().getSize(size).y;
      expect(standingHeight).toBeGreaterThan(1.74);
      expect(standingHeight).toBeLessThan(1.78);
      expect(bounds().min.y).toBeCloseTo(tactical.root.position.y, 1);
      expect(gripError('left')).toBeLessThan(0.035);
      expect(gripError('right')).toBeLessThan(0.035);

      update({ aimBlend: 1, pitch: 0.45 });
      expect(gripError('left')).toBeLessThan(0.035);
      expect(gripError('right')).toBeLessThan(0.035);

      const sourceWeapon = anchor('weapon');
      const barrelAxis = new Vector3(0, 0, 1).transformDirection(
        sourceWeapon.matrixWorld,
      );
      const setback = new Vector3()
        .setFromMatrixPosition(operator.weaponMatrix)
        .sub(sourceWeapon.getWorldPosition(new Vector3()));
      expect(setback.dot(barrelAxis)).toBeGreaterThan(0);
      expect(setback.cross(barrelAxis).length()).toBeLessThan(1e-5);

      update({ reloadBlend: 1, reloadProgress: 0.5 });
      expect(gripError('left')).toBeLessThan(0.035);
      expect(gripError('right')).toBeLessThan(0.035);

      update({
        movement: 'sprinting',
        sprintBlend: 1,
        carryBlend: 1,
        gaitAmount: 1,
        gaitPhase: Math.PI / 2,
      });
      const runningHips = target('Hips');
      const rightBoot = target('Foot_R');
      expect(gripError('left')).toBeGreaterThan(0.15);
      expect(gripError('right')).toBeLessThan(0.035);
      expect(bounds().min.y).toBeCloseTo(tactical.root.position.y, 1);
      update({
        movement: 'sprinting',
        sprintBlend: 1,
        carryBlend: 1,
        gaitAmount: 1,
        gaitPhase: (3 * Math.PI) / 2,
      });
      expect(target('Foot_R').distanceTo(rightBoot)).toBeGreaterThan(0.3);

      update({ halfHeight: 0.2, movement: 'sliding', slideBlend: 1 });
      const slideHips = target('Hips');
      const slideChest = target('Chest');
      expect(slideHips.y).toBeLessThan(runningHips.y - 0.35);
      expect(slideChest.y - slideHips.y).toBeGreaterThan(0.25);
      expect(target('Hand_L').y - tactical.root.position.y).toBeLessThan(0.12);
      expect(gripError('right')).toBeLessThan(0.035);
      expect(bounds().min.y).toBeCloseTo(tactical.root.position.y, 1);
      const forward = new Vector3(0, 0, -1).applyQuaternion(
        tactical.root.quaternion,
      );
      expect(
        Math.abs(target('Foot_R').sub(target('Foot_L')).dot(forward)),
      ).toBeGreaterThan(0.15);

      update({ halfHeight: 0.15, movement: 'prone', proneBlend: 1 });
      const torso = target('Chest').sub(target('Hips'));
      expect(Math.hypot(torso.x, torso.z)).toBeGreaterThan(
        Math.abs(torso.y) * 2,
      );
      expect(bounds().getSize(size).y).toBeLessThan(standingHeight * 0.65);

      for (const [name, offset] of bindOffsets)
        expect(operator.root.getObjectByName(name)!.position).toEqual(offset);
    } finally {
      operator.dispose();
      tactical.dispose();
    }
  },
);
