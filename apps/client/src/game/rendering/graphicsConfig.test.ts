import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateResolution,
  defaultGraphics,
  graphicsPresets,
  loadGraphicsSettings,
  saveGraphicsSettings,
  normalizeGraphicsSettings,
  graphicsStorageKey,
  type GraphicsPreset,
} from './graphicsConfig';

afterEach(() => vi.unstubAllGlobals());

describe('pixel resolution and settings', () => {
  it('uses the ticket resolution targets and supports explicit classic pixel density', () => {
    expect(calculateResolution('performance', 1280, 720)).toEqual({
      width: 640,
      height: 360,
    });
    expect(calculateResolution('balanced', 1280, 720)).toEqual({
      width: 960,
      height: 540,
    });
    expect(calculateResolution('quality', 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    expect(calculateResolution('quality', 1280, 720, 0.5)).toEqual({
      width: 640,
      height: 360,
    });
    const wide = calculateResolution('quality', 2560, 1080, 0.75);
    expect(wide.width * wide.height).toBeLessThanOrEqual(
      1280 * 720 * 0.75 ** 2,
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
      ...defaultGraphics,
      preset: 'quality',
      adaptive: false,
    });
    expect(graphicsStorageKey).toBe('breakpoint.graphics.v2');
    expect(
      normalizeGraphicsSettings({
        preset: 'balanced',
        adaptive: true,
        renderScale: -5,
        viewDistance: NaN,
        shadowQuality: 'ultra',
      }),
    ).toEqual(defaultGraphics);
  });
  it.each(['performance', 'balanced', 'quality'] as GraphicsPreset[])(
    'uses the exact %s preset at 1280×720',
    (preset) => {
      expect(calculateResolution(preset, 1280, 720)).toEqual({
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
    expect(result.width * result.height).toBeLessThanOrEqual(960 * 540);
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

  it('renders Ultra at 1080p, clamps smaller windows and preserves wide-screen aspect', () => {
    expect(calculateResolution('ultra', 1920, 1080)).toEqual({
      width: 1920,
      height: 1080,
    });
    expect(calculateResolution('ultra', 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    });
    const wide = calculateResolution('ultra', 3440, 1440);
    expect(wide.width * wide.height).toBeLessThanOrEqual(1920 * 1080);
    expect(Math.abs(wide.width / wide.height - 3440 / 1440)).toBeLessThan(0.01);
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
