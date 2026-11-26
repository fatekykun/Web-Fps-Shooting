import { expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Box3, InstancedMesh, Matrix4, NearestFilter, Vector3 } from 'three';
import { WeaponViewmodel } from './WeaponViewmodel';
import { WeaponController } from './WeaponController';

it('frames Molten Lava before the first gameplay update without unplaced embers', () => {
  const viewmodel = new WeaponViewmodel();
  try {
    const model = viewmodel.showcaseModel('rifle', true);
    const embers = model.getObjectByName('cinder-embers') as InstancedMesh;
    const shards = model.getObjectByName('cinder-fragments') as InstancedMesh;
    expect(embers.visible).toBe(false);
    expect(embers.count).toBe(0);
    const shard = new Matrix4();
    shards.getMatrixAt(0, shard);
    expect(new Vector3().setFromMatrixPosition(shard).y).toBeGreaterThan(0.1);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    expect(size.z).toBeGreaterThan(size.y * 2);
    expect(size.x).toBeLessThan(0.3);
  } finally {
    viewmodel.dispose();
  }
});

it('animates Molten Lava using pooled geometry and collimates its optic', () => {
  const model = new WeaponViewmodel();
  const weapons = new WeaponController(() => {});
  const step = (ads = 0, moving = false) =>
    model.update(
      weapons,
      moving ? 3 : 0,
      1 / 60,
      true,
      1,
      'walking',
      'classic',
      { aim: ads > 0, fire: false },
      ads,
    );
  try {
    expect(model.scene.getObjectByName('cinder-wyrm')).toBeUndefined();
    model.setRifleSkin('cinder-wyrm');
    step();
    const body = model.scene.getObjectByName('cinder-wyrm')!;
    const mark = model.scene.getObjectByName('cinder-reticle')!;
    const particles = model.scene.getObjectByName(
      'cinder-embers',
    ) as InstancedMesh;
    expect(body.visible).toBe(true);
    expect(mark.visible).toBe(false);
    expect(particles.count).toBeLessThanOrEqual(16);
    expect(model.scene.getObjectByName('weapon-rifle')!.visible).toBe(false);
    const hipYaw = body.parent!.rotation.y;
    model.requestInspect();
    for (let i = 0; i < 32; i++) step();
    expect(model.inspecting).toBe(true);
    expect(body.parent!.rotation.y - hipYaw).toBeGreaterThan(0.9);
    for (let i = 0; i < 20; i++) step(0, true);
    expect(model.inspecting).toBe(false);
    model.requestInspect();
    step();
    expect(model.inspecting).toBe(true);
    step(1);
    expect(model.inspecting).toBe(false);
    expect(mark.visible).toBe(true);
    model.camera.updateMatrixWorld();
    const projected = mark
      .getWorldPosition(new Vector3())
      .project(model.camera);
    expect(projected.x).toBeCloseTo(0, 9);
    expect(projected.y).toBeCloseTo(0, 9);
    model.setRifleSkin('standard');
    step(1);
    expect(body.visible).toBe(false);
    expect(mark.visible).toBe(false);
    expect(model.scene.getObjectByName('weapon-rifle')!.visible).toBe(true);
  } finally {
    model.dispose();
  }
});

it('layers smooth kickback and rotation over the pose, with a smaller ADS impulse', () => {
  const kick = (ads: number) => {
    const model = new WeaponViewmodel();
    const weapons = new WeaponController(() => {});
    weapons.ads = ads;
    const root = model.scene.getObjectByName('weapon-rifle')!.parent!;
    const update = (preview = 0) =>
      model.update(
        weapons,
        0,
        1 / 60,
        true,
        1,
        'walking',
        'classic',
        undefined,
        ads,
        preview,
      );
    try {
      update();
      const start = root.position.clone();
      weapons.step(
        1 / 60,
        {
          fire: false,
          firePressed: true,
          aim: !!ads,
          reloadPressed: false,
          switchTo: null,
        },
        { speed: 0, grounded: true, verticalSpeed: 0 },
      );
      model.simulateRecoil(weapons, 1 / 60, true);
      update();
      expect(root.position.toArray()).toEqual(start.toArray());
      update(1 / 120);
      expect(root.position.z).toBeGreaterThan(start.z);
      for (let i = 0; i < 2; i++) model.simulateRecoil(weapons, 1 / 60, false);
      update();
      const distance = root.position.z - start.z;
      expect(root.rotation.x).toBeGreaterThan(0);
      expect(Math.abs(root.position.x - start.x)).toBeGreaterThan(0);
      for (let i = 0; i < 90; i++) model.simulateRecoil(weapons, 1 / 60, false);
      update();
      expect(root.position.distanceTo(start)).toBeLessThan(0.000001);
      return distance;
    } finally {
      model.dispose();
    }
  };
  const hip = kick(0);
  expect(hip).toBeGreaterThan(0.02);
  expect(kick(1)).toBeCloseTo(hip * 0.5, 8);
});

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

