import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from './InputManager';
import { requestGyroAccess } from './GyroInput';
import { WeaponController } from '../weapons/WeaponController';
import {
  classifyDevice,
  requestLandscape,
  type DeviceSignals,
} from './deviceCapabilities';
import {
  defaultUserSettings,
  normalizeUserSettings,
} from '../settings/userSettings';

const desktop: DeviceSignals = {
  touchPoints: 0,
  coarse: false,
  fine: true,
  hover: true,
  screenWidth: 1920,
  screenHeight: 1080,
  width: 1280,
  height: 720,
  userAgent: '',
  platform: 'Win32',
};
it('detects phone, tablet, iPad desktop UA, and touchscreen laptops from capabilities', () => {
  expect(classifyDevice(desktop).kind).toBe('desktop');
  expect(
    classifyDevice({ ...desktop, touchPoints: 10, coarse: true }).kind,
  ).toBe('hybrid');
  const touch = {
    ...desktop,
    touchPoints: 5,
    coarse: true,
    fine: false,
    hover: false,
  };
  expect(
    classifyDevice({ ...touch, screenWidth: 390, screenHeight: 844 }).kind,
  ).toBe('phone');
  expect(
    classifyDevice({ ...touch, screenWidth: 820, screenHeight: 1180 }).kind,
  ).toBe('tablet');
  expect(
    classifyDevice({ ...desktop, touchPoints: 5, platform: 'MacIntel' }).kind,
  ).toBe('tablet');
  expect(classifyDevice({ ...touch, width: 390, height: 844 }).landscape).toBe(
    false,
  );
  expect(classifyDevice({ ...touch, width: 844, height: 390 }).landscape).toBe(
    true,
  );
});
it('adds persisted touch percentages without changing legacy mouse settings', () => {
  const settings = normalizeUserSettings({
    sensitivity: 2,
    touchSensitivity: { camera: 0, ads: 900, sniper: NaN },
  });
  expect(settings.touchSensitivity).toEqual({
    camera: 1,
    ads: 300,
    sniper: 100,
  });
  expect(settings.sensitivity.camera.steering).toBe(200);
  expect(normalizeUserSettings({}).touchSensitivity).toEqual({
    camera: 100,
    ads: 100,
    sniper: 100,
  });
});

class Control extends EventTarget {
  dataset: Record<string, string>;
  style = { transform: '' };
  attributes: Record<string, string> = {};
  captures = new Set<number>();
  constructor(control: string) {
    super();
    this.dataset = { touchControl: control };
  }
  closest() {
    return this;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 120, height: 120 };
  }
  querySelector() {
    return this;
  }
  setAttribute(key: string, value: string) {
    this.attributes[key] = value;
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
  }
}
class Root extends EventTarget {
  controls = Object.fromEntries(
    [
      'joystick',
      'look',
      'fire',
      'aim',
      'sprint',
      'jump',
      'slide',
      'prone',
      'dive',
      'reload',
      'swap',
      'scores',
      'pause',
    ].map((id) => [id, new Control(id)]),
  );
  querySelectorAll() {
    return Object.values(this.controls);
  }
  contains(element: Control) {
    return Object.values(this.controls).includes(element);
  }
  pointer(type: string, control: string, id: number, x = 60, y = 60) {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerId: id,
      pointerType: 'touch',
      clientX: x,
      clientY: y,
    });
    Object.defineProperty(event, 'target', { value: this.controls[control] });
    this.dispatchEvent(event);
    return event;
  }
}

