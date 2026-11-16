import { isAntiAliasingMode, type AntiAliasingMode } from './antiAliasing';

export const graphicsPresets = {
  performance: { label: 'Performance', width: 640, height: 360 },
  balanced: { label: 'Balanced', width: 960, height: 540 },
  quality: { label: 'Quality', width: 1280, height: 720 },
  ultra: { label: 'Ultra (1080p)', width: 1920, height: 1080 },
} as const;

export type GraphicsPreset = keyof typeof graphicsPresets;
export const presetOrder: readonly GraphicsPreset[] = [
  'performance',
  'balanced',
  'quality',
  'ultra',
];
export interface GraphicsSettings {
  antiAliasing: AntiAliasingMode;
  preset: GraphicsPreset;
  adaptive: boolean;
  textureQuality: 'low' | 'high';
  shadowQuality: 'off' | 'low' | 'high';
  viewDistance: 40 | 60 | 80;
  renderScale: 0.5 | 0.75 | 1;
}
export const defaultGraphics: Readonly<GraphicsSettings> = {
  antiAliasing: 'off',
  preset: 'balanced',
  adaptive: true,
  textureQuality: 'high',
  shadowQuality: 'off',
  viewDistance: 60,
  renderScale: 1,
};
export const graphicsStorageKey = 'breakpoint.graphics.v2';
export const adaptiveConfig = Object.freeze({
  warmupMs: 2000,
  windowMs: 1000,
  slowFrameMs: 20,
  fastFrameMs: 17.5,
  slowWindows: 2,
  fastWindows: 8,
  cooldownMs: 10000,
  maxSampleMs: 250,
});

export function isGraphicsPreset(value: unknown): value is GraphicsPreset {
  return (
    value === 'performance' ||
    value === 'balanced' ||
    value === 'quality' ||
    value === 'ultra'
  );
}

export function loadGraphicsSettings(): GraphicsSettings {
  try {
    return normalizeGraphicsSettings(
      JSON.parse(
        localStorage.getItem(graphicsStorageKey) ??
          localStorage.getItem('breakpoint.graphics.v1') ??
          'null',
      ),
    );
  } catch {
    /* Storage is optional, including in private browsing. */
  }
  return { ...defaultGraphics };
}

export function normalizeGraphicsSettings(value: unknown): GraphicsSettings {
  if (!value || typeof value !== 'object') return { ...defaultGraphics };
  const v = value as Record<string, unknown>;
  if (!isGraphicsPreset(v.preset) || typeof v.adaptive !== 'boolean')
    return { ...defaultGraphics };
  return {
    antiAliasing: isAntiAliasingMode(v.antiAliasing) ? v.antiAliasing : 'off',
    preset: v.preset,
    adaptive: v.adaptive,
    textureQuality: v.textureQuality === 'low' ? 'low' : 'high',
    shadowQuality:
      v.shadowQuality === 'low' || v.shadowQuality === 'high'
        ? v.shadowQuality
        : 'off',
    viewDistance:
      v.viewDistance === 40 || v.viewDistance === 80 ? v.viewDistance : 60,
    renderScale:
      v.renderScale === 0.5 || v.renderScale === 0.75 ? v.renderScale : 1,
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
