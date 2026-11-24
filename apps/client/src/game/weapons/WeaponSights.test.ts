import { expect, it } from 'vitest';
import {
  Box3,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from 'three';
import { weaponOrder, type WeaponId } from '@breakpoint/shared';
import { WeaponController } from './WeaponController';
import { WeaponViewmodel } from './WeaponViewmodel';
import { weaponSights } from './WeaponSights';

const idle = {
  fire: false,
  firePressed: false,
  aim: false,
  reloadPressed: false,
  switchTo: null,
};
function setup(id: WeaponId) {
  const model = new WeaponViewmodel(),
    w = new WeaponController(() => {});
  w.switchWeapon(id);
  w.step(0.2, idle, { speed: 0, grounded: true, verticalSpeed: 0 });
  const mesh = model.scene.getObjectByName(`weapon-${id}`) as InstancedMesh;
  return { model, w, mesh, root: mesh.parent! };
}
it.each(weaponOrder)(
  'aligns the %s front sight and rear sight line exactly with camera center across aspect ratios',
  (id) => {
    const { model, w, mesh, root } = setup(id),
      sight = weaponSights[id];
    try {
      w.ads = 1;
      for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
        model.resize(aspect * 720, 720);
        model.update(w, 0, 1 / 60, true, 1, 'walking', 'optic');
        model.scene.updateMatrixWorld(true);
        model.camera.updateMatrixWorld(true);
        for (const point of [
          sight.front,
          ...(sight.rear ? [sight.rear] : []),
        ]) {
          const world = mesh.localToWorld(new Vector3(...point));
          expect(world.z).toBeLessThan(-model.camera.near);
          const projected = world.project(model.camera);
          expect(projected.x).toBeCloseTo(0, 6);
          expect(projected.y).toBeCloseTo(0, 6);
        }
        root.position
          .toArray()
          .forEach((value, axis) =>
            expect(value).toBeCloseTo(sight.ads.position[axis]!, 10),
          );
        expect(root.rotation.toArray().slice(0, 3)).toEqual(sight.ads.rotation);
      }
    } finally {
      model.dispose();
    }
  },
);
it.each(['rifle', 'smg', 'shotgun'] as const)(
  'keeps the %s center sight line clear through its optic or up to the front aiming geometry',
  (id) => {
    const { model, w, mesh } = setup(id);
    try {
      w.ads = 1;
      model.update(w, 0, 1 / 60, true);
      model.scene.updateMatrixWorld(true);
      const front = mesh.localToWorld(new Vector3(...weaponSights[id].front));
      // Just below a blade's top edge avoids a ray/triangle boundary ambiguity.
      const ray = new Raycaster(
        new Vector3(0, -1e-6, 0),
        new Vector3(0, 0, -1),
      );
      const hits = ray.intersectObject(mesh, false);
      if (weaponSights[id].kind === 'red-dot') expect(hits).toHaveLength(0);
      else {
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0]!.distance).toBeCloseTo(-front.z, 1);
      }
    } finally {
      model.dispose();
    }
  },
);
it.each(['rifle', 'smg', 'shotgun'] as const)(
  'keeps every %s weapon part ahead of the near plane with one pooled arm mesh',
  (id) => {
    const { model, w, mesh } = setup(id);
    try {
      const geometry = mesh.geometry,
        count = mesh.count,
        camera = model.camera;
      for (const ads of [0, 0.2, 0.5, 0.8, 1, 0.8, 0.5, 0.2, 0]) {
        w.ads = ads;
        model.update(w, 0, 1 / 60, true);
        model.scene.updateMatrixWorld(true);
        const part = new Matrix4();
        for (let i = 0; i < count; i++) {
          mesh.getMatrixAt(i, part);
          for (const x of [-0.5, 0.5])
            for (const y of [-0.5, 0.5])
              for (const z of [-0.5, 0.5]) {
                const point = new Vector3(x, y, z)
                  .applyMatrix4(part)
                  .applyMatrix4(mesh.matrixWorld);
                expect(point.z).toBeLessThan(-camera.near - 0.01);
              }
        }
        expect(mesh.count).toBe(count);
        expect(mesh.geometry).toBe(geometry);
      }
      expect(
        model.scene.getObjectsByProperty('isInstancedMesh', true),
      ).toHaveLength(6);
    } finally {
      model.dispose();
    }
  },
);
it.each(['rifle', 'smg', 'shotgun'] as const)(
  'connects the %s sight to its weapon rather than leaving detached pieces',
  (id) => {
    const { model, mesh } = setup(id);
    try {
      const start = mesh.count - weaponSights[id].parts.length,
        boxes: Box3[] = [];
      for (let i = 0; i < mesh.count; i++) {
        const matrix = new Matrix4();
        mesh.getMatrixAt(i, matrix);
        boxes.push(
          new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5))
            .applyMatrix4(matrix)
            .expandByScalar(1e-6),
        );
      }
      const connected = new Set(Array.from({ length: start }, (_, i) => i));
      for (let pass = 0; pass < boxes.length; pass++) {
        for (let i = start; i < boxes.length; i++)
          if ([...connected].some((j) => boxes[i]!.intersectsBox(boxes[j]!)))
            connected.add(i);
      }
      for (let i = start; i < boxes.length; i++)
        expect(
          connected.has(i),
          `sight part ${i - start} must connect to the weapon`,
        ).toBe(true);
    } finally {
      model.dispose();
    }
  },
);
it('uses distinct geometry silhouettes and restores the selected ADS pose when switching while aiming', () => {
  const { model, w } = setup('rifle');
  try {
    expect(weaponOrder.map((id) => weaponSights[id].kind)).toEqual([
      'red-dot',
      'notch',
      'bead',
      'scope',
    ]);
    expect(weaponSights.shotgun.rear).toBeUndefined();
    const shapes = weaponOrder.map((id) =>
      JSON.stringify(
        weaponSights[id].parts.map(([x, y, z, sx, sy, sz, , roll]) => [
          x,
          y,
          z,
          sx,
          sy,
          sz,
          roll,
        ]),
      ),
    );
    expect(new Set(shapes).size).toBe(4);
    for (const id of ['smg', 'shotgun', 'sniper', 'rifle'] as const) {
      w.switchWeapon(id);
      w.step(0.2, idle, { speed: 0, grounded: true, verticalSpeed: 0 });
      w.ads = 1;
      model.update(w, 0, 1 / 60, true, 1, 'walking', 'optic');
      const mesh = model.scene.getObjectByName(`weapon-${id}`)!;
      mesh
        .parent!.position.toArray()
        .forEach((value, axis) =>
          expect(value).toBeCloseTo(weaponSights[id].ads.position[axis]!, 10),
        );
      for (const other of weaponOrder)
        expect(model.scene.getObjectByName(`weapon-${other}`)!.visible).toBe(
          other === id,
        );
    }
  } finally {
    model.dispose();
  }
});
it('reuses the existing frame-rate-independent ADS blend and returns to the hip pose smoothly', () => {
  const poses = [30, 60, 144].map((fps) => {
    const { model, w, root } = setup('smg');
    try {
      for (let i = 0; i < fps / 3; i++) {
        w.updateAds(1 / fps, true);
        model.update(w, 0, 1 / fps, true);
      }
      const pose = root.position.toArray();
      w.updateAds(1 / fps, false);
      model.update(w, 0, 1 / fps, true);
      expect(root.position.x).toBeGreaterThan(pose[0]!);
      expect(root.position.x).toBeLessThan(0.27);
      for (let i = 0; i < fps; i++) {
        w.updateAds(1 / fps, false);
        model.update(w, 0, 1 / fps, true);
      }
      expect(root.position.x).toBeCloseTo(0.27, 5);
      expect(root.position.y).toBeCloseTo(-0.25, 5);
      expect(root.position.z).toBeCloseTo(-0.65, 5);
      return pose;
    } finally {
      model.dispose();
    }
  });
  for (const pose of poses.slice(1))
    pose.forEach((value, i) => expect(value).toBeCloseTo(poses[0]![i]!, 6));
});

