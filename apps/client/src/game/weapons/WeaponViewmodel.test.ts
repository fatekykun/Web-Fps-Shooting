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

it('brings the sniper eyepiece to the eye before the model hands off, preserving hip and other weapons', () => {
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
    const mesh = model.scene.getObjectByName('weapon-sniper') as InstancedMesh;
    const root = mesh.parent!;
    model.update(weapons, 0, 1 / 60, true);
    const hip = root.position.clone();
    weapons.ads = 0.7;
    model.update(weapons, 0, 1 / 60, true);
    expect(root.visible).toBe(true);
    expect(root.position.y).toBeGreaterThan(hip.y);
    expect(root.position.z).toBeGreaterThan(hip.z);
    expect(Math.abs(root.position.x)).toBeLessThan(0.001);
    const material = Array.isArray(mesh.material)
      ? mesh.material[0]!
      : mesh.material;
    expect(material.opacity).toBe(1);
    weapons.ads = 0.85;
    model.update(weapons, 0, 1 / 60, true);
    expect(root.visible).toBe(false);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    weapons.ads = 1;
    model.update(weapons, 0, 1 / 60, true);
    expect(root.visible).toBe(false);
    weapons.ads = 0.7;
    model.update(weapons, 0, 1 / 60, true);
    expect(root.visible).toBe(true);
    expect(material.opacity).toBe(1);
    weapons.ads = 0;
    model.update(weapons, 0, 1 / 60, true);
    expect(root.position.toArray()).toEqual(hip.toArray());
    weapons.switchWeapon('rifle');
    weapons.ads = 1;
    model.update(weapons, 0, 1 / 60, true);
    expect(root.visible).toBe(true);
    const rifle = model.scene.getObjectByName('weapon-rifle') as InstancedMesh;
    expect(
      Array.isArray(rifle.material)
        ? rifle.material[0]!.transparent
        : rifle.material.transparent,
    ).toBe(false);
  } finally {
    model.dispose();
  }
});