it('frames each melee blade and keeps its gripping hands on the hilt through a swing', async () => {
  vi.stubGlobal(
    'fetch',
    async (path: string) =>
      new Response(
        new Uint8Array(
          await readFile(
            new URL(
              `../../../public/models/${path.split('/').at(-1)}`,
              import.meta.url,
            ),
          ),
        ),
      ),
  );
  const viewmodel = new WeaponViewmodel();
  const weapons = new WeaponController(() => {});
  const blade = viewmodel.scene.getObjectByName('melee-model')!;
  const right = viewmodel.scene.getObjectByName('rightWrist')!;
  const left = viewmodel.scene.getObjectByName('leftWrist')!;
  const arms = viewmodel.scene.getObjectByName(
    'tactical-arms-mesh',
  ) as InstancedMesh;
  const project = (point: Vector3) =>
    blade.localToWorld(point).project(viewmodel.camera);
  const wristOnBlade = (wrist: typeof right, grip: Vector3, context: string) =>
    expect(
      blade
        .worldToLocal(wrist.getWorldPosition(new Vector3()))
        .distanceTo(grip),
      context,
    ).toBeLessThan(0.001);
  try {
    viewmodel.resize(1280, 720);
    weapons.selected = 'melee';
    for (const [skin, tip] of [
      ['glacier-fang', [0, 0.255, 0]],
      ['ember-talon', [0.105, 0.105, 0]],
      ['void-ronin', [0.07, 0.94, 0]],
    ] as const) {
      // Reset the swing timer between skins so each ready stance is sampled.
      weapons.current.lastShot = -100;
      viewmodel.setMeleeSkin(skin);
      await vi.waitFor(() => expect(viewmodel.meleeSkinStatus).toBe('ready'));
      expect(blade.children).toHaveLength(1);
      viewmodel.update(weapons, 0, 1 / 60, true);
      const hilt = project(new Vector3());
      const edge = project(new Vector3(...tip));
      expect(hilt.x).toBeGreaterThan(0.3);
      expect(edge.y).toBeGreaterThan(hilt.y);
      expect(edge.y).toBeLessThan(1);
      if (skin === 'void-ronin') {
        expect(edge.x).toBeGreaterThan(hilt.x);
        const grip = blade.worldToLocal(left.getWorldPosition(new Vector3()));
        expect(grip.y).toBeCloseTo(-0.06, 3);
      } else {
        expect(edge.x).toBeLessThan(hilt.x);
        expect(
          left.getWorldPosition(new Vector3()).project(viewmodel.camera).x,
        ).toBeLessThan(-0.5);
      }
      const rightGrip = new Vector3(
        skin === 'ember-talon' ? -0.058 : 0.058,
        skin === 'void-ronin' ? 0.064 : 0,
        skin === 'ember-talon' ? -0.032 : 0.032,
      );
      const leftGrip = new Vector3(-0.058, -0.06, 0.032);
      wristOnBlade(right, rightGrip, skin);
      expect(arms.count).toBe(26);

      for (const age of [0.065, 0.125, 0.195, 0.28, 0.425]) {
        weapons.current.lastShot = weapons.time - age;
        viewmodel.update(weapons, 8, 1 / 60, true, 1, 'sprinting');
        if (age === 0.195)
          expect(project(new Vector3()).x).toBeLessThan(hilt.x - 0.35);
        wristOnBlade(right, rightGrip, `${skin} right wrist at ${age}s`);
        if (skin === 'void-ronin')
          wristOnBlade(left, leftGrip, `${skin} left wrist at ${age}s`);
      }
    }
    weapons.selected = 'rifle';
    viewmodel.update(weapons, 0, 1 / 60, true);
    expect(blade.visible).toBe(false);
    expect(arms.count).toBe(16);
  } finally {
    viewmodel.dispose();
    vi.unstubAllGlobals();
  }
});
