import { describe, expect, it } from 'vitest';
import { PerformanceMonitor } from './PerformanceMonitor';

describe('performance telemetry', () => {
  it('includes long foreground stalls in average FPS and 1% low', () => {
    const monitor = new PerformanceMonitor();
    for (let i = 0; i < 99; i++) monitor.record(10, 0.5);
    monitor.record(1000, 0.5);
    const stats = monitor.sample(1000, 20, 2000)!;
    expect(stats.frameMs).toBeCloseTo(19.9);
    expect(stats.fps).toBeCloseTo(1000 / 19.9);
    expect(stats.lowFps).toBe(1);
    expect(stats.cpuMs).toBe(0.5);
    expect(stats.drawCalls).toBe(20);
    expect(monitor.sample(1100, 20, 2000)).toBeNull();
  });

  it('resets the rolling window when training is resumed', () => {
    const monitor = new PerformanceMonitor();
    monitor.record(100, 5);
    monitor.reset();
    expect(monitor.sample(1000, 0, 0)).toBeNull();
    monitor.record(20, 1);
    expect(monitor.sample(2000, 0, 0)!.fps).toBe(50);
  });
});
