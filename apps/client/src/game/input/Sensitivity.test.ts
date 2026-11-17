import { afterEach, expect, it, vi } from 'vitest';
import { movementConfig, weaponOrder } from '@breakpoint/shared';
import { InputController } from './InputController';
import { WeaponController } from '../weapons/WeaponController';
import {
  defaultUserSettings,
  type UserSettings,
} from '../settings/userSettings';

const base = movementConfig.sensitivity;
afterEach(() => vi.unstubAllGlobals());
function setup(settings = defaultUserSettings()) {
  const dom = new EventTarget();
  vi.stubGlobal('document', dom);
  vi.stubGlobal('window', new EventTarget());
  const w = new WeaponController(() => {});
  const input = new InputController(
    new EventTarget() as HTMLCanvasElement,
    () => {},
    () => {},
    () => {},
    () => w,
  );
  input.configure(settings);
  input.locked = true;
  const event = (type: string, values: object) =>
    dom.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), values),
    );
  const move = (x = 10, y = 8) =>
    event('mousemove', { movementX: x, movementY: y });
  return { input, w, event, move };
}
function tuned(): UserSettings {
  return {
    ...defaultUserSettings(),
    sensitivity: {
      camera: { steering: 50, ads: 125, sniper: 225, vertical: 80 },
      firing: { steering: 175, ads: 60, sniper: 140, vertical: 30 },
    },
  };
}
it.each(weaponOrder)(
  'selects independent camera/firing hip and ADS values for %s with sniper priority and single zoom scaling',
  (id) => {
    const settings = tuned(),
      { input, w, event, move } = setup(settings);
    try {
      w.switchWeapon(id);
      w.step(0.3, input.weapon, { speed: 0, grounded: true, verticalSpeed: 0 });
      input.lookScale = 0.5;
      for (const firing of [false, true]) {
        event(firing ? 'mousedown' : 'mouseup', { button: 0 });
        const group = settings.sensitivity[firing ? 'firing' : 'camera'];
        for (const ads of [0, 0.5, 1]) {
          w.ads = ads;
          input.movement.yaw = input.pitch = 0;
          move();
          const aimed = id === 'sniper' ? group.sniper : group.ads;
          expect(input.movement.yaw).toBeCloseTo(
            (-10 *
              base *
              0.5 *
              (group.steering + (aimed - group.steering) * ads)) /
              100,
            10,
          );
          expect(input.pitch).toBeCloseTo(
            (-8 * base * 0.5 * group.vertical) / 100,
            10,
          );
        }
      }
      // Mouseup changes category before any simulation/render frame, even if a tap is queued.
      event('mouseup', { button: 0 });
      expect(input.weapon.firePressed).toBe(true);
      input.movement.yaw = input.pitch = 0;
      move();
      expect(input.movement.yaw).toBeCloseTo(
        -10 * base * 0.5 * (id === 'sniper' ? 2.25 : 1.25),
        10,
      );
      expect(input.pitch).toBeCloseTo(-8 * base * 0.5 * 0.8, 10);
    } finally {
      input.dispose();
    }
  },
);
it('uses camera values for empty/equipping weapons and firing values when a partial reload can cancel', () => {
  const { input, w, event, move } = setup(tuned());
  try {
    event('mousedown', { button: 0 });
    w.current.magazine = 0;
    move();
    expect(input.movement.yaw).toBeCloseTo(-10 * base * 0.5);
    w.current.magazine = 10;
    input.consumeActions();
    w.reload();
    input.movement.yaw = 0;
    move();
    expect(input.movement.yaw).toBeCloseTo(-10 * base * 0.5);
    event('mouseup', { button: 0 });
    event('mousedown', { button: 0 });
    input.movement.yaw = 0;
    move();
    expect(input.movement.yaw).toBeCloseTo(-10 * base * 1.75);
    w.switchWeapon('smg');
    input.movement.yaw = 0;
    move();
    expect(input.movement.yaw).toBeCloseTo(-10 * base * 0.5);
  } finally {
    input.dispose();
  }
});
it('changes sensitivity immediately without rotating or clearing movement/aim/fire input', () => {
  const { input, event, move } = setup();
  try {
    event('keydown', { code: 'KeyW' });
    event('keydown', { code: 'ShiftLeft' });
    event('keydown', { code: 'Space' });
    event('keydown', { code: 'KeyC' });
    event('mousedown', { button: 0 });
    event('mousedown', { button: 2 });
    move();
    const before = { yaw: input.movement.yaw, pitch: input.pitch };
    input.configure(tuned());
    expect(input.movement).toMatchObject({
      forward: 1,
      sprint: true,
      jumpPressed: true,
      slidePressed: true,
    });
    expect(input.weapon).toMatchObject({
      aim: true,
      fire: true,
      firePressed: true,
    });
    expect(input.movement.yaw).toBe(before.yaw);
    expect(input.pitch).toBe(before.pitch);
    move();
    expect(input.movement.yaw - before.yaw).toBeCloseTo(-10 * base * 1.75);
    expect(input.pitch - before.pitch).toBeCloseTo(-8 * base * 0.3);
    event('mouseup', { button: 0 });
    const yaw = input.movement.yaw;
    move();
    expect(input.movement.yaw - yaw).toBeCloseTo(-10 * base * 0.5);
  } finally {
    input.dispose();
  }
});
it('keeps each axis independent, preserves invert Y and safely wraps/clamps large input', () => {
  const settings = tuned();
  settings.invertY = true;
  settings.sensitivity.camera.steering = 300;
  settings.sensitivity.camera.vertical = 1;
  const { input, move } = setup(settings);
  try {
    move();
    expect(input.movement.yaw).toBeCloseTo(-10 * base * 3);
    expect(input.pitch).toBeCloseTo(8 * base * 0.01);
    move(1e9, 1e9);
    expect(input.movement.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(input.movement.yaw).toBeLessThan(Math.PI);
    expect(input.pitch).toBe(Math.PI / 2 - 0.02);
    const before = { yaw: input.movement.yaw, pitch: input.pitch };
    move(NaN, Infinity);
    expect(input.movement.yaw).toBe(before.yaw);
    expect(input.pitch).toBe(before.pitch);
    input.locked = false;
    move();
    expect(input.movement.yaw).toBe(before.yaw);
    expect(input.pitch).toBe(before.pitch);
  } finally {
    input.dispose();
  }
});
it('integrates equal mouse distance equally across event/frame partitions without acceleration', () => {
  const { input, move } = setup(tuned());
  try {
    move(120, 60);
    const once = { yaw: input.movement.yaw, pitch: input.pitch };
    for (const frames of [30, 60, 144]) {
      input.movement.yaw = input.pitch = 0;
      for (let i = 0; i < frames; i++) move(120 / frames, 60 / frames);
      expect(input.movement.yaw).toBeCloseTo(once.yaw, 10);
      expect(input.pitch).toBeCloseTo(once.pitch, 10);
    }
  } finally {
    input.dispose();
  }
});
