import { expect, it } from 'vitest';
import { InstancedMesh, Matrix4, Vector3 } from 'three';
import { weaponOrder, type MovementState } from '@breakpoint/shared';
import { WeaponController } from './WeaponController';
import { WeaponViewmodel } from './WeaponViewmodel';

const idle = {
  fire: false,
  aim: false,
  firePressed: false,
  reloadPressed: false,
  switchTo: null,
};
const context = { speed: 0, grounded: true, verticalSpeed: 0 };
function fixture(id: (typeof weaponOrder)[number] = 'rifle') {
  const model = new WeaponViewmodel(),
    weapons = new WeaponController(() => {});
  weapons.switchWeapon(id);
  weapons.step(0.2, idle, context);
  const root = model.scene.getObjectByName(`weapon-${id}`)!.parent!;
  const update = (
    state: MovementState,
    speed = 8,
    dt = 1 / 60,
    input = { aim: false, fire: false },
    motion = 1,
    active = true,
  ) => model.update(weapons, speed, dt, active, motion, state, 'optic', input);
  return { model, weapons, root, update };
}

it.each(weaponOrder)(
  'carries %s diagonally upward, with its existing hands and geometry, and smoothly restores idle',
  (id) => {
    const f = fixture(id);
    try {
      f.update('walking', 0);
      const normal = f.root.position.clone(),
        rotation = f.root.rotation.clone();
      const mesh = f.model.scene.getObjectByName(
        `weapon-${id}`,
      ) as InstancedMesh;
      const geometry = mesh.geometry,
        count = mesh.count;
      f.update('sprinting');
      const first = f.root.rotation.x;
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(0.3);
      for (let i = 0; i < 59; i++) f.update('sprinting');
      expect(f.root.rotation.x).toBeGreaterThan(0.8);
      expect(f.root.rotation.y).toBeGreaterThan(0.15);
      expect(f.root.rotation.z).toBeLessThan(-0.2);
      expect(f.root.position.z).toBeLessThan(normal.z - 0.15);
      expect(mesh.geometry).toBe(geometry);
      expect(mesh.count).toBe(count);
      mesh.updateWorldMatrix(true, false);
      const instance = new Matrix4();
      for (let part = 0; part < count; part++) {
        mesh.getMatrixAt(part, instance);
        for (const x of [-0.5, 0.5])
          for (const y of [-0.5, 0.5])
            for (const z of [-0.5, 0.5]) {
              const point = new Vector3(x, y, z)
                .applyMatrix4(instance)
                .applyMatrix4(mesh.matrixWorld);
              expect(point.z).toBeLessThan(-f.model.camera.near - 0.01);
            }
      }
      f.update('walking', 0);
      expect(f.root.rotation.x).toBeGreaterThan(0.3); // Exit is blended, not snapped.
      for (let i = 0; i < 89; i++) f.update('walking', 0);
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(f.root.position[axis]).toBeCloseTo(normal[axis], 5);
        expect(f.root.rotation[axis]).toBeCloseTo(rotation[axis], 5);
      }
    } finally {
      f.model.dispose();
    }
  },
);

it('follows distance-based cadence consistently at 30, 60 and 144 FPS', () => {
  const poses = [30, 60, 144].map((fps) => {
    const f = fixture();
    try {
      for (let frame = 0; frame < fps; frame++)
        f.update('sprinting', 8, 1 / fps);
      return [
        ...f.root.position.toArray(),
        f.root.rotation.x,
        f.root.rotation.y,
        f.root.rotation.z,
      ];
    } finally {
      f.model.dispose();
    }
  });
  for (const pose of poses.slice(1))
    pose.forEach((value, i) => expect(value).toBeCloseTo(poses[0]![i]!, 5));
});

it('gives aim, fire, reload and equip priority without changing weapon rules', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 60; i++) f.update('sprinting');
    for (let i = 0; i < 45; i++)
      f.update('sprinting', 8, 1 / 60, { aim: true, fire: false });
    expect(Math.abs(f.root.rotation.x)).toBeLessThan(0.001);
    expect(f.weapons.current.magazine).toBe(30);
    for (let i = 0; i < 60; i++) f.update('sprinting');
    for (let i = 0; i < 45; i++)
      f.update('sprinting', 8, 1 / 60, { aim: false, fire: true });
    expect(Math.abs(f.root.rotation.x)).toBeLessThan(0.001);
    for (let i = 0; i < 60; i++) f.update('sprinting');
    f.weapons.current.magazine--;
    f.weapons.reload();
    for (let i = 0; i < 45; i++) f.update('sprinting');
    expect(Math.abs(f.root.rotation.x)).toBeLessThan(0.001);
    expect(f.weapons.reloading).toBe(true);
    expect(f.weapons.current.reserve).toBe(120);
    f.weapons.switchWeapon('smg');
    for (let i = 0; i < 45; i++) f.update('sprinting');
    expect(Math.abs(f.root.rotation.x)).toBeLessThan(0.001);
    expect(f.weapons.equipping).toBe(true);
  } finally {
    f.model.dispose();
  }
});

it('blends out through traversal and suppresses extra motion for a blocked sprint or reduced-motion preference', () => {
  for (const state of [
    'sliding',
    'backsliding',
    'airborne',
    'diving',
    'recovering',
  ] as const) {
    const f = fixture();
    try {
      for (let i = 0; i < 60; i++) f.update('sprinting');
      for (let i = 0; i < 45; i++) f.update(state);
      expect(Math.abs(f.root.rotation.x)).toBeLessThan(0.001);
    } finally {
      f.model.dispose();
    }
  }
  const normal = fixture(),
    reduced = fixture();
  try {
    for (let i = 0; i < 60; i++) {
      normal.update('sprinting');
      reduced.update('sprinting', 8, 1 / 60, idle, 0.2);
    }
    expect(reduced.root.rotation.x).toBeGreaterThan(0.8);
    expect(Math.abs(reduced.root.rotation.x - 0.9)).toBeLessThan(
      Math.abs(normal.root.rotation.x - 0.9),
    );
    const frozen = reduced.root.position.clone();
    reduced.update('sprinting', 8, 1 / 60, idle, 0.2, false);
    expect(reduced.root.position.toArray()).toEqual(frozen.toArray());
    for (let i = 0; i < 90; i++) normal.update('sprinting', 0);
    expect(Math.abs(normal.root.rotation.x)).toBeLessThan(0.001);
  } finally {
    normal.model.dispose();
    reduced.model.dispose();
  }
});
