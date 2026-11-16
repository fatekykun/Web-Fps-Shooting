import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateResolution,
  defaultGraphics,
  graphicsPresets,
  loadGraphicsSettings,
  saveGraphicsSettings,
  type GraphicsPreset,
} from './graphicsConfig';

afterEach(() => vi.unstubAllGlobals());

describe('pixel resolution and settings', () => {
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
    expect(result.width * result.height).toBeLessThanOrEqual(640 * 360);
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

  it('rejects corrupt, unsupported or unavailable persisted settings', () => {
    for (const value of [
      '{',
      'null',
      '{"preset":"ultra","adaptive":true}',
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
      saveGraphicsSettings({ preset: 'quality', adaptive: false }),
    ).not.toThrow();
  });

  it('persists an explicit manual preset', () => {
    let saved = '';
    vi.stubGlobal('localStorage', {
      getItem: () => saved,
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    });
    saveGraphicsSettings({ preset: 'performance', adaptive: false });
    expect(loadGraphicsSettings()).toEqual({
      preset: 'performance',
      adaptive: false,
    });
  });
});
