import { afterEach, expect, it, vi } from 'vitest';
import {
  resolveAntiAliasing,
  supportedAntiAliasing,
  antiAliasingModes,
} from './antiAliasing';
import {
  defaultGraphics,
  settingsForPreset,
  graphicsStorageKey,
  loadGraphicsSettings,
  normalizeGraphicsSettings,
  saveGraphicsSettings,
} from './graphicsConfig';

afterEach(() => vi.unstubAllGlobals());

it('requires exact color AND depth support and float buffers for SMAA', () => {
  expect(supportedAntiAliasing([4, 2], [4], true)).toEqual([
    'off',
    'fxaa',
    'smaa',
    'msaa4',
  ]);
  expect(supportedAntiAliasing([], [], false)).toEqual(['off', 'fxaa']);
  expect(supportedAntiAliasing([8, 4, 2], [4, 2], true)).toEqual(
    antiAliasingModes,
  );
  expect(resolveAntiAliasing('msaa2', ['off', 'fxaa', 'msaa4'])).toBe('fxaa');
  expect(resolveAntiAliasing('smaa', ['off', 'fxaa'])).toBe('fxaa');
});

it('fills missing AA from the selected profile and respects explicit preferences', () => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) =>
      key === graphicsStorageKey
        ? JSON.stringify({
            preset: 'ultra',
            adaptive: false,
            textureQuality: 'low',
          })
        : null,
  });
  expect(loadGraphicsSettings()).toEqual({
    ...settingsForPreset('ultra'),
    textureQuality: 'low',
  });
  expect(
    normalizeGraphicsSettings({ ...defaultGraphics, antiAliasing: 'taa' })
      .antiAliasing,
  ).toBe('fxaa');
});

it.each(antiAliasingModes)(
  'persists %s and preserves it when changing presets',
  (antiAliasing) => {
    let value = '';
    vi.stubGlobal('localStorage', {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    });
    saveGraphicsSettings({
      ...defaultGraphics,
      antiAliasing,
      preset: 'quality',
    });
    expect(loadGraphicsSettings().antiAliasing).toBe(antiAliasing);
    saveGraphicsSettings({ ...loadGraphicsSettings(), preset: 'performance' });
    expect(loadGraphicsSettings()).toEqual({
      ...defaultGraphics,
      antiAliasing,
      preset: 'performance',
    });
  },
);
