import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateResolution,
  calculateAdaptiveResolution,
  calculateOutputResolution,
  settingsForPreset,
  defaultGraphics,
  graphicsPresets,
  loadGraphicsSettings,
  saveGraphicsSettings,
  normalizeGraphicsSettings,
  graphicsStorageKey,
  type GraphicsPreset,
} from './graphicsConfig';

afterEach(() => vi.unstubAllGlobals());

describe('render resolution and settings', () => {
  it('uses the selected resolutions and supports an explicit lower render scale', () => {
    expect(calculateResolution('performance', 1280, 720)).toEqual({
      width: 960,
      height: 540,
    });
    expect(calculateResolution('balanced', 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    expect(calculateResolution('quality', 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    expect(calculateResolution('quality', 1280, 720, 0.5)).toEqual({
      width: 800,
      height: 450,
    });
    const wide = calculateResolution('quality', 2560, 1080, 0.75);
    expect(wide.width * wide.height).toBeLessThanOrEqual(
      1600 * 900 * 0.75 ** 2,
    );
    expect(Math.abs(wide.width / wide.height - 2560 / 1080)).toBeLessThan(0.01);
  });
  it('migrates old preset preferences without retaining the old low-resolution budgets', () => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) =>
        key === 'breakpoint.graphics.v1'
          ? JSON.stringify({ preset: 'quality', adaptive: false })
          : null,
    });
    expect(loadGraphicsSettings()).toEqual({
      ...settingsForPreset('quality'),
      adaptive: false,
    });
    expect(graphicsStorageKey).toBe('breakpoint.graphics.v2');
    expect(
      normalizeGraphicsSettings({
        preset: 'balanced',
        adaptive: true,
        renderScale: -5,
        viewDistance: NaN,
        shadowQuality: 'cinematic',
      }),
    ).toEqual({ ...defaultGraphics, adaptive: true });
  });
  it.each([
    'performance',
    'balanced',
    'quality',
    'hd',
    'ultra',
  ] as GraphicsPreset[])(
    'uses the exact %s budget at a large viewport',
    (preset) => {
      expect(calculateResolution(preset, 3840, 2160)).toEqual({
        width: graphicsPresets[preset].width,
        height: graphicsPresets[preset].height,
      });
    },
  );

  it.each([
    [3440, 1440],
    [720, 1280],
    [960, 640],
    [1280, 800],
  ])('keeps the pixel budget and aspect for %i×%i', (width, height) => {
    const result = calculateResolution('balanced', width, height);
    expect(result.width * result.height).toBeLessThanOrEqual(1280 * 720);
    expect(
      Math.abs(result.width / result.height - width / height),
    ).toBeLessThan(0.01);
  });

  it('does not render more pixels than a tiny output needs', () => {
    expect(calculateResolution('quality', 1, 1)).toEqual({
      width: 1,
      height: 1,
    });
    const size = calculateResolution('quality', 320, 180);
    expect(size.width).toBeLessThanOrEqual(320);
    expect(size.height).toBeLessThanOrEqual(180);
  });

  it('renders HD at 1080p, clamps smaller windows and preserves wide-screen aspect', () => {
    expect(calculateResolution('hd', 1920, 1080)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(calculateResolution('hd', 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    const wide = calculateResolution('hd', 3440, 1440);
    expect(wide.width * wide.height).toBeLessThanOrEqual(1920 * 1080);
    expect(Math.abs(wide.width / wide.height - 3440 / 1440)).toBeLessThan(0.01);
  });

  it('uses native device pixels up to the preset budget', () => {
    expect(calculateOutputResolution('hd', 960, 540, 3)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(calculateOutputResolution('performance', 844, 390, 3)).toEqual({
      width: 844,
      height: 390,
    });
    expect(calculateOutputResolution('ultra', 1920, 1080, 2)).toEqual({
      width: 2560,
      height: 1440,
    });
  });

  it('reduces pixel work when a phone viewport fits both adaptive tier budgets', () => {
    expect(calculateAdaptiveResolution('hd', 'hd', 1688, 780, 1)).toEqual({
      width: 1688,
      height: 780,
    });
    expect(calculateAdaptiveResolution('hd', 'quality', 1688, 780, 1)).toEqual({
      width: 1406,
      height: 650,
    });
    expect(calculateAdaptiveResolution('hd', 'quality', 1920, 1080, 1)).toEqual(
      {
        width: 1600,
        height: 900,
      },
    );
  });

  it('rejects corrupt, unsupported or unavailable persisted settings', () => {
    for (const value of [
      '{',
      'null',
      '{"preset":"cinematic","adaptive":true}',
      '{"preset":"quality","adaptive":"yes"}',
    ]) {
      vi.stubGlobal('localStorage', { getItem: () => value });
      expect(loadGraphicsSettings()).toEqual(defaultGraphics);
    }
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(loadGraphicsSettings()).toEqual(defaultGraphics);
    expect(() =>
      saveGraphicsSettings({
        ...defaultGraphics,
        preset: 'quality',
        adaptive: false,
      }),
    ).not.toThrow();
  });

  it.each(['performance', 'ultra'] as const)(
    'persists an explicit manual %s preset',
    (preset) => {
      let saved = '';
      vi.stubGlobal('localStorage', {
        getItem: () => saved,
        setItem: (_key: string, value: string) => {
          saved = value;
        },
      });
      saveGraphicsSettings({
        ...defaultGraphics,
        preset,
        adaptive: false,
      });
      expect(loadGraphicsSettings()).toEqual({
        ...defaultGraphics,
        preset,
        adaptive: false,
      });
    },
  );
});
