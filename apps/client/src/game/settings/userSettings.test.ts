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
  expect(settings.sensitivity).toBe(3);
  expect(settings.fov).toBe(85);
  expect(settings.invertY).toBe(false);
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
    { ...defaultUserSettings(), fov: 103, muted: true },
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
