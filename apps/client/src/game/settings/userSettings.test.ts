import { afterEach, expect, it, vi } from 'vitest';
import {
  bindingActions,
  defaultUserSettings,
  loadUserSettings,
  normalizeUserSettings,
  rebind,
  saveUserSettings,
  userSettingsKey,
} from './userSettings';

afterEach(() => vi.unstubAllGlobals());

it('sanitizes malformed storage and clamps finite controls without sharing defaults', () => {
  const settings = normalizeUserSettings({
    sensitivity: 500,
    fov: NaN,
    invertY: 'yes',
    syncAdsFov: 'on',
    touchAimAssist: 'off',
    masterVolume: -1,
    crosshair: {
      color: 'red',
      length: 4.7,
      gap: Infinity,
      thickness: 20,
      dot: false,
    },
    bindings: { forward: 'Escape' },
  });
  expect(Object.values(settings.sensitivity.camera)).toEqual([
    300, 300, 300, 300,
  ]);
  expect(Object.values(settings.sensitivity.firing)).toEqual([
    300, 300, 300, 300,
  ]);
  expect(settings.fov).toBe(85);
  expect(settings.invertY).toBe(false);
  expect(settings.syncAdsFov).toBe(false);
  expect(settings.touchAimAssist).toBe(true);
  expect(settings.rifleSkin).toBe('standard');
  expect(settings.masterVolume).toBe(0);
  expect(settings.crosshair).toEqual({
    color: '#edf0e3',
    length: 5,
    gap: 5,
    thickness: 4,
    dot: false,
    dynamic: true,
  });
  settings.bindings.forward = 'KeyE';
  expect(defaultUserSettings().bindings.forward).toBe('KeyW');
  expect(normalizeUserSettings(null)).toEqual(defaultUserSettings());
});

it('swaps conflicting keys, rejects Escape and round-trips every binding', () => {
  const defaults = defaultUserSettings();
  const swapped = rebind(defaults, 'forward', 'KeyS');
  expect(swapped.bindings.forward).toBe('KeyS');
  expect(swapped.bindings.backward).toBe('KeyW');
  expect(defaults.bindings.forward).toBe('KeyW');
  expect(new Set(Object.values(swapped.bindings)).size).toBe(
    bindingActions.length,
  );
  expect(normalizeUserSettings(swapped)).toEqual(swapped);
  expect(rebind(swapped, 'jump', 'Escape')).toBe(swapped);
  expect(
    normalizeUserSettings({ bindings: { ...swapped.bindings, reload: 'KeyS' } })
      .bindings,
  ).toEqual(defaults.bindings);
});

it('persists preferences and tolerates blocked or corrupt browser storage', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  const settings = rebind(
    {
      ...defaultUserSettings(),
      fov: 103,
      syncAdsFov: true,
      muted: true,
      touchAimAssist: false,
      rifleSkin: 'cinder-wyrm',
    },
    'reload',
    'KeyE',
  );
  expect(saveUserSettings(settings)).toBe(true);
  expect(loadUserSettings()).toEqual(settings);
  data.set(userSettingsKey, '{broken');
  expect(loadUserSettings()).toEqual(defaultUserSettings());
  vi.stubGlobal('localStorage', {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
  });
  expect(loadUserSettings()).toEqual(defaultUserSettings());
  expect(saveUserSettings(settings)).toBe(false);
});

it('respects the operating system motion preference for fresh defaults', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  expect(loadUserSettings().reducedMotion).toBe(true);
  expect(normalizeUserSettings({ reducedMotion: false }).reducedMotion).toBe(
    false,
  );
});

it('migrates legacy customized bindings without resetting them or mutating the saved object', () => {
  const original = defaultUserSettings();
  original.bindings.forward = 'ArrowUp';
  original.bindings.reload = 'Digit4';
  const legacy = { ...original.bindings } as Partial<typeof original.bindings>;
  delete legacy.sniper;
  const result = normalizeUserSettings({ ...original, bindings: legacy });
  expect(result.bindings.forward).toBe('ArrowUp');
  expect(result.bindings.reload).toBe('Digit4');
  expect(result.bindings.sniper).toBe('Digit5');
  expect(legacy.sniper).toBeUndefined();
});

it('adds a sniper binding even when all spare number keys are already customized', () => {
  const bindings: Partial<ReturnType<typeof defaultUserSettings>['bindings']> =
    { ...defaultUserSettings().bindings };
  delete bindings.sniper;
  const keys = [
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
    'Digit0',
  ];
  const actions = bindingActions.filter((action) => action !== 'sniper');
  for (let i = 0; i < keys.length; i++) bindings[actions[i]!] = keys[i]!;
  const normalized = normalizeUserSettings({ bindings }).bindings;
  expect(normalized.sniper).toBe('KeyA');
  for (const action of actions)
    expect(normalized[action]).toBe(bindings[action]);
});

it('defaults old or invalid scope settings to classic while preserving other preferences', () => {
  expect(defaultUserSettings().scopeStyle).toBe('classic');
  for (const scopeStyle of [undefined, null, 'bad', 1, 'classic']) {
    const value = normalizeUserSettings({ scopeStyle, fov: 103, muted: true });
    expect(value.scopeStyle).toBe('classic');
    expect(value.fov).toBe(103);
    expect(value.muted).toBe(true);
  }
  expect(normalizeUserSettings({ scopeStyle: 'optic' }).scopeStyle).toBe(
    'optic',
  );
});

it('saves and restores either scope style', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  for (const scopeStyle of ['optic', 'classic'] as const) {
    expect(saveUserSettings({ ...defaultUserSettings(), scopeStyle })).toBe(
      true,
    );
    expect(loadUserSettings().scopeStyle).toBe(scopeStyle);
  }
});

