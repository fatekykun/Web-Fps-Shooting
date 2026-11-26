import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import {
  Matrix4,
  type DataTexture,
  type Mesh,
  type PlaneGeometry,
  type ShaderMaterial,
} from 'three';
import { weaponConfigs, type WeaponInput } from '@breakpoint/shared';
import { NeonAmmoDisplay } from './NeonAmmoDisplay';
import { WeaponViewmodel } from './WeaponViewmodel';
import { WeaponController } from './WeaponController';

afterEach(() => vi.unstubAllGlobals());

it('uses the capacity for the strict 20% threshold and fits larger magazines', () => {
  const display = new NeonAmmoDisplay();
  const { warning, strength, digits } = display.mesh.material.uniforms;
  const texture = digits!.value as DataTexture;
  display.update(8, 40, 0, false);
  const oldVersion = texture.version;
  expect(warning!.value).toBe(0);
  display.update(8, 45, 0.25, false);
  expect(warning!.value).toBe(1);
  expect(strength!.value).toBeLessThan(0.4);
  expect(texture.version).toBe(oldVersion);
  display.update(8, 45, 0.25, true);
  expect(strength!.value).toBe(1);
  display.update(155, 155, 0, false);
  expect(warning!.value).toBe(0);
  const pixels = texture.image.data as Uint8Array;
  for (const x of [26, 63, 99]) {
    expect(
      pixels.some(
        (pixel, i) => pixel > 0 && Math.abs((i % texture.image.width) - x) < 12,
      ),
    ).toBe(true);
  }
  display.dispose();
});

it('mounts the counter on the authored anchor and reads the real shot and reload state', async () => {
  const asset = await readFile(
    new URL('../../../public/models/neon_legend_smg.glb', import.meta.url),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array(asset))),
  );
  const model = new WeaponViewmodel();
  const weapons = new WeaponController(() => {});
  weapons.selected = 'smg';
  const idle: WeaponInput = {
    fire: false,
    aim: false,
    firePressed: false,
    reloadPressed: false,
    switchTo: null,
  };
  const accuracy = { speed: 0, verticalSpeed: 0, grounded: true };
  try {
    model.setSmgSkin('neon-blade');
    await vi.waitFor(() => expect(model.smgSkinStatus).toBe('ready'));
    const counter = model.scene.getObjectByName('neon-blade-ammo') as Mesh<
      PlaneGeometry,
      ShaderMaterial
    >;
    const anchor = counter.parent!;
    expect(anchor.name).toBe('Ammo_Display_Anchor');
    expect(anchor.parent?.name).toBe('neon-blade');
    expect(
      model.scene.getObjectByName('Ammo_Display_Static_33'),
    ).toBeUndefined();
    const texture = counter.material.uniforms.digits!.value as DataTexture;
    const pixels = () => new Uint8Array(texture.image.data as Uint8Array);
    const frame = (ads = 0) =>
      model.update(
        weapons,
        0,
        1 / 60,
        true,
        1,
        'walking',
        'classic',
        idle,
        ads,
      );
    frame();
    const full = pixels();
    weapons.step(1 / 60, { ...idle, firePressed: true }, accuracy);
    frame();
    expect(weapons.current.magazine).toBe(weaponConfigs.smg.magazine - 1);
    expect(pixels()).not.toEqual(full);
    expect(weapons.reload()).toBe(true);
    weapons.step(weapons.config.reloadTime * 0.5, idle, accuracy);
    frame();
    expect(pixels()).not.toEqual(full);
    weapons.step(weapons.config.reloadTime, idle, accuracy);
    frame(1);
    expect(pixels()).toEqual(full);
    const local = new Matrix4();
    for (const movement of ['sprinting', 'walking', 'sliding'] as const) {
      model.update(weapons, 8, 1 / 30, true, 1, movement, 'classic', idle);
      model.scene.updateMatrixWorld(true);
      local.copy(anchor.matrixWorld).invert().multiply(counter.matrixWorld);
      expect(local.elements[12]).toBeCloseTo(counter.position.x);
      expect(local.elements[13]).toBeCloseTo(counter.position.y);
    }
  } finally {
    model.dispose();
  }
});
