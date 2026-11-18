import { expect, it } from 'vitest';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { weaponOrder } from '@breakpoint/shared';
import { WeaponViewmodel } from './WeaponViewmodel';
import { WeaponController } from './WeaponController';
import { weaponMuzzles } from './WeaponMuzzles';

const idle = {
  fire: false,
  aim: false,
  firePressed: false,
  reloadPressed: false,
  switchTo: null,
};
it.each(weaponOrder)(
  'places the %s attachment on its actual barrel exit and follows every weapon transform',
  (id) => {
    const view = new WeaponViewmodel(),
      w = new WeaponController(() => {}),
      camera = new PerspectiveCamera(85, 16 / 9, 0.08, 90);
    w.switchWeapon(id);
    w.step(0.2, idle, { speed: 0, grounded: true, verticalSpeed: 0 });
    const muzzle = view.scene.getObjectByName(`muzzle-${id}`)!;
    const mesh = muzzle.parent! as import('three').InstancedMesh;
    try {
      expect(muzzle.position.toArray()).toEqual(weaponMuzzles[id].firstPerson);
      const matrix = new Matrix4();
      const onBarrelFace = Array.from({ length: mesh.count }, (_, index) => {
        mesh.getMatrixAt(index, matrix);
        const local = muzzle.position.clone().applyMatrix4(matrix.invert());
        return (
          Math.abs(local.x) < 0.5 &&
          Math.abs(local.y) < 0.5 &&
          Math.abs(local.z + 0.5) < 1e-5
        );
      }).some(Boolean);
      expect(onBarrelFace).toBe(true);
      camera.position.set(3, 1.6, -4);
      camera.rotation.set(0.3, 1.1, 0, 'YXZ');
      view.resize(1280, 720);
      let previous: Vector3 | undefined;
      for (const state of [
        'walking',
        'sprinting',
        'sliding',
        'diving',
      ] as const) {
        for (let i = 0; i < 30; i++)
          view.update(w, 8, 1 / 60, true, 1, state, 'optic', idle);
        const world = view.muzzleWorldPosition(id, camera, new Vector3());
        const visible = muzzle
          .getWorldPosition(new Vector3())
          .project(view.camera);
        const projected = world.clone().project(camera);
        expect(projected.x).toBeCloseTo(visible.x, 6);
        expect(projected.y).toBeCloseTo(visible.y, 6);
        if (previous) expect(world.distanceTo(previous)).toBeGreaterThan(0.005);
        previous = world;
      }
      w.ads = 1;
      view.update(w, 0, 1 / 60, true, 1, 'walking', 'classic', idle);
      camera.fov = 15;
      camera.updateProjectionMatrix();
      const world = view.muzzleWorldPosition(id, camera, new Vector3());
      const projected = world.clone().project(camera),
        visible = muzzle.getWorldPosition(new Vector3()).project(view.camera);
      expect(projected.y).toBeCloseTo(visible.y, 6);
    } finally {
      view.dispose();
    }
  },
);
