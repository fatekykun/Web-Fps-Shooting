import {
  adaptiveConfig as config,
  presetOrder,
  type GraphicsPreset,
  type GraphicsSettings,
} from './graphicsConfig';

/** Fixed storage; decisions use full frame duration, not just asynchronous CPU submission time. */
export class AdaptiveResolution {
  current: GraphicsPreset;
  private ceiling: number;
  private enabled: boolean;
  private elapsed = 0;
  private windowTime = 0;
  private samples = 0;
  private slow = 0;
  private fast = 0;
  private changedAt = -config.cooldownMs;

  constructor(settings: Pick<GraphicsSettings, 'preset' | 'adaptive'>) {
    this.current = settings.preset;
    this.ceiling = presetOrder.indexOf(settings.preset);
    this.enabled = settings.adaptive;
  }

  configure(settings: Pick<GraphicsSettings, 'preset' | 'adaptive'>): void {
    this.current = settings.preset;
    this.ceiling = presetOrder.indexOf(settings.preset);
    this.enabled = settings.adaptive;
    this.reset();
  }

  reset(): void {
    this.elapsed = 0;
    this.windowTime = 0;
    this.samples = 0;
    this.slow = 0;
    this.fast = 0;
    this.changedAt = -config.cooldownMs;
  }

  observe(frameMs: number): GraphicsPreset | null {
    if (!this.enabled || !Number.isFinite(frameMs) || frameMs <= 0) return null;
    // A suspended/debugged frame is not a useful sustained-load sample.
    if (frameMs > 1000) {
      this.reset();
      return null;
    }
    const sample = Math.min(frameMs, config.maxSampleMs);
    this.elapsed += sample;
    if (this.elapsed < config.warmupMs) return null;
    this.windowTime += sample;
    this.samples++;
    if (this.windowTime < config.windowMs) return null;
    const average = this.windowTime / this.samples;
    this.windowTime = 0;
    this.samples = 0;
    this.slow = average > config.slowFrameMs ? this.slow + 1 : 0;
    this.fast = average < config.fastFrameMs ? this.fast + 1 : 0;
    if (this.elapsed - this.changedAt < config.cooldownMs) return null;
    const index = presetOrder.indexOf(this.current);
    let next = index;
    if (this.slow >= config.slowWindows && index > 0) next--;
    else if (this.fast >= config.fastWindows && index < this.ceiling) next++;
    if (next === index) return null;
    this.current = presetOrder[next]!;
    this.changedAt = this.elapsed;
    this.slow = 0;
    this.fast = 0;
    return this.current;
  }
}
