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
    this.dataset = control === 'sprint' ? {} : { touchControl: control };
  }
  closest() {
    return this.dataset.touchControl ? this : null;
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
      'adsFire',
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
    return Object.values(this.controls).filter(
      (control) => control.dataset.touchControl,
    );
  }
  querySelector(selector: string) {
    return selector === '[data-sprint-indicator]' ? this.controls.sprint : null;
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
    root.pointer('pointermove', 'look', 1, 65, 60);
    root.pointer('pointermove', 'look', 1, 72, 60);
    expect(aimScale).not.toHaveBeenCalled();
    input.updateLook(16);
    const assisted = input.movement.yaw;
    expect(aimScale).toHaveBeenCalledExactlyOnceWith(0);
    root.pointer('pointerup', 'look', 1);
    input.setLook(0, 0);
    input.configure({ ...defaultUserSettings(), touchAimAssist: false });
    root.pointer('pointerdown', 'look', 2);
    root.pointer('pointermove', 'look', 2, 72, 60);
    input.updateLook(32);
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

  it('only applies the aim pull while aiming or firing and yields to a manual swipe', () => {
    const correction = vi.fn(() => ({ yaw: 0.008, pitch: -0.002 }));
    const tick = 1 / 60;
    input.updateTouchAimAssist(tick, correction);
    expect(correction).not.toHaveBeenCalled();
    root.pointer('pointerdown', 'aim', 1);
    root.pointer('pointerup', 'aim', 1);
    input.touchLook(5, 0);
    const manualYaw = input.movement.yaw;
    for (let i = 0; i < 5; i++) input.updateTouchAimAssist(tick, correction);
    expect(input.movement.yaw).toBe(manualYaw);
    for (let i = 0; i < 3; i++) input.updateTouchAimAssist(tick, correction);
    expect(input.movement.yaw).toBeCloseTo(manualYaw + 0.008);
    expect(input.pitch).toBeCloseTo(-0.002);
    root.pointer('pointerdown', 'aim', 1);
    root.pointer('pointerup', 'aim', 1);
    root.pointer('pointerdown', 'fire', 2);
    input.updateTouchAimAssist(tick, correction);
    expect(input.movement.yaw).toBeCloseTo(manualYaw + 0.016);
    input.configure({ ...defaultUserSettings(), touchAimAssist: false });
    input.updateTouchAimAssist(tick, correction);
    expect(correction).toHaveBeenCalledTimes(2);
  });

  it('supports joystick + camera + ADS + fire with independent pointers', () => {
    root.pointer('pointerdown', 'joystick', 1, 60, 20);
    root.pointer('pointerdown', 'look', 2, 500, 100);
    root.pointer('pointerdown', 'aim', 3);
    root.pointer('pointerdown', 'fire', 4);
    root.pointer('pointermove', 'look', 2, 540, 110);
    input.updateLook(16);
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
  it('steers from Hip Fire while keeping ADS and the ADS Fire drag setting independent', () => {
    input.configure({ ...defaultUserSettings(), adsFireDragToAim: false });
    root.pointer('pointerdown', 'fire', 1, 690, 200);
    root.pointer('pointermove', 'fire', 1, 640, 215);
    input.updateLook(16);
    expect(input.movement.yaw).toBeGreaterThan(0);
    expect(input.pitch).toBeLessThan(0);
    expect(input.weapon).toMatchObject({ fire: true, aim: false });
    root.pointer('pointerup', 'fire', 1);
    expect(input.weapon.fire).toBe(false);
  });
  it('toggles ADS by default and releases hold-mode ADS with the last pointer', () => {
    root.pointer('pointerdown', 'aim', 1);
    root.pointer('pointerup', 'aim', 1);
    expect(input.weapon.aim).toBe(true);
    root.pointer('pointerdown', 'aim', 1);
    root.pointer('pointerup', 'aim', 1);
    expect(input.weapon.aim).toBe(false);
    input.configure({ ...defaultUserSettings(), touchAdsMode: 'hold' });
    root.pointer('pointerdown', 'aim', 1);
    expect(input.weapon.aim).toBe(true);
    root.pointer('pointerdown', 'aim', 2);
    root.pointer('pointerup', 'aim', 1);
    expect(input.weapon.aim).toBe(true);
    root.pointer('lostpointercapture', 'aim', 2);
    expect(input.weapon.aim).toBe(false);
  });
  it('holds aim for a quick ADS Fire tap and sends one aimed shot', () => {
    weapon = new WeaponController(() => {});
    root.pointer('pointerdown', 'adsFire', 1);
    root.pointer('pointerup', 'adsFire', 1);
    input.prepareAdsFire();
    expect(input.weapon).toMatchObject({
      aim: true,
      fire: false,
      firePressed: false,
    });
    input.consumeActions();
    weapon.updateAds(0.1, true);
    weapon.updateAds(0.1, true);
    weapon.updateAds(0.1, true);
    input.prepareAdsFire();
    expect(input.weapon).toMatchObject({
      aim: true,
      fire: false,
      firePressed: true,
    });
    input.consumeActions();
    input.prepareAdsFire();
    expect(input.weapon).toMatchObject({
      aim: false,
      fire: false,
      firePressed: false,
    });
  });
  it('steers from the ADS Fire finger and keeps look and ADS toggle independent', () => {
    root.pointer('pointerdown', 'aim', 1);
    root.pointer('pointerup', 'aim', 1);
    root.pointer('pointerdown', 'adsFire', 2, 650, 190);
    input.prepareAdsFire();
    expect(input.weapon).toMatchObject({
      aim: true,
      fire: true,
      firePressed: true,
    });
    root.pointer('pointerdown', 'look', 3, 480, 100);
    root.pointer('pointermove', 'adsFire', 2, 660, 190);
    input.updateLook(16);
    const yaw = input.movement.yaw;
    expect(yaw).toBeLessThan(0);
    root.pointer('pointermove', 'look', 3, 490, 100);
    input.updateLook(32);
    expect(input.movement.yaw).toBeCloseTo(yaw * 2);
    input.configure({ ...defaultUserSettings(), adsFireDragToAim: false });
    root.pointer('pointermove', 'adsFire', 2, 700, 190);
    input.updateLook(48);
    expect(input.movement.yaw).toBeCloseTo(yaw * 2);
    expect(input.weapon).toMatchObject({ aim: true, fire: true });
    root.pointer('pointermove', 'look', 3, 500, 100);
    input.updateLook(64);
    expect(input.movement.yaw).toBeCloseTo(yaw * 3);
    root.pointer('pointerdown', 'fire', 4);
    input.consumeActions();
    root.pointer('pointerup', 'adsFire', 2);
    expect(input.weapon).toMatchObject({ aim: true, fire: true });
    root.pointer('pointerup', 'fire', 4);
    expect(input.weapon).toMatchObject({ aim: true, fire: false });
  });
  it('discards a queued ADS shot when the touch is cancelled or the game pauses', () => {
    weapon = new WeaponController(() => {});
    root.pointer('pointerdown', 'adsFire', 1);
    root.pointer('pointercancel', 'adsFire', 1);
    input.prepareAdsFire();
    expect(input.weapon).toMatchObject({
      aim: false,
      fire: false,
      firePressed: false,
    });
    root.pointer('pointerdown', 'adsFire', 2);
    root.pointer('pointerup', 'adsFire', 2);
    input.prepareAdsFire(false);
    expect(input.weapon).toMatchObject({
      aim: false,
      fire: false,
      firePressed: false,
    });
    root.pointer('pointerdown', 'adsFire', 3);
    root.pointer('pointerup', 'adsFire', 3);
    root.pointer('pointerdown', 'pause', 4);
    input.prepareAdsFire();
    expect(input.weapon).toMatchObject({
      aim: false,
      fire: false,
      firePressed: false,
    });
  });
  it('supports sprint, slide+jump, dive, reload and restricted weapon cycling', () => {
    root.pointer('pointerdown', 'joystick', 2);
    root.pointer('pointermove', 'joystick', 2, 60, 20);
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
  it('walks at normal speed, sprints only forward, and uses separate enter and release distances', () => {
    root.controls.joystick!.dataset.sprintDistance = '40';
    root.pointer('pointerdown', 'sprint', 2);
    expect(input.movement.sprint).toBe(false);
    root.pointer('pointerdown', 'joystick', 1);
    root.pointer('pointermove', 'joystick', 1, 60, 53);
    expect(input.movement).toMatchObject({ forward: 1, sprint: false });
    root.pointer('pointermove', 'joystick', 1, 60, 24);
    expect(input.movement).toMatchObject({ forward: 1, sprint: false });
    root.pointer('pointermove', 'joystick', 1, 60, 20);
    expect(input.movement.sprint).toBe(true);
    expect(root.controls.sprint!.dataset.active).toBe('true');
    root.pointer('pointermove', 'joystick', 1, 60, 24);
    expect(input.movement.sprint).toBe(true);
    root.pointer('pointermove', 'joystick', 1, 60, 30);
    expect(input.movement).toMatchObject({ forward: 1, sprint: false });
    root.pointer('pointermove', 'joystick', 1, 160, 10);
    expect(input.movement.sprint).toBe(false);
    root.pointer('pointermove', 'joystick', 1, 160, 60);
    expect(input.movement).toMatchObject({
      forward: 0,
      right: 1,
      sprint: false,
    });
    root.pointer('pointermove', 'joystick', 1, 60, 160);
    expect(input.movement).toMatchObject({ forward: -1, sprint: false });
    root.pointer('pointermove', 'joystick', 1, 60, 10);
    expect(input.movement.sprint).toBe(true);
    root.pointer('pointerup', 'joystick', 1);
    expect(input.movement).toMatchObject({
      forward: 0,
      right: 0,
      sprint: false,
    });
    expect(root.controls.sprint!.dataset.active).toBe('false');
  });
  it('preserves a backward slide request without latching sprint during backward movement', () => {
    root.pointer('pointerdown', 'joystick', 1);
    root.pointer('pointermove', 'joystick', 1, 60, 20);
    root.pointer('pointermove', 'joystick', 1, 60, 100);
    expect(input.movement).toMatchObject({ forward: -1, sprint: false });
    root.pointer('pointerdown', 'slide', 2);
    expect(input.movement).toMatchObject({
      forward: -1,
      sprint: true,
      slidePressed: true,
    });
    expect(root.controls.sprint!.dataset.active).toBe('false');
    input.consumeActions();
    expect(input.movement).toMatchObject({
      forward: -1,
      sprint: false,
      slidePressed: false,
    });
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
    input.updateLook(16);
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
    input.updateLook(16);
    const expected = ((10 * Math.PI) / (390 * 1.2)) * 0.5;
    expect(input.movement.yaw).toBeCloseTo(-expected);
    expect(input.pitch).toBeCloseTo(expected);
    expect(s.sensitivity.camera.ads).toBe(100);
  });
  function motion(
    time: number,
    beta: number,
    gamma: number,
    sensor: DeviceMotionEventInit = {},
    render = true,
  ) {
    const event = Object.assign(new Event('devicemotion'), {
      rotationRate: { alpha: 90, beta, gamma },
      ...sensor,
    });
    Object.defineProperty(event, 'timeStamp', { value: time });
    browser.dispatchEvent(event);
    if (render) input.updateGyroLook(time);
  }

  it('applies swipe and gyro on the same frame with no swipe carried into the next frame', () => {
    Object.assign(browser, {
      isSecureContext: true,
      DeviceMotionEvent: Event,
      screen: { orientation: { angle: 90 } },
    });
    input.configure({ ...defaultUserSettings(), gyroActivation: 'always' });
    root.pointer('pointerdown', 'look', 1, 400, 100);
    root.pointer('pointermove', 'look', 1, 420, 100);
    root.pointer('pointerup', 'look', 1);
    motion(1000, 60, 0, {}, false);
    motion(1020, 60, 0, {}, false);
    input.updateLook(1020);
    const swipe = (-20 * Math.PI) / (390 * 1.2);
    expect(input.movement.yaw).toBeCloseTo(swipe + (1.2 * Math.PI) / 180, 9);
    input.updateLook(1028);
    expect(input.movement.yaw).toBeCloseTo(swipe + (1.68 * Math.PI) / 180, 9);
    expect(aimScale).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1000, 1020, 1031, 1061, 1079, 1101],
    [1000, 1050, 1100, 1150],
  ])(
    'advances evenly each display frame between sensor readings %j',
    (...samples) => {
      Object.assign(browser, {
        isSecureContext: true,
        DeviceMotionEvent: Event,
        screen: { orientation: { angle: 90 } },
      });
      input.configure({ ...defaultUserSettings(), gyroActivation: 'always' });
      const last = samples.at(-1)!;
      const firstFrame = samples[1]!;
      let nextSample = 0;
      for (let frame = firstFrame; frame < last; frame += 8) {
        while (nextSample < samples.length && samples[nextSample]! <= frame)
          motion(samples[nextSample++]!, 60, 30, {}, false);
        input.updateGyroLook(frame);
        const scale = ((frame - 1000) * Math.PI) / 180000;
        expect(input.movement.yaw).toBeCloseTo(60 * scale, 9);
        expect(input.pitch).toBeCloseTo(-30 * scale, 9);
      }
      while (nextSample < samples.length)
        motion(samples[nextSample++]!, 60, 30, {}, false);
      const finalYaw = (60 * (last - 1000) * Math.PI) / 180000;
      input.updateGyroLook(last + 8);
      expect(input.movement.yaw).toBeGreaterThan(finalYaw);
      input.updateGyroLook(last + 150);
      expect(input.movement.yaw).toBeCloseTo(finalYaw, 9);
      const settled = input.movement.yaw;
      input.updateGyroLook(last + 1000);
      expect(input.movement.yaw).toBe(settled);
    },
  );

  it('clears pending and predicted gyro input when pausing and releasing ADS', () => {
    Object.assign(browser, {
      isSecureContext: true,
      DeviceMotionEvent: Event,
      screen: { orientation: { angle: 90 } },
    });
    input.configure({ ...defaultUserSettings(), gyroActivation: 'ads' });
    input.setTouchWeapons(false, true);
    motion(1000, 60, 0, {}, false);
    motion(1020, 60, 0, {}, false);
    input.updateGyroLook(1028);
    const before = input.movement.yaw;
    motion(1040, 60, 0, {}, false);
    input.setTouchWeapons(false, false);
    input.updateGyroLook(1048);
    expect(input.movement.yaw).toBe(before);
    input.setTouchWeapons(false, true);
    motion(1060, 60, 0, {}, false);
    input.release();
    input.updateGyroLook(1068);
    expect(input.movement.yaw).toBe(before);
  });

  it('blends gyro sensitivity and FOV scaling across aim modes', () => {
    Object.assign(browser, {
      isSecureContext: true,
      DeviceMotionEvent: Event,
      screen: { orientation: { angle: 90 } },
    });
    const settings = defaultUserSettings();
    settings.gyroActivation = 'always';
    settings.gyroSensitivity = {
      steering: 100,
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
    motion(1030, 80, 40);
    motion(1050, 80, 40);
    const blendedScale = (0.8 + 3.85) / 2;
    expect(input.movement.yaw).toBeCloseTo(80 * 0.02 * radians * blendedScale);
    expect(input.pitch).toBeCloseTo(-40 * 0.02 * radians * blendedScale * 1.5);

    weapon.selected = 'sniper';
    weapon.ads = 1;
    input.setLook(0, 0);
    motion(1060, 80, 40);
    motion(1080, 80, 40);
    expect(input.movement.yaw).toBeCloseTo(80 * 0.02 * radians * 0.8 * 0.5);
    expect(input.pitch).toBeCloseTo(-40 * 0.02 * radians * 0.8 * 0.5 * 1.5);
    expect(aimScale).not.toHaveBeenCalled();
  });

  it.each([
    { mode: 'steering', weaponId: 'rifle', ads: 0, fovScale: 1, scale: 12 },
    { mode: 'ads', weaponId: 'rifle', ads: 1, fovScale: 0.75, scale: 11.25 },
    { mode: 'sniper', weaponId: 'sniper', ads: 1, fovScale: 0.25, scale: 9.75 },
  ] as const)(
    'uses the faster maximum gyro gain in $mode mode',
    ({ mode, weaponId, ads, fovScale, scale }) => {
      Object.assign(browser, {
        isSecureContext: true,
        DeviceMotionEvent: Event,
        screen: { orientation: { angle: 90 } },
      });
      const settings = defaultUserSettings();
      settings.gyroActivation = 'always';
      settings.gyroSensitivity[mode] = 300;
      input.configure(settings);
      input.lookScale = fovScale;
      weapon = new WeaponController(() => {});
      weapon.selected = weaponId;
      weapon.ads = ads;

      motion(1000, 60, 30);
      motion(1020, 60, 30);
      const radians = (scale * 0.02 * Math.PI) / 180;
      expect(input.movement.yaw).toBeCloseTo(60 * radians, 8);
      expect(input.pitch).toBeCloseTo(-30 * radians, 8);
    },
  );

  it.each([
    { gyroInvertHorizontal: false, gyroInvertVertical: false },
    { gyroInvertHorizontal: true, gyroInvertVertical: false },
    { gyroInvertHorizontal: false, gyroInvertVertical: true },
    { gyroInvertHorizontal: true, gyroInvertVertical: true },
  ])('inverts each gyro axis independently with %j', (inversion) => {
    Object.assign(browser, {
      isSecureContext: true,
      DeviceMotionEvent: Event,
      screen: { orientation: { angle: 90 } },
    });
    input.configure({
      ...defaultUserSettings(),
      ...inversion,
      gyroActivation: 'always',
      invertY: true,
    });
    motion(1000, 80, 40);
    motion(1020, 80, 40);
    const scale = (0.02 * Math.PI) / 180;
    expect(input.movement.yaw).toBeCloseTo(
      (inversion.gyroInvertHorizontal ? -80 : 80) * scale,
    );
    expect(input.pitch).toBeCloseTo(
      (inversion.gyroInvertVertical ? 40 : -40) * scale,
    );
    input.setLook(0, 0);
    input.touchLook(10, 10);
    expect(input.movement.yaw).toBeLessThan(0);
    expect(input.pitch).toBeGreaterThan(0);
  });

  it.each([90, 270])(
    'keeps physical yaw consistent when held upright or tilted back at %i degrees',
    (angle) => {
      Object.assign(browser, {
        isSecureContext: true,
        DeviceMotionEvent: Event,
        screen: { orientation: { angle } },
      });
      input.configure({ ...defaultUserSettings(), gyroActivation: 'always' });
      const side = angle === 90 ? 1 : -1;
      const yaw = (60 * 0.02 * Math.PI) / 180;
      for (const tilt of [0, Math.PI / 4, Math.PI / 2]) {
        const x = side * Math.cos(tilt);
        const z = Math.sin(tilt);
        const beta = 60 * x;
        const gamma = 25 * side;
        const sensor: DeviceMotionEventInit = {
          rotationRate: { alpha: 60 * z, beta, gamma },
          accelerationIncludingGravity: { x: x * 9.81 + 2, y: 3, z: z * 9.81 },
          acceleration: { x: 2, y: 3, z: 0 },
        };
        input.setLook(0, 0);
        motion(1000, beta, gamma, sensor);
        motion(1020, beta, gamma, sensor);
        expect(input.movement.yaw).toBeCloseTo(yaw, 8);
        expect(input.pitch).toBeCloseTo((-25 * 0.02 * Math.PI) / 180, 8);
      }
    },
  );

  it.each([90, 270])(
    'maps a pure pitch gesture vertically with a sideways grip at %i degrees',
    (angle) => {
      Object.assign(browser, {
        isSecureContext: true,
        DeviceMotionEvent: Event,
        screen: { orientation: { angle } },
      });
      input.configure({ ...defaultUserSettings(), gyroActivation: 'always' });
      const sign = angle === 90 ? 1 : -1;
      const sensor = {
        rotationRate: { alpha: 0, beta: 0, gamma: -60 * sign },
        accelerationIncludingGravity: { x: 7.8 * sign, y: 4.8, z: 3.5 },
      };
      motion(1000, 0, -60 * sign, sensor);
      motion(1020, 0, -60 * sign, sensor);
      expect(input.movement.yaw).toBeCloseTo(0, 10);
      expect(input.pitch).toBeCloseTo((60 * 0.02 * Math.PI) / 180, 10);
    },
  );

  it.each([90, 270])(
    'reads Chromium device X/Y rates before rotating the axes at %i degrees',
    (angle) => {
      Object.assign(navigator, {
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; RMX3663) Chrome/131.0.0.0 Mobile Safari/537.36',
      });
      Object.assign(browser, {
        isSecureContext: true,
        DeviceMotionEvent: Event,
        screen: { orientation: { angle } },
      });
      input.configure({ ...defaultUserSettings(), gyroActivation: 'always' });
      const side = angle === 90 ? 1 : -1;
      const gravity = { x: 8.55 * side, y: 4.8, z: 0 };
      const pitch = {
        rotationRate: { alpha: 0, beta: -60 * side, gamma: 0 },
        accelerationIncludingGravity: gravity,
      };
      motion(1000, 0, 0, pitch);
      motion(1020, 0, 0, pitch);
      const delta = (60 * 0.02 * Math.PI) / 180;
      expect(input.pitch).toBeCloseTo(delta, 10);
      expect(input.movement.yaw).toBeCloseTo(0, 10);

      const yaw = {
        rotationRate: { alpha: 60 * side, beta: 0, gamma: 0 },
        accelerationIncludingGravity: gravity,
      };
      motion(1040, 0, 0, yaw);
      expect(input.movement.yaw).toBeCloseTo(delta, 10);
      expect(input.pitch).toBeCloseTo(delta, 10);
    },
  );

  it.each([
    { sampleMs: 10, renderMs: 16 },
    { sampleMs: 20, renderMs: 33 },
    { sampleMs: 50, renderMs: 8 },
  ])(
    'records one full gyro turn with $sampleMs ms sensor and $renderMs ms render intervals',
    ({ sampleMs, renderMs }) => {
      Object.assign(browser, {
        isSecureContext: true,
        DeviceMotionEvent: Event,
        screen: { orientation: { angle: 90 } },
      });
      const settings = defaultUserSettings();
      settings.gyroActivation = 'always';
      input.configure(settings);
      input.setLook(Math.PI - 0.1, 0);
      input.startGyroMeasurement();
      let nextFrame = 0;
      for (let elapsed = 0; elapsed <= 1000; elapsed += sampleMs) {
        while (nextFrame < elapsed) {
          input.updateGyroLook(1000 + nextFrame);
          nextFrame += renderMs;
        }
        motion(1000 + elapsed, 360, 0, {}, false);
      }
      input.updateGyroLook(2000);
      expect(input.getGyroMeasurement()?.physicalYaw).toBeCloseTo(
        2 * Math.PI,
        9,
      );
      expect(input.getGyroMeasurement()?.cameraYaw).toBeCloseTo(2 * Math.PI, 9);
      expect(input.getGyroMeasurement()?.cameraYawTravel).toBeCloseTo(
        2 * Math.PI,
        9,
      );
      expect(input.movement.yaw).toBeCloseTo(Math.PI - 0.1, 9);
      motion(2000, 90, 0);
      motion(1980, 90, 0);
      expect(input.getGyroMeasurement()?.cameraYaw).toBeCloseTo(2 * Math.PI, 9);
    },
  );

  it('only applies ADS-only gyro while aiming and scales vertical independently', () => {
    Object.assign(browser, {
      isSecureContext: true,
      DeviceMotionEvent: Event,
      screen: { orientation: { angle: 90 } },
    });
    const settings = defaultUserSettings();
    settings.gyroActivation = 'ads';
    settings.gyroSensitivity.ads = 200;
    settings.gyroSensitivity.vertical = 150;
    input.configure(settings);
    input.lookScale = 0.5;
    weapon = new WeaponController(() => {});
    input.startGyroMeasurement();
    motion(1000, 50, -25);
    motion(1020, 50, -25);
    expect(input.movement.yaw).toBe(0);
    expect(input.pitch).toBe(0);

    input.setTouchWeapons(false, true);
    weapon.ads = 0.5;
    motion(1040, 50, -25);
    expect(input.movement.yaw).toBeCloseTo((1.875 * Math.PI) / 180, 9);
    expect(input.pitch).toBeCloseTo((1.40625 * Math.PI) / 180, 9);
    expect(input.getGyroMeasurement()?.aim).toMatchObject({
      mode: 'ads',
      yawGain: 1.875,
      pitchGain: 2.8125,
    });
    input.setTouchWeapons(false, false);
    motion(1060, 50, -25);
    expect(input.movement.yaw).toBeCloseTo((1.875 * Math.PI) / 180, 9);
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

    const settings = {
      ...defaultUserSettings(),
      gyroActivation: 'always',
      gyroDeadZone: 0.5,
    } as const;
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
    // Visibility changes reset timing even if no motion is delivered while hidden.
    Object.assign(doc, { hidden: true });
    doc.dispatchEvent(new Event('visibilitychange'));
    Object.assign(doc, { hidden: false });
    doc.dispatchEvent(new Event('visibilitychange'));
    motion(1180, 90, 0);
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
    input.configure({ ...settings, gyroActivation: 'off' });
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
