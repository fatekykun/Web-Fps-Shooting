import { expect, it } from 'vitest';
import { InstancedMesh, Matrix4, NearestFilter } from 'three';
import { WeaponViewmodel } from './WeaponViewmodel';
import { WeaponController } from './WeaponController';

it('pools the sniper into one draw with sharp textures and animates its bolt without creating geometry', () => {
  const model = new WeaponViewmodel();
  const weapons = new WeaponController(() => {});
  const idle = {
    fire: false,
    firePressed: false,
    aim: false,
    reloadPressed: false,
    switchTo: null,
  };
  const ground = { speed: 0, grounded: true, verticalSpeed: 0 };
  try {
    weapons.switchWeapon('sniper');
    weapons.step(0.2, idle, ground);
    model.update(weapons, 0, 1 / 60, true);
    const mesh = model.scene.getObjectByName('weapon-sniper') as InstancedMesh;
    expect(mesh.visible).toBe(true);
    const geometry = mesh.geometry,
      count = mesh.count;
    expect(count).toBeLessThan(80);
    const before = new Matrix4(),
      during = new Matrix4(),
      after = new Matrix4();
    mesh.getMatrixAt(count - 1, before);
    weapons.step(1 / 60, { ...idle, firePressed: true }, ground);
    for (let i = 0; i < 25; i++) weapons.step(1 / 60, idle, ground);
    model.update(weapons, 0, 1 / 60, true);
    mesh.getMatrixAt(count - 1, during);
    expect(during.elements).not.toEqual(before.elements);
    for (let i = 0; i < 80; i++) weapons.step(1 / 60, idle, ground);
    model.update(weapons, 0, 1 / 60, true);
    mesh.getMatrixAt(count - 1, after);
    expect(after.elements).toEqual(before.elements);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.count).toBe(count);
    for (const id of ['rifle', 'smg', 'shotgun'])
      expect(model.scene.getObjectByName(`weapon-${id}`)!.visible).toBe(false);
    expect(
      Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material,
    ).toHaveProperty('map.magFilter', NearestFilter);
  } finally {
    model.dispose();
  }
});

it.each(['optic', 'classic'] as const)(
  'raises the sniper and preserves the correct model visibility for %s',
  (style) => {
    const model = new WeaponViewmodel(),
      weapons = new WeaponController(() => {});
    try {
      weapons.switchWeapon('sniper');
      weapons.step(
        0.2,
        {
          fire: false,
          firePressed: false,
          aim: false,
          reloadPressed: false,
          switchTo: null,
        },
        { speed: 0, grounded: true, verticalSpeed: 0 },
      );
      const mesh = model.scene.getObjectByName(
        'weapon-sniper',
      ) as InstancedMesh;
      const root = mesh.parent!;
      const update = () =>
        model.update(weapons, 0, 1 / 60, true, 1, 'walking', style);
      update();
      const hip = root.position.clone();
      weapons.ads = 0.7;
      update();
      expect(root.visible).toBe(true);
      expect(root.position.y).toBeGreaterThan(hip.y);
      expect(root.position.z).toBeGreaterThan(hip.z);
      expect(Math.abs(root.position.x)).toBeLessThan(0.001);
      const material = Array.isArray(mesh.material)
        ? mesh.material[0]!
        : mesh.material;
      expect(material.opacity).toBe(1);
      weapons.ads = 0.85;
      update();
      expect(root.visible).toBe(style === 'optic');
      expect(material.opacity).toBe(1);
      expect(material.transparent).toBe(false);
      weapons.ads = 1;
      update();
      expect(root.visible).toBe(style === 'optic');
      weapons.ads = 0.7;
      update();
      expect(root.visible).toBe(true);
      expect(material.opacity).toBe(1);
      weapons.ads = 0;
      update();
      expect(root.position.toArray()).toEqual(hip.toArray());
      weapons.switchWeapon('rifle');
      weapons.ads = 1;
      update();
      expect(root.visible).toBe(true);
      const rifle = model.scene.getObjectByName(
        'weapon-rifle',
      ) as InstancedMesh;
      expect(
        Array.isArray(rifle.material)
          ? rifle.material[0]!.transparent
          : rifle.material.transparent,
      ).toBe(false);
    } finally {
      model.dispose();
    }
  },
);

it('smoothly exits the reload pose when a remaining round interrupts reload', () => {
  const model = new WeaponViewmodel(),
    w = new WeaponController(() => {});
  const idle = {
      fire: false,
      firePressed: false,
      aim: false,
      reloadPressed: false,
      switchTo: null,
    },
    context = { speed: 0, grounded: true, verticalSpeed: 0 };
  const mesh = model.scene.getObjectByName('weapon-rifle')!,
    root = mesh.parent!;
  try {
    w.current.magazine = 10;
    w.reload();
    for (let i = 0; i < 45; i++) {
      w.step(1 / 60, idle, context);
      model.update(w, 0, 1 / 60, true);
    }
    const before = root.rotation.z;
    expect(before).toBeLessThan(-0.3);
    w.step(1 / 60, { ...idle, fire: true, firePressed: true }, context);
    model.update(w, 0, 1 / 60, true);
    expect(w.reloading).toBe(false);
    expect(w.current.magazine).toBe(9);
    expect(root.rotation.z).toBeLessThan(-0.2);
    expect(Math.abs(root.rotation.z - before)).toBeLessThan(0.2);
    for (let i = 0; i < 60; i++) {
      w.step(1 / 60, idle, context);
      model.update(w, 0, 1 / 60, true);
    }
    expect(Math.abs(root.rotation.z)).toBeLessThan(0.01);
  } finally {
    model.dispose();
  }
});
