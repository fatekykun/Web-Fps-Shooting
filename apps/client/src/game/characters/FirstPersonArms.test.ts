import { expect, it } from 'vitest';
import { Group, InstancedMesh, MeshBasicMaterial, Vector3 } from 'three';
import { FirstPersonArms } from './FirstPersonArms';

it('keeps hands on the weapon grips under ADS/recoil transforms and articulates the reload hand', () => {
  const material = new MeshBasicMaterial(),
    arms = new FirstPersonArms(material),
    weapon = new Group();
  weapon.position.set(0.27, -0.25, -0.65);
  weapon.rotation.set(0.2, 0.1, -0.3);
  weapon.add(arms.root);
  const wrist = (side: number) =>
    weapon.worldToLocal(
      arms.bones[side * 3 + 2]!.getWorldPosition(new Vector3()),
    );
  try {
    weapon.updateMatrixWorld(true);
    arms.update(0);
    expect(arms.skeleton.bones).toHaveLength(6);
    const right = wrist(1),
      left = wrist(0);
    [right.x, right.y, right.z].forEach((value, i) =>
      expect(value).toBeCloseTo([0.045, -0.1, 0.12][i]!, 6),
    );
    [left.x, left.y, left.z].forEach((value, i) =>
      expect(value).toBeCloseTo([-0.045, -0.075, -0.17][i]!, 6),
    );
    const mesh = arms.root.getObjectByName(
      'tactical-arms-mesh',
    ) as InstancedMesh;
    const colors = mesh.instanceColor!.version;
    arms.update(1);
    expect(wrist(1).distanceTo(right)).toBeLessThan(1e-6);
    expect(wrist(0).distanceTo(left)).toBeGreaterThan(0.2);
    expect(mesh.instanceColor!.version).toBe(colors);
    for (const [a, b] of [
      [0, 1],
      [1, 2],
      [3, 4],
      [4, 5],
    ]) {
      expect(
        arms.bones[a!]!.getWorldPosition(new Vector3()).distanceTo(
          arms.bones[b!]!.getWorldPosition(new Vector3()),
        ),
      ).toBeCloseTo(0.32, 6);
    }
    arms.update(0);
    expect(wrist(0).distanceTo(left)).toBeLessThan(1e-6);
    arms.update(0, 1);
    expect(wrist(0).distanceTo(left)).toBeLessThan(1e-6);
    expect(wrist(1).distanceTo(right)).toBeLessThan(1e-6);
    expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(
      true,
    );
  } finally {
    arms.dispose();
    material.dispose();
  }
});
