import { describe, expect, it } from 'vitest';
import {
  InstancedMesh,
  Matrix4,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { requiemTimeline, SoulRequiem } from './SoulRequiem';

describe('Soul Requiem', () => {
  it('freezes the captured pose, shatters on the recording clock, and clears at the end', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const effect = new SoulRequiem(scene, () => 0.5);
    const mesh = (name: string) =>
      scene.getObjectByName(`soul-requiem-${name}`) as InstancedMesh;
    const pose = mesh('frozen-pose');
    const slash = mesh('blades');
    const voxel = mesh('disintegration');
    const body = new Matrix4()
      .makeScale(0.5, 0.95, 0.31)
      .setPosition(4, 1.52, -3);
    let audioTime = 0.03;
    effect.configure('high');
    effect.spawn(
      { x: 4, y: 0.5, z: -3 },
      'high',
      false,
      () => audioTime,
      (write) => write(body, 0x5b91a7),
    );
    body.identity();
    effect.step(0.6, camera);
    expect(pose.count).toBe(1);
    expect(voxel.count).toBe(0);
    const captured = new Matrix4();
    pose.getMatrixAt(0, captured);
    expect(new Vector3().setFromMatrixPosition(captured)).toMatchObject({
      x: 4,
      z: -3,
    });
    expect(captured.elements[13]).toBeCloseTo(1.52);

    audioTime = requiemTimeline.rupture - 0.01;
    effect.step(0, camera);
    expect(slash.count).toBe(6);
    expect(pose.count).toBe(1);
    audioTime = requiemTimeline.rupture + 0.02;
    effect.step(0, camera);
    expect(pose.visible).toBe(false);
    expect(voxel.count).toBe(100);

    audioTime = requiemTimeline.end;
    effect.step(0, camera);
    expect(
      scene.children.filter(
        (object) => object instanceof InstancedMesh && object.visible,
      ),
    ).toHaveLength(0);
    effect.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('supports overlapping low-quality bursts and bounds instance counts when kills pile up', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const effect = new SoulRequiem(scene, () => 0);
    effect.configure('low');
    const voxels = scene.getObjectByName(
      'soul-requiem-disintegration',
    ) as InstancedMesh;
    for (let i = 0; i < 7; i++)
      effect.spawn({ x: i, y: 0, z: -2 }, 'low', false);
    effect.step(0.22, camera);
    expect(voxels.count).toBe(4 * 36);
    expect(scene.children.some((object) => object.type === 'PointLight')).toBe(
      false,
    );
    effect.clear();
    expect(voxels.count).toBe(0);
    expect(voxels.visible).toBe(false);
    effect.dispose();
  });
});
