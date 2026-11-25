import { expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { MoltenLavaEliminations } from './MoltenLavaEliminations';

it('anchors the ring at the elimination, scales reduced motion and pools overlapping bursts', () => {
  const scene = new Scene();
  const fx = new MoltenLavaEliminations(scene);
  const mesh = scene.getObjectByName(
    'molten-lava-eliminations',
  ) as InstancedMesh;
  const origin = { x: 3, y: 2, z: -8 };
  const ringRadius = () => {
    const matrix = new Matrix4();
    mesh.getMatrixAt(0, matrix);
    const position = new Vector3().setFromMatrixPosition(matrix);
    expect(position.y).toBeCloseTo(origin.y + 0.035);
    return Math.hypot(position.x - origin.x, position.z - origin.z);
  };
  try {
    expect(mesh.visible).toBe(false);
    fx.spawn(origin, false);
    fx.step(0.19);
    expect(mesh.visible).toBe(true);
    expect(mesh.count).toBeGreaterThan(30);
    const full = ringRadius();
    fx.clear();
    fx.spawn(origin, true);
    fx.step(0.19);
    expect(ringRadius()).toBeCloseTo(full * 0.6);
    for (let i = 0; i < 10; i++) fx.spawn(origin, false);
    fx.step(0.2);
    expect(mesh.count).toBeLessThanOrEqual(mesh.instanceMatrix.count);
    fx.step(1.3);
    expect(mesh.visible).toBe(false);
    expect(mesh.count).toBe(0);
  } finally {
    fx.dispose();
  }
  expect(scene.children).toHaveLength(0);
});
