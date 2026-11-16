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
