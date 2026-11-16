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
    expect(count).toBeLessThan(40);
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