describe('touch intentions', () => {
  let input: InputManager,
    root: Root,
    doc: EventTarget,
    browser: EventTarget,
    weapon: WeaponController | null,
    changed: ReturnType<typeof vi.fn<(locked: boolean) => void>>;
  const aimScale = vi.fn(() => 1);
  beforeEach(() => {
    doc = new EventTarget();
    browser = Object.assign(new EventTarget(), {
      innerWidth: 844,
      innerHeight: 390,
      screen: { width: 390, height: 844 },
    });
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', browser);
    vi.stubGlobal('navigator', {
      maxTouchPoints: 5,
      platform: '',
      userAgent: '',
    });
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('coarse'),
    }));
    changed = vi.fn();
    weapon = null;
    aimScale.mockReset().mockReturnValue(1);
    input = new InputManager(
      new EventTarget() as HTMLCanvasElement,
      changed,
      vi.fn(),
      vi.fn(),
      () => weapon,
      () => ['sniper', 'rifle'],
      aimScale,
    );
    root = new Root();
    input.attachTouchControls(root as unknown as HTMLElement);
    input.requestLock();
  });
  it('applies assistance only to active touch look when enabled', () => {
    aimScale.mockReturnValue(0.6);
    root.pointer('pointerdown', 'look', 1);
    expect(aimScale).not.toHaveBeenCalled();
    root.pointer('pointermove', 'look', 1, 72, 60);
    const assisted = input.movement.yaw;
    expect(aimScale).toHaveBeenCalledExactlyOnceWith(0);
    root.pointer('pointerup', 'look', 1);
    input.setLook(0, 0);
    input.configure({ ...defaultUserSettings(), touchAimAssist: false });
    root.pointer('pointerdown', 'look', 2);
    root.pointer('pointermove', 'look', 2, 72, 60);
    expect(assisted).toBeCloseTo(input.movement.yaw * 0.6, 9);
    input.configure(defaultUserSettings());
    input.mouseLook(12, 0);
    input.release();
    root.pointer('pointermove', 'look', 2, 80, 60);
    expect(aimScale).toHaveBeenCalledTimes(1);
  });
  afterEach(() => {
    input.dispose();
    vi.unstubAllGlobals();
  });

  it('supports joystick + camera + ADS + fire with independent pointers', () => {
    root.pointer('pointerdown', 'joystick', 1, 60, 20);
    root.pointer('pointerdown', 'look', 2, 500, 100);
    root.pointer('pointerdown', 'aim', 3);
    root.pointer('pointerdown', 'fire', 4);
    root.pointer('pointermove', 'look', 2, 540, 110);
    expect(input.movement.forward).toBeCloseTo(1);
    expect(input.movement.yaw).toBeLessThan(0);
    expect(input.pitch).toBeLessThan(0);
    expect(input.weapon).toMatchObject({
      fire: true,
      aim: true,
      firePressed: true,
      aimPressed: true,
    });
    root.pointer('pointerup', 'aim', 3);
    root.pointer('pointerup', 'fire', 4);
    expect(input.weapon).toMatchObject({ fire: false, aim: true });
    expect(input.movement.forward).toBeCloseTo(1);
    root.pointer('pointerup', 'joystick', 1);
    expect(input.movement.forward).toBe(0);
    expect(input.weapon.aim).toBe(true);
  });
  it('keeps the trigger held until every fire pointer is released', () => {
    root.pointer('pointerdown', 'fire', 1);
    root.pointer('pointerdown', 'fire', 2);
    input.consumeActions();
    root.pointer('pointercancel', 'fire', 1);
    expect(input.weapon).toMatchObject({ fire: true, firePressed: false });
    root.pointer('pointerup', 'fire', 2);
    expect(input.weapon.fire).toBe(false);
  });
  it('supports sprint, slide+jump, dive, reload and restricted weapon cycling', () => {
    root.pointer('pointerdown', 'sprint', 1);
    root.pointer('pointerup', 'sprint', 1);
    root.pointer('pointerdown', 'joystick', 2, 60, 20);
    root.pointer('pointerdown', 'slide', 3);
    root.pointer('pointerdown', 'jump', 4);
    expect(input.movement).toMatchObject({
      sprint: true,
      forward: 1,
      slidePressed: true,
      jump: true,
      jumpPressed: true,
    });
    root.pointer('pointerdown', 'dive', 5);
    root.pointer('pointerdown', 'reload', 6);
    root.pointer('pointerdown', 'swap', 7);
    expect(input.weapon.switchTo).toBe('sniper');
    root.pointer('pointerup', 'swap', 7);
    root.pointer('pointerdown', 'swap', 7);
    expect(input.weapon).toMatchObject({
      switchTo: 'rifle',
      reloadPressed: true,
    });
    expect(input.movement.divePressed).toBe(true);
    input.consumeActions();
    expect(input.movement.jumpPressed).toBe(false);
    expect(input.movement.jump).toBe(true);
  });
  it('uses a dead zone and never lets another finger steal the joystick or camera', () => {
    root.pointer('pointerdown', 'joystick', 1, 61, 60);
    expect(input.movement.right).toBe(0);
    root.pointer('pointerdown', 'joystick', 2, 100, 60);
    root.pointer('pointermove', 'joystick', 2, 200, 60);
    expect(input.movement.right).toBe(0);
    root.pointer('pointermove', 'joystick', 1, 100, 60);
    expect(input.movement.right).toBe(1);
    root.pointer('pointerdown', 'look', 3, 400, 100);
    root.pointer('pointerdown', 'look', 4, 700, 300);
    root.pointer('pointermove', 'look', 4, 900, 500);
    expect(input.movement.yaw).toBe(0);
    root.pointer('pointerup', 'look', 3);
    root.pointer('pointerdown', 'look', 5, 800, 350);
    expect(input.pitch).toBe(0);
    expect(input.movement.yaw).toBe(0);
  });
  it.each(['pointercancel', 'lostpointercapture'])(
    'clears only the owner on %s and resets everything on pause',
    (type) => {
      root.pointer('pointerdown', 'joystick', 1, 60, 20);
      root.pointer('pointerdown', 'fire', 2);
      root.pointer('pointerdown', 'aim', 3);
      root.pointer(type, 'fire', 2);
      expect(input.weapon.fire).toBe(false);
      expect(input.movement.forward).toBe(1);
      expect(input.weapon.aim).toBe(true);
      root.pointer('pointerdown', 'pause', 4);
      expect(input.locked).toBe(false);
      expect(input.weapon.aim).toBe(false);
      expect(input.movement.forward).toBe(0);
      expect(root.controls.joystick!.captures.size).toBe(0);
      expect(changed).toHaveBeenLastCalledWith(false);
    },
  );
  it('neutralizes controls on blur and portrait rotation and refuses portrait entry', () => {
    root.pointer('pointerdown', 'fire', 1);
    browser.dispatchEvent(new Event('blur'));
    expect(input.weapon.fire).toBe(false);
    expect(input.locked).toBe(false);
    input.requestLock();
    root.pointer('pointerdown', 'joystick', 2, 60, 20);
    Object.assign(browser, { innerWidth: 390, innerHeight: 844 });
    browser.dispatchEvent(new Event('resize'));
    expect(input.locked).toBe(false);
    expect(input.movement.forward).toBe(0);
    input.requestLock(true);
    expect(input.locked).toBe(false);
  });
  it('preserves keyboard movement alongside touch and ignores emulated mouse input', () => {
    root.pointer('pointerdown', 'joystick', 1, 60, 20);
    doc.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyD' }));
    expect(input.movement).toMatchObject({ forward: 1, right: 1 });
    doc.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    expect(input.weapon.fire).toBe(false);
    root.pointer('pointerup', 'joystick', 1);
    expect(input.movement.right).toBe(1);
    input.useTouchControls(false);
    expect(input.locked).toBe(false);
    expect(input.movement.right).toBe(0);
  });
  it('applies touch ADS percentages and inversion independently of mouse sensitivity', () => {
    const s = defaultUserSettings();
    s.touchSensitivity.ads = 50;
    s.invertY = true;
    input.configure(s);
    root.pointer('pointerdown', 'aim', 1);
    root.pointer('pointerdown', 'look', 2, 300, 100);
    root.pointer('pointermove', 'look', 2, 310, 110);
    const expected = ((10 * Math.PI) / (390 * 1.2)) * 0.5;
    expect(input.movement.yaw).toBeCloseTo(-expected);
    expect(input.pitch).toBeCloseTo(expected);
    expect(s.sensitivity.camera.ads).toBe(100);
  });
  function motion(time: number, beta: number, gamma: number) {
    const event = Object.assign(new Event('devicemotion'), {
      rotationRate: { alpha: 90, beta, gamma },
    });
    Object.defineProperty(event, 'timeStamp', { value: time });
    browser.dispatchEvent(event);
  }

  it('maps landscape gyro look through camera, ADS, sniper scope and vertical settings', () => {
    Object.assign(browser, {
      isSecureContext: true,
      DeviceMotionEvent: Event,
      screen: { orientation: { angle: 90 } },
    });
    const settings = defaultUserSettings();
    settings.gyroEnabled = true;
    settings.gyroSensitivity = {
      camera: 100,
      ads: 200,
      sniper: 50,
      vertical: 150,
    };
    input.configure(settings);
    input.lookScale = 0.8;
    weapon = new WeaponController(() => {});

    const radians = Math.PI / 180;
    motion(1000, 80, 40);
    motion(1020, 80, 40);
    expect(input.movement.yaw).toBeCloseTo(80 * 0.02 * radians * 0.8);
    expect(input.pitch).toBeCloseTo(-40 * 0.02 * radians * 0.8 * 1.5);

    weapon.ads = 0.5;
    input.setLook(0, 0);
    motion(1030, 80, 0);
    motion(1050, 80, 0);
    expect(input.movement.yaw).toBeCloseTo(80 * 0.02 * radians * 0.8 * 1.5);

    weapon.selected = 'sniper';
    weapon.ads = 1;
    input.configure({ ...settings, invertY: true });
    input.setLook(0, 0);
    motion(1060, 80, 40);
    motion(1080, 80, 40);
    expect(input.movement.yaw).toBeCloseTo(80 * 0.02 * radians * 0.8 * 0.5);
    expect(input.pitch).toBeCloseTo(40 * 0.02 * radians * 0.8 * 1.5);
    expect(aimScale).not.toHaveBeenCalled();
  });

  it('resets gyro timing on rotation, ignores stale events and stops when disabled or paused', () => {
    const orientation = { angle: 90 };
    Object.assign(browser, {
      isSecureContext: true,
      DeviceMotionEvent: Event,
      screen: { orientation },
    });
    motion(1000, 80, 40);
    motion(1020, 80, 40);
    expect(input.movement.yaw).toBe(0);

    const settings = { ...defaultUserSettings(), gyroEnabled: true };
    input.configure(settings);
    motion(1100, 90, 0);
    motion(1120, 90, 0);
    const amount = (90 * 0.02 * Math.PI) / 180;
    expect(input.movement.yaw).toBeCloseTo(amount);

    orientation.angle = 270;
    motion(1140, 90, 0);
    expect(input.movement.yaw).toBeCloseTo(amount);
    motion(1160, 90, 0);
    expect(input.movement.yaw).toBeCloseTo(0);
    motion(2000, 90, 0);
    motion(2020, 0.1, 0.2);
    expect(input.movement.yaw).toBeCloseTo(0);
    expect(input.pitch).toBe(0);

    input.release();
    motion(2040, 90, 0);
    motion(2060, 90, 0);
    expect(input.movement.yaw).toBeCloseTo(0);
    input.requestLock();
    motion(2100, 90, 0);
    motion(2120, 90, 0);
    expect(input.movement.yaw).toBeCloseTo(-amount);
    input.configure({ ...settings, gyroEnabled: false });
    motion(2140, 90, 0);
    motion(2160, 90, 0);
    expect(input.movement.yaw).toBeCloseTo(-amount);
  });

  it('requests Safari motion permission on supported secure pages and handles rejection', async () => {
    const permission = vi
      .fn<() => Promise<PermissionState>>()
      .mockResolvedValue('granted');
    Object.assign(browser, {
      DeviceMotionEvent: Object.assign(class extends Event {}, {
        requestPermission: permission,
      }),
    });
    await expect(requestGyroAccess()).resolves.toBe('unavailable');
    expect(permission).not.toHaveBeenCalled();
    Object.assign(browser, { isSecureContext: true });
    await expect(requestGyroAccess()).resolves.toBe('granted');
    permission.mockResolvedValueOnce('denied');
    await expect(requestGyroAccess()).resolves.toBe('denied');
    permission.mockRejectedValueOnce(new Error('gesture required'));
    await expect(requestGyroAccess()).resolves.toBe('denied');
  });

  it('handles unsupported and rejected orientation/fullscreen APIs', async () => {
    await expect(requestLandscape()).resolves.toBeUndefined();
    const lock = vi.fn(() => Promise.reject(new Error('unsupported')));
    Object.assign(browser, { screen: { orientation: { lock } } });
    Object.assign(doc, {
      documentElement: {
        requestFullscreen: vi.fn(() => Promise.reject(new Error('denied'))),
      },
    });
    await expect(requestLandscape(true)).resolves.toBeUndefined();
    expect(lock).toHaveBeenCalledWith('landscape');
  });
  it('swallows a touch control click after Pause removes its target without blocking a fresh menu tap', () => {
    root.pointer('pointerdown', 'pause', 7);
    doc.dispatchEvent(
      Object.assign(new Event('pointerup'), {
        pointerId: 7,
        clientX: 100,
        clientY: 40,
      }),
    );
    const click = Object.assign(new Event('click', { cancelable: true }), {
      pointerId: 7,
    });
    doc.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    doc.dispatchEvent(
      Object.assign(new Event('pointerdown'), { pointerId: 7 }),
    );
    const next = Object.assign(new Event('click', { cancelable: true }), {
      pointerId: 7,
    });
    doc.dispatchEvent(next);
    expect(next.defaultPrevented).toBe(false);
  });
});
