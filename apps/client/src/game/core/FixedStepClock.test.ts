import { describe, expect, it } from 'vitest';
import { FixedStepClock } from './FixedStepClock';

describe('fixed-step clock', () => {
  it.each([30, 60, 144])(
    'simulates one second equally at %i render FPS',
    (fps) => {
      const clock = new FixedStepClock();
      let ticks = 0;
      let elapsed = 0;
      for (let frame = 0; frame < fps; frame++) {
        const alpha = clock.advance(1 / fps, (dt) => {
          ticks++;
          elapsed += dt;
        });
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThanOrEqual(1);
      }
      expect(ticks).toBe(60);
      expect(elapsed).toBeCloseTo(1);
    },
  );

  it('bounds work after a stall and clears accumulated time on pause', () => {
    const clock = new FixedStepClock();
    let ticks = 0;
    clock.advance(10, () => {
      ticks++;
    });
    expect(ticks).toBe(6);
    clock.advance(0.008, () => {
      ticks++;
    });
    clock.reset();
    clock.advance(0.009, () => {
      ticks++;
    });
    expect(ticks).toBe(6);
  });
});
