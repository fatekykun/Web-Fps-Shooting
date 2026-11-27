import { isAntiAliasingMode, type AntiAliasingMode } from './antiAliasing';

export const graphicsPresets = {
  performance: { label: 'Low', width: 960, height: 540, dpr: 1 },
  balanced: { label: 'Medium', width: 1280, height: 720, dpr: 1.5 },
  quality: { label: 'High', width: 1600, height: 900, dpr: 1.75 },
  hd: { label: 'HD', width: 1920, height: 1080, dpr: 2 },
  ultra: { label: 'Ultra', width: 2560, height: 1440, dpr: 2 },
} as const;

export type GraphicsPreset = keyof typeof graphicsPresets;
export const presetOrder: readonly GraphicsPreset[] = [
  'performance',
  'balanced',
  'quality',
  'hd',
  'ultra',
];
export interface GraphicsSettings {
  antiAliasing: AntiAliasingMode;
  preset: GraphicsPreset;
  adaptive: boolean;
  textureQuality: 'low' | 'high' | 'hd';
  shadowQuality: 'off' | 'low' | 'high' | 'ultra';
  viewDistance: 40 | 60 | 80;
  renderScale: 0.5 | 0.75 | 1;
}
const qualityProfiles = {
  performance: ['off', 'low', 'off', 40],
  balanced: ['fxaa', 'high', 'low', 60],
  quality: ['msaa2', 'high', 'high', 80],
  hd: ['smaa', 'hd', 'high', 80],
  ultra: ['msaa4', 'hd', 'ultra', 80],
} as const;

export function settingsForPreset(preset: GraphicsPreset): GraphicsSettings {
  const [antiAliasing, textureQuality, shadowQuality, viewDistance] =
    qualityProfiles[preset];
  return {
    preset,
    antiAliasing,
    textureQuality,
    shadowQuality,
    viewDistance,
    adaptive: false,
    renderScale: 1,
  };
}

export const defaultGraphics: Readonly<GraphicsSettings> =
  settingsForPreset('balanced');

export const shadowMapSizes = {
  off: 0,
  low: 1024,
  high: 2048,
  ultra: 4096,
} as const;
export const graphicsStorageKey = 'breakpoint.graphics.v2';
export const adaptiveConfig = Object.freeze({
  warmupMs: 2000,
  windowMs: 1000,
  // Allow a small amount of refresh-timing jitter around the 60 FPS budget.
  slowFrameMs: 1000 / 58,
  fastFrameMs: 1000 / 59,
  slowWindows: 2,
  fastWindows: 8,
  cooldownMs: 10000,
  maxSampleMs: 250,
});

export function isGraphicsPreset(value: unknown): value is GraphicsPreset {
  return typeof value === 'string' && Object.hasOwn(graphicsPresets, value);
}

export function loadGraphicsSettings(handheld = false): GraphicsSettings {
  const fallback = { ...defaultGraphics, adaptive: handheld };
  try {
    const stored =
      localStorage.getItem(graphicsStorageKey) ??
      localStorage.getItem('breakpoint.graphics.v1');
    return stored
      ? normalizeGraphicsSettings(JSON.parse(stored), fallback)
      : fallback;
  } catch {
    /* Storage is optional, including in private browsing. */
  }
  return fallback;
}

export function normalizeGraphicsSettings(
  value: unknown,
  fallback = defaultGraphics,
): GraphicsSettings {
  if (!value || typeof value !== 'object') return { ...fallback };
  const v = value as Record<string, unknown>;
  if (!isGraphicsPreset(v.preset) || typeof v.adaptive !== 'boolean')
    return { ...fallback };
  const profile = settingsForPreset(v.preset);
  return {
    antiAliasing: isAntiAliasingMode(v.antiAliasing)
      ? v.antiAliasing
      : profile.antiAliasing,
    preset: v.preset,
    adaptive: v.adaptive,
    textureQuality:
      v.textureQuality === 'low' ||
      v.textureQuality === 'high' ||
      v.textureQuality === 'hd'
        ? v.textureQuality
        : profile.textureQuality,
    shadowQuality:
      v.shadowQuality === 'off' ||
      v.shadowQuality === 'low' ||
      v.shadowQuality === 'high' ||
      v.shadowQuality === 'ultra'
        ? v.shadowQuality
        : profile.shadowQuality,
    viewDistance:
      v.viewDistance === 40 || v.viewDistance === 60 || v.viewDistance === 80
        ? v.viewDistance
        : profile.viewDistance,
    renderScale:
      v.renderScale === 0.5 || v.renderScale === 0.75 ? v.renderScale : 1,
  };
}

/** Match device pixels within the selected quality budget, keeping CSS dimensions independent. */
export function calculateOutputResolution(
  preset: GraphicsPreset,
  width: number,
  height: number,
  dpr: number,
) {
  width = Math.max(1, Math.floor(width));
  height = Math.max(1, Math.floor(height));
  const profile = graphicsPresets[preset];
  const density = Math.min(
    Number.isFinite(dpr) && dpr > 0 ? dpr : 1,
    profile.dpr,
    Math.max(1, Math.sqrt((profile.width * profile.height) / (width * height))),
  );
  return {
    width: Math.max(1, Math.floor(width * density)),
    height: Math.max(1, Math.floor(height * density)),
  };
}

export function saveGraphicsSettings(settings: GraphicsSettings): void {
  try {
    localStorage.setItem(
      graphicsStorageKey,
      JSON.stringify(normalizeGraphicsSettings(settings)),
    );
  } catch {
    /* Settings remain usable when persistence is unavailable. */
  }
}

/** Keep the preset's pixel budget on wide/portrait views without stretching camera projection. */
export function calculateResolution(
  preset: GraphicsPreset,
  outputWidth: number,
  outputHeight: number,
  renderScale = 1,
) {
  outputWidth = Math.max(1, Math.floor(outputWidth));
  outputHeight = Math.max(1, Math.floor(outputHeight));
  const base = graphicsPresets[preset];
  const aspect = outputWidth / outputHeight;
  renderScale = Number.isFinite(renderScale)
    ? Math.max(0.5, Math.min(1, renderScale))
    : 1;
  if (outputWidth * outputHeight <= base.width * base.height * renderScale ** 2)
    return { width: outputWidth, height: outputHeight };
  let width: number = base.width * renderScale;
  let height: number = base.height * renderScale;
  if (Math.abs(aspect - 16 / 9) > 0.005) {
    height = Math.max(
      1,
      Math.floor(
        Math.sqrt(
          (base.width * base.height * renderScale * renderScale) / aspect,
        ),
      ),
    );
    width = Math.max(1, Math.floor(height * aspect));
  }
  const scale = Math.min(1, outputWidth / width, outputHeight / height);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/** A lower tier must reduce pixel work even when the viewport fits both budgets. */
export function calculateAdaptiveResolution(
  ceiling: GraphicsPreset,
  active: GraphicsPreset,
  width: number,
  height: number,
  renderScale: number,
) {
  const target = calculateResolution(ceiling, width, height, renderScale);
  if (active === ceiling) return target;
  const ratio = graphicsPresets[active].width / graphicsPresets[ceiling].width;
  return {
    width: Math.max(1, Math.floor(target.width * ratio)),
    height: Math.max(1, Math.floor(target.height * ratio)),
  };
}
