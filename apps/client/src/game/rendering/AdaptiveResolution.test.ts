import { describe, expect, it } from 'vitest';
import { AdaptiveResolution } from './AdaptiveResolution';
import type { GraphicsPreset } from './graphicsConfig';

function run(
  controller: AdaptiveResolution,
  frameMs: number,
  durationMs: number,
) {
  const changes: GraphicsPreset[] = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += frameMs) {
    const changed = controller.observe(frameMs);
    if (changed) changes.push(changed);
  }
  return changes;
}

describe('adaptive resolution hysteresis', () => {
  it('limits Ultra to one reduction and can recover to its ceiling', () => {
    const controller = new AdaptiveResolution({
      preset: 'ultra',
      adaptive: true,
    });
    expect(run(controller, 30, 4500)).toEqual(['hd']);
    expect(run(controller, 30, 18000)).toEqual([]);
    expect(run(controller, 1000 / 60, 18000)).toEqual(['ultra']);
    expect(run(controller, 1000 / 60, 30000)).toEqual([]);
    controller.configure({ preset: 'ultra', adaptive: false });
    expect(run(controller, 100, 30000)).toEqual([]);
    expect(controller.current).toBe('ultra');
  });

  it('waits for warmup, sustained load and cooldown before dropping further', () => {
    const controller = new AdaptiveResolution({
      preset: 'quality',
      adaptive: true,
    });
    expect(run(controller, 30, 3000)).toEqual([]);
    expect(run(controller, 30, 1500)).toEqual(['balanced']);
    expect(run(controller, 30, 8000)).toEqual([]);
    expect(run(controller, 30, 3000)).toEqual(['performance']);
  });

  it('recovers after sustained stable 60 Hz frames, staying below the chosen ceiling', () => {
    const controller = new AdaptiveResolution({
      preset: 'balanced',
      adaptive: true,
    });
    expect(run(controller, 30, 4500)).toEqual(['performance']);
    expect(run(controller, 1000 / 60, 7000)).toEqual([]);
    expect(run(controller, 1000 / 60, 10000)).toEqual(['balanced']);
    expect(run(controller, 1000 / 60, 30000)).toEqual([]);
  });

  it('responds to sustained 55 FPS while tolerating 60 Hz refresh jitter', () => {
    const controller = new AdaptiveResolution({
      preset: 'balanced',
      adaptive: true,
    });
    expect(run(controller, 17, 5000)).toEqual([]);
    expect(run(controller, 1000 / 55, 4500)).toEqual(['performance']);
  });

  it('keeps manual and minimum settings stable', () => {
    const manual = new AdaptiveResolution({
      preset: 'quality',
      adaptive: false,
    });
    expect(run(manual, 100, 30000)).toEqual([]);
    expect(manual.current).toBe('quality');
    const minimum = new AdaptiveResolution({
      preset: 'performance',
      adaptive: true,
    });
    expect(run(minimum, 100, 30000)).toEqual([]);
    expect(run(minimum, 10, 30000)).toEqual([]);
  });

  it('does not downgrade for an isolated stall or invalid sample', () => {
    const controller = new AdaptiveResolution({
      preset: 'balanced',
      adaptive: true,
    });
    run(controller, 1000 / 60, 4000);
    expect(controller.observe(250)).toBeNull();
    expect(controller.observe(Number.NaN)).toBeNull();
    expect(controller.observe(0)).toBeNull();
    expect(run(controller, 1000 / 60, 6000)).toEqual([]);
    expect(controller.observe(5000)).toBeNull();
    expect(controller.current).toBe('balanced');
  });

  it('applies settings immediately and resets warmup after pause/resize', () => {
    const controller = new AdaptiveResolution({
      preset: 'quality',
      adaptive: true,
    });
    run(controller, 40, 4500);
    controller.reset();
    expect(controller.current).toBe('balanced');
    expect(run(controller, 40, 1500)).toEqual([]);
    controller.configure({ preset: 'performance', adaptive: false });
    expect(controller.current).toBe('performance');
    expect(run(controller, 10, 30000)).toEqual([]);
  });
});