it('collimates an unlit rifle red dot to the camera aim ray during recoil and hides it outside the optic', () => {
  const { model, w } = setup('rifle');
  try {
    const dot = model.scene.getObjectByName('rifle-red-dot') as Mesh;
    expect(dot.material).toBeInstanceOf(MeshBasicMaterial);
    expect((dot.material as MeshBasicMaterial).color.getHex()).toBe(0xff3b30);
    model.update(w, 0, 1 / 60, true);
    expect(model.hasAimDot).toBe(false);
    w.ads = 1;
    model.update(w, 0, 1 / 60, true);
    const geometry = dot.geometry;
    for (let frame = 0; frame < 12; frame++) {
      if (frame === 1)
        w.step(
          1 / 60,
          { ...idle, fire: true, firePressed: true },
          { speed: 0, grounded: true, verticalSpeed: 0 },
        );
      model.simulateRecoil(w, 1 / 60, frame === 1);
      model.update(w, 4, 1 / 60, true);
      model.scene.updateMatrixWorld(true);
      model.camera.updateMatrixWorld(true);
      expect(model.hasAimDot).toBe(true);
      const point = dot.getWorldPosition(new Vector3()).project(model.camera);
      expect(point.x).toBeCloseTo(0, 6);
      expect(point.y).toBeCloseTo(0, 6);
      expect(dot.geometry).toBe(geometry);
    }
    w.switchWeapon('smg');
    model.update(w, 0, 1 / 60, true);
    expect(model.hasAimDot).toBe(false);
    w.switchWeapon('rifle');
    w.ads = 1;
    model.update(w, 0, 1 / 60, false);
    expect(model.hasAimDot).toBe(false);
  } finally {
    model.dispose();
  }
});
