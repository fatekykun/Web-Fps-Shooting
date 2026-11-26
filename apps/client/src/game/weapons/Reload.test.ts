import { expect, it } from 'vitest';
import {
  weaponConfigs,
  weaponOrder,
  type WeaponId,
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
const context = { speed: 0, grounded: true, verticalSpeed: 0 },
  dt = 1 / 60;
const press = { ...idle, fire: true, firePressed: true };
function step(w: WeaponController, count = 1, input = idle) {
  for (let i = 0; i < count; i++) w.step(dt, input, context);
}
function setup(id: WeaponId = 'rifle') {
  const w = new WeaponController(() => {});
  w.switchWeapon(id);
  step(w, 15);
  return w;
}

it.each(weaponOrder.filter((id) => !weaponConfigs[id].reloadPerShell))(
  'automatically reloads the last %s round once, ignores empty-magazine interrupts and respects limited reserves',
  (id) => {
    const w = setup(id),
      duration = Math.round(w.config.reloadTime / dt);
    expect(w.autoReload).toBe(true);
    w.current.magazine = 1;
    w.current.reserve = 3;
    step(w, 1, press);
    expect(w.reloading).toBe(true);
    expect(w.current).toMatchObject({ magazine: 0, reserve: 3 });
    step(w, duration - 1, press);
    expect(w.shotsFired).toBe(1);
    expect(w.reloading).toBe(true);
    expect(w.current).toMatchObject({ magazine: 0, reserve: 3 });
    step(w);
    expect(w.reloading).toBe(false);
    expect(w.current).toMatchObject({ magazine: 3, reserve: 0 });
    step(w, 1, press);
    expect(w.current.magazine).toBe(2);
  },
);

it.each(weaponOrder)('supports manual %s reload with auto reload off', (id) => {
  const w = setup(id);
  w.current.magazine = 1;
  w.current.reserve = 3;
  step(w, 1, { ...press, autoReload: false });
  step(w, 240);
  expect(w.autoReload).toBe(false);
  expect(w.reloading).toBe(false);
  expect(w.current).toMatchObject({ magazine: 0, reserve: 3 });
  step(w, 1, { ...idle, reloadPressed: true });
  expect(w.reloading).toBe(true);
  step(w, 240);
  expect(w.current).toMatchObject({ magazine: 3, reserve: 0 });
});

it.each(weaponOrder)(
  'interrupts a partial %s reload and never transfers ammo from the cancelled timer',
  (id) => {
    const w = setup(id);
    w.current.magazine = 2;
    w.current.reserve = 5;
    expect(w.reload()).toBe(true);
    step(w, Math.round(w.config.reloadTime / dt / 2));
    step(w, 1, press);
    expect(w.reloading).toBe(false);
    expect(w.shotsFired).toBe(1);
    expect(w.current).toMatchObject({ magazine: 1, reserve: 5 });
    step(w, 240);
    expect(w.current).toMatchObject({ magazine: 1, reserve: 5 });
    expect(w.reload()).toBe(true);
    step(w, Math.round(w.config.reloadTime / dt));
    expect(w.current.magazine + w.current.reserve).toBe(6);
    expect(w.current.magazine).toBeLessThanOrEqual(weaponConfigs[id].magazine);
  },
);

it.each(weaponOrder)(
  'fires normally on the %s reload completion tick',
  (id) => {
    const w = setup(id);
    w.current.magazine = 1;
    w.current.reserve = 2;
    w.reload();
    step(w, Math.round(w.config.reloadTime / dt) - 1);
    step(w, 1, press);
    expect(w.reloading).toBe(false);
    expect(w.shotsFired).toBe(1);
    expect(w.current).toMatchObject(
      w.config.reloadPerShell
        ? { magazine: 1, reserve: 1 }
        : { magazine: 2, reserve: 0 },
    );
  },
);

it('loads shotgun shells one at a time, fires the first shell, and reloads again from empty', () => {
  const w = setup('shotgun');
  const shellTicks = Math.round(w.config.reloadTime / dt);
  w.current.magazine = 1;
  w.current.reserve = 4;
  step(w, 1, press);
  expect(w.reloading).toBe(true);
  expect(w.current).toMatchObject({ magazine: 0, reserve: 4 });

  step(w, shellTicks - 1, press);
  expect(w.shotsFired).toBe(1);
  expect(w.current).toMatchObject({ magazine: 0, reserve: 4 });

  // A press on the insertion tick can use the first shell immediately.
  step(w, 1, press);
  expect(w.shotsFired).toBe(2);
  expect(w.reloading).toBe(true);
  expect(w.reloadProgress).toBeCloseTo(0);
  expect(w.current).toMatchObject({ magazine: 0, reserve: 3 });
  step(w, shellTicks);
  expect(w.current).toMatchObject({ magazine: 1, reserve: 2 });
  expect(w.reloading).toBe(true);
  step(w, shellTicks);
  expect(w.current).toMatchObject({ magazine: 2, reserve: 1 });
  step(w, 1, press);
  expect(w.shotsFired).toBe(3);
  expect(w.reloading).toBe(false);
  step(w, shellTicks);
  expect(w.current).toMatchObject({ magazine: 1, reserve: 1 });
});

it.each([false, true])(
  'stops inserting shells at capacity or when reserve runs out (limited reserve: %s)',
  (limited) => {
    const w = setup('shotgun');
    w.current.magazine = 6;
    w.current.reserve = limited ? 1 : 3;
    w.reload();
    w.step(w.config.reloadTime * 3, idle, context);
    expect(w.reloading).toBe(false);
    expect(w.current).toMatchObject(
      limited ? { magazine: 7, reserve: 0 } : { magazine: 8, reserve: 1 },
    );
  },
);

it('keeps a shotgun empty after firing the first shell with Auto Reload off', () => {
  const w = setup('shotgun');
  w.current.magazine = 0;
  w.current.reserve = 2;
  const shellTicks = Math.round(w.config.reloadTime / dt);
  step(w, 1, { ...idle, autoReload: false, reloadPressed: true });
  step(w, shellTicks);
  expect(w.current).toMatchObject({ magazine: 1, reserve: 1 });
  expect(w.reloading).toBe(true);
  step(w, 1, press);
  expect(w.shotsFired).toBe(1);
  expect(w.reloading).toBe(false);
  step(w, shellTicks);
  expect(w.current).toMatchObject({ magazine: 0, reserve: 1 });
});

it('does not restart an active reload or overfill a magazine', () => {
  const w = setup();
  w.current.magazine = 0;
  w.current.reserve = 37;
  expect(w.reload()).toBe(true);
  for (let i = 0; i < 119; i++) {
    expect(w.reload()).toBe(false);
    step(w);
  }
  expect(w.current.reserve).toBe(37);
  step(w);
  expect(w.current).toMatchObject({ magazine: 30, reserve: 7 });
  expect(w.reload()).toBe(false);
});

it('never starts a pointless empty-reserve reload', () => {
  const w = setup();
  w.current.magazine = 0;
  w.current.reserve = 0;
  step(w, 300, { ...press, reloadPressed: true });
  expect(w.reload()).toBe(false);
  expect(w.reloading).toBe(false);
  expect(w.shotsFired).toBe(0);
});

it('does not treat held fire as a new reload interruption', () => {
  const w = setup();
  w.current.magazine = 10;
  w.reload();
  step(w, 119, { ...idle, fire: true });
  expect(w.reloading).toBe(true);
  expect(w.shotsFired).toBe(0);
  expect(w.current.magazine).toBe(10);
});

it('applies preference changes to future auto reloads without cancelling an active reload', () => {
  const w = setup();
  w.current.magazine = 0;
  w.current.reserve = 2;
  step(w, 60, { ...idle, autoReload: false });
  expect(w.reloading).toBe(false);
  step(w, 1, { ...idle, autoReload: true });
  expect(w.reloading).toBe(true);
  step(w, 120, { ...idle, autoReload: false });
  expect(w.current).toMatchObject({ magazine: 2, reserve: 0 });
  expect(w.autoReload).toBe(false);
});

it('cancels on switch and automatically reloads an empty weapon only after equipping it again', () => {
  const w = setup();
  w.current.magazine = 0;
  w.current.reserve = 2;
  step(w);
  expect(w.reloading).toBe(true);
  w.switchWeapon('smg');
  step(w, 150);
  expect(w.ammo.rifle).toMatchObject({ magazine: 0, reserve: 2 });
  w.switchWeapon('rifle');
  step(w, 10);
  expect(w.reloading).toBe(false);
  step(w, 2);
  expect(w.reloading).toBe(true);
  step(w, 120);
  expect(w.current).toMatchObject({ magazine: 2, reserve: 0 });
});

it.each(['fire', 'aim'] as const)(
  'keeps sniper bolt and fire-rate validation when %s interrupts a partial reload',
  (action) => {
    const w = setup('sniper');
    step(w, 1, press);
    w.reload();
    step(w, 5);
    step(
      w,
      1,
      action === 'fire' ? press : { ...idle, aim: true, aimPressed: true },
    );
    expect(w.reloading).toBe(false);
    expect(w.cycling).toBe(true);
    expect(w.shotsFired).toBe(1);
    expect(w.current).toMatchObject({ magazine: 4, reserve: 20 });
    step(w, 100);
    step(w, 1, press);
    expect(w.shotsFired).toBe(2);
    expect(w.current.magazine).toBe(3);
  },
);

it.each(weaponOrder)(
  'cancels a partial %s reload on fresh ADS without firing or transferring ammo',
  (id) => {
    const w = setup(id);
    w.current.magazine = 2;
    w.current.reserve = 5;
    w.reload();
    step(w, 20);
    step(w, 1, { ...idle, aim: true, aimPressed: true });
    expect(w.reloading).toBe(false);
    w.updateAds(0.1, true);
    expect(w.ads).toBeGreaterThan(0);
    step(w, 240, { ...idle, aim: true });
    expect(w.shotsFired).toBe(0);
    expect(w.current).toMatchObject({ magazine: 2, reserve: 5 });
    // Reloading while already aiming is intentional; holding ADS is not a new press.
    step(w, 1, { ...idle, aim: true, reloadPressed: true });
    step(w, 20, { ...idle, aim: true });
    expect(w.reloading).toBe(true);
    step(w, 1, idle);
    step(w, 1, { ...idle, aim: true, aimPressed: true });
    expect(w.reloading).toBe(false);
  },
);

it.each(weaponOrder)(
  'protects an empty %s reload from fresh ADS and aims after completion',
  (id) => {
    const w = setup(id);
    w.current.magazine = 0;
    w.current.reserve = 3;
    w.reload();
    const duration = Math.round(w.config.reloadTime / dt);
    step(w, duration - 1, { ...idle, aim: true, aimPressed: true });
    w.updateAds(0.1, true);
    expect(w.reloading).toBe(true);
    expect(w.ads).toBe(0);
    expect(w.current).toMatchObject({ magazine: 0, reserve: 3 });
    step(w, 1, { ...idle, aim: true, aimPressed: true });
    w.updateAds(0.1, true);
    expect(w.reloading).toBe(false);
    expect(w.ads).toBeGreaterThan(0);
    expect(w.current).toMatchObject(
      w.config.reloadPerShell
        ? { magazine: 1, reserve: 2 }
        : { magazine: 3, reserve: 0 },
    );
    expect(w.shotsFired).toBe(0);
  },
);
