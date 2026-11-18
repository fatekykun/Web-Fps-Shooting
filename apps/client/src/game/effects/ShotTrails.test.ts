import { expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { ShotTrails } from './ShotTrails';
import { tracerConfig, tracerStyle } from './tracerConfig';

function fixture() {
  const scene = new Scene(),
    trails = new ShotTrails(scene);
  const mesh = scene.getObjectByName('bullet-trails') as InstancedMesh;
  const muzzle = new Vector3(0.25, -0.2, -1);
  const resolve = (_weapon: unknown, _source: unknown, out: Vector3) => {
    out.copy(muzzle);
    return true;
  };
  const endpoints = (index: number) => {
    const matrix = new Matrix4();
    mesh.getMatrixAt(index, matrix);
    return [
      new Vector3(0, 0, -0.5).applyMatrix4(matrix),
      new Vector3(0, 0, 0.5).applyMatrix4(matrix),
    ];
  };
  return { trails, scene, mesh, muzzle, resolve, endpoints };
}
it('starts on the animated muzzle, converges over a short bridge and then follows the unchanged validated ray', () => {
  const f = fixture();
  const origin = new Vector3(),
    end = new Vector3(0, 0, -20);
  try {
    f.trails.spawn('rifle', origin, end);
    f.trails.step(1 / 60, 0, false, f.resolve);
    expect(f.mesh.count).toBe(2);
    const [start, join] = f.endpoints(0),
      [rayStart, rayEnd] = f.endpoints(1);
    expect(start!.distanceTo(f.muzzle)).toBeLessThan(1e-6);
    expect(join!.distanceTo(rayStart!)).toBeLessThan(1e-6);
    expect(rayStart!.x).toBeCloseTo(0);
    expect(rayStart!.y).toBeCloseTo(0);
    expect(rayEnd!.x).toBeCloseTo(0);
    expect(rayEnd!.y).toBeCloseTo(0);
    expect(
      start!.distanceTo(join!) + rayStart!.distanceTo(rayEnd!),
    ).toBeCloseTo(tracerConfig.hip.length, 5);
    expect(end.toArray()).toEqual([0, 0, -20]);
    expect(origin.toArray()).toEqual([0, 0, 0]);
    const initial = start!.clone();
    f.muzzle.x = 0.6;
    f.trails.step(1 / 60, 1, false, f.resolve);
    expect(f.endpoints(0)[0]!.distanceTo(initial)).toBeLessThan(1e-6); // The emitted shot stays in world space.
    f.trails.spawn('rifle', origin, end);
    f.trails.step(0, 1, false, f.resolve);
    expect(f.endpoints(2)[0]!.distanceTo(f.muzzle)).toBeLessThan(1e-6);
  } finally {
    f.trails.dispose();
  }
});

it('clips at the real endpoint, skips a hit behind the barrel and never emits from a missing/stowed muzzle', () => {
  const f = fixture();
  try {
    f.trails.spawn('rifle', new Vector3(), new Vector3(0, 0, -1.2));
    f.trails.step(0, 0, false, f.resolve);
    expect(f.mesh.count).toBe(1);
    expect(f.endpoints(0)[1]!.z).toBeCloseTo(-1.2);
    f.trails.clear();
    f.trails.spawn('rifle', new Vector3(), new Vector3(0, 0, -0.5));
    f.trails.step(0, 0, false, f.resolve);
    expect(f.mesh.count).toBe(0);
    f.trails.spawn('rifle', new Vector3(), new Vector3(0, 0, -20));
    f.trails.step(0, 0, false, () => false);
    expect(f.mesh.count).toBe(0);
  } finally {
    f.trails.dispose();
  }
});

it('waits for the remote interpolation delay and reuses bounded slots and GPU resources through expiry/reset', () => {
  const f = fixture();
  try {
    const geometry = f.mesh.geometry,
      material = f.mesh.material;
    f.trails.spawn('smg', new Vector3(), new Vector3(0, 0, -20), 'peer', 0.1);
    f.trails.step(0.05, 0, false, f.resolve);
    expect(f.mesh.count).toBe(0);
    f.trails.step(0.051, 0, false, f.resolve);
    expect(f.trails.emitted).toBe(1);
    f.trails.step(0.1, 0, false, f.resolve);
    expect(f.mesh.count).toBe(0);
    for (let i = 0; i < 300; i++)
      f.trails.spawn('shotgun', new Vector3(), new Vector3(0, 0, -20));
    f.trails.step(0, 0, false, f.resolve);
    expect(f.trails.activeCount).toBe(tracerConfig.capacity);
    expect(f.mesh.count).toBeLessThanOrEqual(tracerConfig.capacity * 2);
    expect(f.mesh.geometry).toBe(geometry);
    expect(f.mesh.material).toBe(material);
    f.trails.clear();
    expect(f.mesh.count).toBe(0);
    expect(f.trails.emitted).toBe(0);
    f.trails.dispose();
    expect(f.scene.children).toHaveLength(0);
  } finally {
    if (f.scene.children.length) f.trails.dispose();
  }
});

it.each([false, true])(
  'smoothly reduces opacity, width and length in ADS, keeps a nonzero effect and restores hip fire (scope=%s)',
  (scoped) => {
    const out = { ...tracerConfig.hip };
    let previous = out.opacity;
    for (let i = 0; i <= 20; i++) {
      tracerStyle(i / 20, scoped, out);
      expect(out.opacity).toBeLessThanOrEqual(previous);
      expect(out.opacity).toBeGreaterThan(0);
      previous = out.opacity;
    }
    const target = scoped ? tracerConfig.scope : tracerConfig.ads;
    for (const key of [
      'opacity',
      'thickness',
      'length',
      'protectedRadius',
    ] as const)
      expect(out[key]).toBeCloseTo(target[key], 10);
    tracerStyle(0, scoped, out);
    expect(out).toEqual(tracerConfig.hip);
  },
);
