import { expect, it, vi } from 'vitest';
import { InputController } from './InputController';
import { defaultUserSettings, rebind } from '../settings/userSettings';
import { movementConfig } from '@breakpoint/shared';

it('quietly handles automatic capture denial and still reports an explicit retry failure', async () => {
  const domDocument = new EventTarget();
  vi.stubGlobal('document', domDocument);
  vi.stubGlobal('window', new EventTarget());
  const canvas = Object.assign(new EventTarget(), {
    requestPointerLock: vi.fn(() =>
      Promise.reject(new Error('gesture required')),
    ),
  });
  const error = vi.fn(),
    input = new InputController(
      canvas as unknown as HTMLCanvasElement,
      () => {},
      error,
    );
  try {
    input.requestLock(true);
    await Promise.resolve();
    domDocument.dispatchEvent(new Event('pointerlockerror'));
    expect(error).not.toHaveBeenCalled();
    input.requestLock();
    await Promise.resolve();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Mouse capture was denied'),
    );
  } finally {
    input.dispose();
    vi.unstubAllGlobals();
  }
});

it('captures fresh ADS taps once, preserves held aim, and clears presses with gameplay input', () => {
  const domDocument = new EventTarget();
  vi.stubGlobal('document', domDocument);
  vi.stubGlobal('window', new EventTarget());
  const input = new InputController(
    new EventTarget() as HTMLCanvasElement,
    () => {},
    () => {},
    () => {},
  );
  const mouse = (type: string) =>
    domDocument.dispatchEvent(Object.assign(new Event(type), { button: 2 }));
  try {
    mouse('mousedown');
    expect(input.weapon.aimPressed).toBe(false);
    input.locked = true;
    mouse('mousedown');
    mouse('mouseup');
    expect(input.weapon).toMatchObject({ aim: false, aimPressed: true });
    input.consumeActions();
    expect(input.weapon.aimPressed).toBe(false);
    mouse('mousedown');
    input.consumeActions();
    expect(input.weapon).toMatchObject({ aim: true, aimPressed: false });
    mouse('mousedown');
    expect(input.weapon.aimPressed).toBe(false);
    mouse('mouseup');
    mouse('mousedown');
    expect(input.weapon.aimPressed).toBe(true);
    input.clearGameplay();
    expect(input.weapon).toMatchObject({ aim: false, aimPressed: false });
  } finally {
    input.dispose();
    vi.unstubAllGlobals();
  }
});

it('keeps the held scoreboard open when dead gameplay input is neutralized, and closes it on focus/capture reset', () => {
  const domDocument = new EventTarget();
  vi.stubGlobal('document', domDocument);
  vi.stubGlobal('window', new EventTarget());
  const scoreboard = vi.fn();
  const input = new InputController(
    new EventTarget() as HTMLCanvasElement,
    () => {},
    () => {},
    scoreboard,
  );
  try {
    input.locked = true;
    const key = (code: string) =>
      domDocument.dispatchEvent(
        Object.assign(new Event('keydown', { cancelable: true }), { code }),
      );
    key('KeyW');
    key('Tab');
    expect(input.movement.forward).toBe(1);
    expect(scoreboard).toHaveBeenLastCalledWith(true);
    input.clearGameplay();
    expect(input.movement.forward).toBe(0);
    expect(scoreboard).toHaveBeenCalledTimes(1);
    input.clear();
    expect(scoreboard).toHaveBeenLastCalledWith(false);
  } finally {
    input.dispose();
    vi.unstubAllGlobals();
  }
});

it('applies remapped movement, held scores, sensitivity and inverted look, clearing held input on reconfigure', () => {
  const domDocument = new EventTarget();
  vi.stubGlobal('document', domDocument);
  vi.stubGlobal('window', new EventTarget());
  const scoreboard = vi.fn();
  const input = new InputController(
    new EventTarget() as HTMLCanvasElement,
    () => {},
    () => {},
    scoreboard,
  );
  const event = (type: string, values: object) =>
    domDocument.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), values),
    );
  try {
    const settings = rebind(
      rebind(
        {
          ...defaultUserSettings(),
          sensitivity: {
            camera: { steering: 200, ads: 200, sniper: 200, vertical: 200 },
            firing: { steering: 200, ads: 200, sniper: 200, vertical: 200 },
          },
          invertY: true,
        },
        'forward',
        'KeyE',
      ),
      'scoreboard',
      'KeyQ',
    );
    input.configure(settings);
    input.locked = true;
    input.lookScale = 0.5;
    event('keydown', { code: 'KeyW' });
    expect(input.movement.forward).toBe(0);
    event('keydown', { code: 'KeyE' });
    expect(input.movement.forward).toBe(1);
    event('keydown', { code: 'KeyQ' });
    expect(scoreboard).toHaveBeenLastCalledWith(true);
    event('keyup', { code: 'KeyQ' });
    expect(scoreboard).toHaveBeenLastCalledWith(false);
    event('mousemove', { movementX: 12, movementY: 8 });
    expect(input.movement.yaw).toBeCloseTo(-12 * movementConfig.sensitivity);
    expect(input.pitch).toBeCloseTo(8 * movementConfig.sensitivity);
    input.configure(defaultUserSettings());
    expect(input.movement.forward).toBe(0);
    event('keydown', { code: 'KeyW', altKey: true });
    expect(input.movement.forward).toBe(0);
  } finally {
    input.dispose();
    vi.unstubAllGlobals();
  }
});
