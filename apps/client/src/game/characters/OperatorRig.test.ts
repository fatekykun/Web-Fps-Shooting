import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rigJoints, type JointName } from '@breakpoint/shared/character';
import { OperatorRig } from './OperatorRig';
import { TacticalSkeleton } from './TacticalSkeleton';

it('binds an authored operator to the moving weapon hands and lowers her into slide and prone', async () => {
  const bytes = await readFile(
    new URL(
      '../../../public/models/crimson_officer_character.glb',
      import.meta.url,
    ),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    new Uint8Array(bytes).buffer,
    '',
  );
  const operator = new OperatorRig(scene);
  const tactical = new TacticalSkeleton();
  const target = (name: string) =>
    operator.root.getObjectByName(name)!.getWorldPosition(new Vector3());
  const anchor = (name: JointName) =>
    tactical.bones[
      rigJoints.findIndex((joint) => joint.name === name)
    ]!.getWorldPosition(new Vector3());
  try {
    tactical.root.position.set(3, 0.4, -6);
    tactical.root.rotation.y = 1.1;
    tactical.update({
      pitch: 0,
      halfHeight: 0.55,
      movement: 'sprinting',
      sprintBlend: 1,
      carryBlend: 1,
      gaitAmount: 1,
      gaitPhase: Math.PI / 2,
    });
    operator.update(tactical);
    const runningHips = target('Hips');
    const bounds = new Box3();
    const runningHeight = bounds
      .setFromObject(operator.root, true)
      .getSize(new Vector3()).y;
    expect(target('Hand_R').distanceTo(anchor('rightWrist'))).toBeLessThan(
      0.00001,
    );
    expect(target('Hand_L').distanceTo(target('Hand_R'))).toBeGreaterThan(0.2);
    tactical.update({
      pitch: 0,
      halfHeight: 0.2,
      movement: 'sliding',
      slideBlend: 1,
    });
    operator.update(tactical);
    expect(target('Hips').y).toBeLessThan(runningHips.y - 0.35);
    const forward = new Vector3(0, 0, -1).applyQuaternion(
      tactical.root.quaternion,
    );
    expect(
      Math.abs(target('Foot_R').sub(target('Foot_L')).dot(forward)),
    ).toBeGreaterThan(0.15);
    tactical.update({
      pitch: 0,
      halfHeight: 0.15,
      movement: 'prone',
      proneBlend: 1,
    });
    operator.update(tactical);
    const torso = target('Chest').sub(target('Hips'));
    expect(Math.hypot(torso.x, torso.z)).toBeGreaterThan(Math.abs(torso.y) * 2);
    const proneHeight = bounds
      .setFromObject(operator.root, true)
      .getSize(new Vector3()).y;
    expect(proneHeight).toBeLessThan(runningHeight * 0.65);
    expect(target('Hand_L').distanceTo(anchor('leftWrist'))).toBeLessThan(
      0.00001,
    );
  } finally {
    operator.dispose();
    tactical.dispose();
  }
});
