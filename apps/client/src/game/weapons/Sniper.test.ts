import { describe, expect, it } from 'vitest';
import {
  calculateSpread,
  weaponConfigs,
  type WeaponInput,
} from '@breakpoint/shared';
import { WeaponController } from './WeaponController';

const idle: WeaponInput = {
  fire: false,
  firePressed: false,
  aim: false,
  reloadPressed: false,
  switchTo: null,
};
const ground = { speed: 0, grounded: true, verticalSpeed: 0 };
const dt = 1 / 60;
function step(w: WeaponController, n: number, input = idle) {
  for (let i = 0; i < n; i++) w.step(dt, input, ground);
}
function sniper() {
  const w = new WeaponController(() => {});
  w.switchWeapon('sniper');
  step(w, 15);
  return w;
}
describe('bolt-action sniper', () => {
  it('gates every cycle, discards early taps, requires fresh presses and cannot bypass by switching', () => {
    const w = sniper();
    step(w, 1, { ...idle, firePressed: true });
    expect(w.current.magazine).toBe(4);
    expect(w.cycling).toBe(true);
    step(w, 20, { ...idle, firePressed: true });
    expect(w.shotsFired).toBe(1);
    w.switchWeapon('rifle');
    step(w, 12);
    w.switchWeapon('sniper');
    step(w, 12);
    step(w, 1, { ...idle, firePressed: true });
    expect(w.shotsFired).toBe(1);
    step(w, 80, { ...idle, fire: true });
    expect(w.cycling).toBe(false);
    expect(w.shotsFired).toBe(1);
    step(w, 1, { ...idle, firePressed: true });
    expect(w.current.magazine).toBe(3);
    expect(w.recoil.pitch).toBeGreaterThan(0);
  });
  it('enforces the 45 RPM boundary and all five rounds, then transfers only server-rule reserve ammo', () => {
    const w = sniper();
    for (let i = 0; i < 5; i++) {
      step(w, 1, { ...idle, firePressed: true });
      step(w, 79, { ...idle, fire: true });
      expect(w.shotsFired).toBe(i + 1);
    }
    expect(w.current.magazine).toBe(0);
    w.reload();
    step(w, 100, { ...idle, firePressed: true });
    expect(w.current.magazine).toBe(0);
    step(w, 70);
    expect(w.current).toMatchObject({ magazine: 5, reserve: 15 });
    expect(w.shotsFired).toBe(5);
    step(w, 1, { ...idle, firePressed: true });
    w.reload();
    step(w, 60);
    w.switchWeapon('smg');
    step(w, 200);
    expect(w.ammo.sniper).toMatchObject({ magazine: 4, reserve: 15 });
  });
  it.each([30, 60, 144])(
    'smoothly reaches ADS and provides true 4x zoom at %i FPS for a custom FOV',
    (fps) => {
      const w = sniper();
      const frames = Math.ceil(weaponConfigs.sniper.adsTime * fps);
      for (let i = 0; i < frames - 1; i++) w.updateAds(1 / fps, true);
      expect(w.ads).toBeLessThan(0.9);
      w.updateAds(1 / fps, true);
      expect(w.ads).toBeGreaterThanOrEqual(0.9 - 1e-9);
      expect(w.ads).toBeLessThan(1);
      w.ads = 1;
      expect(
        Math.tan((103 * Math.PI) / 360) /
          Math.tan((w.fieldOfView(103) * Math.PI) / 360),
      ).toBeCloseTo(4);
      w.updateAds(1 / fps, false);
      expect(w.ads).toBeLessThan(1);
      for (let i = 0; i < fps * 2; i++) w.updateAds(1 / fps, false);
      expect(w.fieldOfView(103)).toBeCloseTo(103, 3);
    },
  );
  it('keeps ADS available during traversal and only slows scoped walking, with airborne spread', () => {
    const w = sniper();
    expect(w.config.adsTime).toBeCloseTo(0.35 * 0.9, 10);
    expect(w.movementScale(true, {}, 'walking')).toBe(0.45);
    expect(w.movementScale(false, {}, 'walking')).toBe(1);
    for (const state of [
      'sprinting',
      'sliding',
      'backsliding',
      'diving',
      'recovering',
      'airborne',
    ]) {
      expect(w.movementScale(true, {}, state)).toBe(1);
      w.ads = 0;
      for (let frame = 0; frame < 30; frame++) {
        w.updateAds(dt, true);
        w.step(
          dt,
          { ...idle, aim: true },
          {
            ...ground,
            grounded: state !== 'airborne',
            verticalSpeed: state === 'airborne' ? 4 : 0,
          },
        );
      }
      expect(w.ads).toBeGreaterThan(0.97);
    }
    expect(w.movementScale(true, { sprint: true }, 'walking')).toBe(1);
    expect(w.movementScale(true, { slidePressed: true }, 'walking')).toBe(1);
    const config = weaponConfigs.sniper;
    const scoped = calculateSpread(config, 1, 0, ground);
    expect(calculateSpread(config, 0, 0, ground)).toBeGreaterThan(scoped * 100);
    expect(
      calculateSpread(config, 1, 0, {
        ...ground,
        grounded: false,
        verticalSpeed: 4,
      }),
    ).toBeGreaterThan(scoped * 50);
    w.switchWeapon('rifle');
    step(w, 15);
    expect(w.movementScale(true, {}, 'walking')).toBe(1);
  });
});