it('defaults auto reload on for legacy/invalid preferences and persists either choice', () => {
  expect(defaultUserSettings().autoReload).toBe(true);
  expect(
    normalizeUserSettings({ autoReload: 'false', fov: 103 }).autoReload,
  ).toBe(true);
  expect(normalizeUserSettings({ fov: 103 }).autoReload).toBe(true);
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  for (const autoReload of [true, false]) {
    expect(
      saveUserSettings({ ...defaultUserSettings(), autoReload, fov: 103 }),
    ).toBe(true);
    expect(loadUserSettings()).toMatchObject({ autoReload, fov: 103 });
  }
});

it('migrates a legacy global sensitivity once and preserves unrelated settings', () => {
  const legacy = normalizeUserSettings({
    sensitivity: 1.75,
    fov: 103,
    autoReload: false,
    muted: true,
  });
  for (const group of Object.values(legacy.sensitivity))
    expect(Object.values(group)).toEqual([175, 175, 175, 175]);
  expect(legacy).toMatchObject({ fov: 103, autoReload: false, muted: true });
  expect(normalizeUserSettings(legacy)).toEqual(legacy);
  const fresh = defaultUserSettings();
  fresh.sensitivity.camera.ads = 17;
  expect(fresh.sensitivity.firing.ads).toBe(100);
  expect(defaultUserSettings().sensitivity.camera.ads).toBe(100);
});
it('validates each sensitivity independently and safely fills partial or malformed groups', () => {
  const value = normalizeUserSettings({
    sensitivity: {
      camera: { steering: 500, ads: -10, sniper: 42.7, vertical: Infinity },
      firing: { steering: 150, ads: '80', sniper: null, vertical: 25 },
    },
  });
  expect(value.sensitivity).toEqual({
    camera: { steering: 300, ads: 1, sniper: 43, vertical: 100 },
    firing: { steering: 150, ads: 100, sniper: 100, vertical: 25 },
  });
  for (const sensitivity of [
    undefined,
    null,
    'bad',
    [],
    { camera: null },
    NaN,
    Infinity,
  ]) {
    expect(normalizeUserSettings({ sensitivity }).sensitivity).toEqual(
      defaultUserSettings().sensitivity,
    );
  }
});
it('persists all eight sensitivity values independently without resetting bindings or preferences', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  const settings = rebind(
    {
      ...defaultUserSettings(),
      sensitivity: {
        camera: { steering: 11, ads: 22, sniper: 33, vertical: 44 },
        firing: { steering: 55, ads: 66, sniper: 77, vertical: 88 },
      },
      fov: 103,
      scopeStyle: 'optic',
      autoReload: false,
    },
    'forward',
    'KeyE',
  );
  expect(saveUserSettings(settings)).toBe(true);
  expect(loadUserSettings()).toEqual(settings);
});

it('migrates legacy gyro camera values and persists separate axis inversion', () => {
  expect(normalizeUserSettings({ sensitivity: 1.5 })).toMatchObject({
    gyroVersion: 2,
    gyroActivation: 'off',
    gyroDeadZone: 0.1,
    gyroInvertHorizontal: false,
    gyroInvertVertical: false,
    gyroSensitivity: { steering: 100, ads: 100, sniper: 100, vertical: 100 },
    sensitivity: { camera: { steering: 150 } },
  });
  const settings = normalizeUserSettings({
    gyroEnabled: true,
    gyroInvertHorizontal: true,
    invertY: true,
    gyroSensitivity: {
      camera: 127.2,
      ads: 500,
      sniper: 84.7,
      vertical: Infinity,
    },
  });
  expect(settings).toMatchObject({
    gyroVersion: 2,
    gyroActivation: 'always',
    gyroDeadZone: 0.5,
  });
  expect(normalizeUserSettings({ gyroEnabled: false })).toMatchObject({
    gyroActivation: 'off',
  });
  expect(settings.gyroInvertHorizontal).toBe(true);
  expect(settings.gyroInvertVertical).toBe(true);
  expect(settings.gyroSensitivity).toEqual({
    steering: 127,
    ads: 300,
    sniper: 85,
    vertical: 100,
  });
  expect(normalizeUserSettings(JSON.parse(JSON.stringify(settings)))).toEqual(
    settings,
  );
  expect(
    normalizeUserSettings({
      gyroInvertHorizontal: 'true',
      gyroInvertVertical: false,
      gyroEnabled: true,
      invertY: true,
      gyroSensitivity: { camera: 127, steering: -20 },
    }),
  ).toMatchObject({
    gyroInvertHorizontal: false,
    gyroInvertVertical: false,
    gyroSensitivity: { steering: 1 },
  });
});

it('removes the old mapping choice and preserves saved gyro controls and measurements', () => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  });
  const measurement = {
    sensitivity: 115,
    aim: 'hip',
    axis: 'pitch',
    firing: false,
    phoneDegrees: 10,
    cameraDegrees: 20,
    referenceFov: 'FOV 75',
    notes: '',
  };
  const settings = normalizeUserSettings({
    gyroVersion: 1,
    gyroActivation: 'ads',
    gyroMapping: 'calibrated',
    gyroSensitivity: { steering: 115 },
    gyroInvertVertical: true,
    gyroCalibration: [measurement],
  });
  expect(settings).not.toHaveProperty('gyroMapping');
  expect(settings).toMatchObject({
    gyroVersion: 2,
    gyroActivation: 'ads',
    gyroSensitivity: { steering: 115 },
    gyroInvertVertical: true,
    gyroCalibration: [measurement],
  });
  expect(saveUserSettings(settings)).toBe(true);
  expect(loadUserSettings()).toEqual(settings);
});
