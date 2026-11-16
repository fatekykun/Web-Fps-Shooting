import { describe, expect, it } from 'vitest';
import {
  calculateSpread,
  weaponConfigs,
  type WeaponId,
  type WeaponInput,
} from '@breakpoint/shared';
import { WeaponController } from './WeaponController';

const idle: WeaponInput = {
  fire: false,
  aim: false,
  firePressed: false,
  reloadPressed: false,
  switchTo: null,
};
const grounded = { speed: 0, grounded: true, verticalSpeed: 0 };
const dt = 1 / 60;
function step(
  controller: WeaponController,
  count: number,
  input: WeaponInput = idle,
) {
  for (let i = 0; i < count; i++) controller.step(dt, input, grounded);
}

describe('local weapon rules', () => {
  it.each([30, 60, 144])(
    'reaches 90%% ADS in its configured duration at %i FPS',
    (fps) => {
      const controller = new WeaponController(() => {});
      const time = weaponConfigs.rifle.adsTime;
      const frames = Math.ceil(time * fps);
      for (let i = 0; i < frames; i++) controller.updateAds(1 / fps, true);
      expect(controller.ads).toBeGreaterThanOrEqual(0.9 - 1e-9);
      expect(controller.ads).toBeLessThan(1);
      const before = controller.ads;
      controller.updateAds(1 / fps, false);
      expect(controller.ads).toBeLessThan(before);
      expect(controller.fov).toBeGreaterThan(weaponConfigs.rifle.adsFov);
    },
  );

  it.each([
    ['rifle', 10],
    ['smg', 15],
  ] as const)(
    'limits %s automatic fire to its configured cadence',
    (id, shots) => {
      const controller = new WeaponController(() => {});
      controller.switchWeapon(id);
      step(controller, 15);
      step(controller, 60, { ...idle, fire: true });
      expect(controller.shotsFired).toBe(shots);
      expect(controller.current.magazine).toBe(
        weaponConfigs[id].magazine - shots,
      );
    },
  );

  it('retains short trigger taps and requires a new shotgun press', () => {
    const controller = new WeaponController(() => {});
    controller.step(dt, { ...idle, firePressed: true }, grounded);
    expect(controller.current.magazine).toBe(29);
    controller.switchWeapon('shotgun');
    step(controller, 15);
    controller.step(dt, { ...idle, firePressed: true, fire: true }, grounded);
    step(controller, 120, { ...idle, fire: true });
    expect(controller.ammo.shotgun.magazine).toBe(7);
    controller.step(dt, { ...idle, firePressed: true }, grounded);
    expect(controller.ammo.shotgun.magazine).toBe(6);
  });

  it('never spends more than the magazine or catches up with a burst after a stall', () => {
    const controller = new WeaponController(() => {});
    step(controller, 400, { ...idle, fire: true });
    expect(controller.current.magazine).toBe(0);
    expect(controller.shotsFired).toBe(30);
    const second = new WeaponController(() => {});
    second.step(1, { ...idle, fire: true }, grounded);
    expect(second.shotsFired).toBe(1);
  });

  it('finishes a reload atomically and conserves ammo', () => {
    const controller = new WeaponController(() => {});
    step(controller, 18, { ...idle, fire: true });
    expect(controller.current.magazine).toBe(27);
    controller.reload();
    step(controller, 119);
    expect(controller.current.magazine).toBe(27);
    expect(controller.current.reserve).toBe(120);
    step(controller, 1);
    expect(controller.reloading).toBe(false);
    expect(controller.current.magazine).toBe(30);
    expect(controller.current.reserve).toBe(117);
    controller.reload();
    expect(controller.reloading).toBe(false);
  });

  it('cancels reload on switch without free ammunition and keeps each magazine', () => {
    const controller = new WeaponController(() => {});
    step(controller, 18, { ...idle, fire: true });
    controller.reload();
    step(controller, 60);
    controller.switchWeapon('smg');
    step(controller, 240);
    expect(controller.ammo.rifle.magazine).toBe(27);
    expect(controller.ammo.rifle.reserve).toBe(120);
    controller.switchWeapon('rifle');
    controller.step(dt, { ...idle, fire: true }, grounded);
    expect(controller.current.magazine).toBe(27);
    step(controller, 15);
    controller.step(dt, { ...idle, fire: true }, grounded);
    expect(controller.current.magazine).toBe(26);
  });

  it('respects finite reserves and does not fire or stay in ADS while reloading', () => {
    const controller = new WeaponController(() => {});
    controller.current.magazine = 0;
    controller.current.reserve = 2;
    for (let i = 0; i < 30; i++) controller.updateAds(dt, true);
    controller.reload();
    controller.updateAds(0.1, true);
    expect(controller.ads).toBeLessThan(0.3);
    step(controller, 119, { ...idle, fire: true });
    expect(controller.shotsFired).toBe(0);
    step(controller, 1);
    expect(controller.current.magazine).toBe(2);
    expect(controller.current.reserve).toBe(0);
  });

  it('cannot bypass the shotgun cooldown by cycling weapons', () => {
    const controller = new WeaponController(() => {});
    controller.switchWeapon('shotgun');
    step(controller, 15);
    controller.step(dt, { ...idle, firePressed: true }, grounded);
    controller.switchWeapon('rifle');
    step(controller, 15);
    controller.switchWeapon('shotgun');
    step(controller, 15);
    controller.step(dt, { ...idle, firePressed: true }, grounded);
    expect(controller.ammo.shotgun.magazine).toBe(7);
  });

  it('builds and recovers bloom independently of camera recoil', () => {
    const controller = new WeaponController(() => {});
    const initial = calculateSpread(controller.config, 0, 0, grounded);
    step(controller, 30, { ...idle, fire: true });
    expect(controller.current.bloom).toBeGreaterThan(0);
    expect(controller.recoil.pitch).toBeGreaterThan(0);
    expect(controller.spread).toBeGreaterThan(initial);
    step(controller, 240);
    expect(controller.current.bloom).toBe(0);
    expect(controller.recoil.pitch).toBeLessThan(0.0001);
    expect(controller.spread).toBeCloseTo(initial);
  });

  it('caps camera recoil without modifying the separate accuracy cone', () => {
    const controller = new WeaponController(() => {});
    const spread = calculateSpread(controller.config, 0, 0, grounded);
    for (let i = 0; i < 1000; i++)
      controller.recoil.kick(controller.config, 1, 0);
    expect(controller.recoil.pitch).toBeCloseTo((6 * Math.PI) / 180);
    expect(controller.recoil.yaw).toBeCloseTo((3 * Math.PI) / 180);
    expect(calculateSpread(controller.config, 0, 0, grounded)).toBe(spread);
  });

  it.each(['rifle', 'smg', 'shotgun'] as WeaponId[])(
    'uses valid nonzero %s tuning',
    (id) => {
      const config = weaponConfigs[id];
      expect(config.adsSpread).toBeLessThan(config.hipSpread);
      expect(config.fireInterval).toBeGreaterThanOrEqual(dt);
      expect(config.pellets).toBeGreaterThan(0);
    },
  );
});
