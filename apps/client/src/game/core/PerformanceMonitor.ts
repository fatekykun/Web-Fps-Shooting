export interface PerformanceStats {
  fps: number;
  frameMs: number;
  lowFps: number;
  cpuMs: number;
  drawCalls: number;
  triangles: number;
  heapMb: number | null;
}

/** A rolling 10-second / 600-frame sample at 60 Hz; emits only at 4 Hz. */
export class PerformanceMonitor {
  private readonly frames = new Float64Array(600);
  private readonly sorted = new Float64Array(600);
  private count = 0;
  private cursor = 0;
  private lastReport = 0;
  private cpuTotal = 0;
  private cpuSamples = 0;

  record(frameMs: number, cpuMs: number): void {
    if (Number.isFinite(frameMs) && frameMs > 0) {
      this.frames[this.cursor] = frameMs;
      this.cursor = (this.cursor + 1) % this.frames.length;
      this.count = Math.min(this.count + 1, this.frames.length);
      this.cpuTotal += cpuMs;
      this.cpuSamples++;
    }
  }

  sample(
    now: number,
    drawCalls: number,
    triangles: number,
  ): PerformanceStats | null {
    if (now - this.lastReport < 250 || this.count === 0) return null;
    this.lastReport = now;
    let total = 0;
    for (let i = 0; i < this.count; i++) {
      const value = this.frames[i]!;
      total += value;
      this.sorted[i] = value;
    }
    const ordered = this.sorted.subarray(0, this.count).sort();
    // 1% low = 1000 / mean duration of the slowest 1% of sampled frames.
    const slowCount = Math.max(1, Math.ceil(this.count * 0.01));
    let slowTotal = 0;
    for (let i = this.count - slowCount; i < this.count; i++)
      slowTotal += ordered[i]!;
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    const stats: PerformanceStats = {
      fps: (1000 * this.count) / total,
      frameMs: total / this.count,
      lowFps: (1000 * slowCount) / slowTotal,
      cpuMs: this.cpuTotal / Math.max(1, this.cpuSamples),
      drawCalls,
      triangles,
      heapMb:
        memory && Number.isFinite(memory.usedJSHeapSize)
          ? memory.usedJSHeapSize / 1048576
          : null,
    };
    this.cpuTotal = 0;
    this.cpuSamples = 0;
    return stats;
  }

  reset(): void {
    this.count = 0;
    this.cursor = 0;
    this.cpuSamples = 0;
    this.cpuTotal = 0;
    this.lastReport = 0;
  }
}
