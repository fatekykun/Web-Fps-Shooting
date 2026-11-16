export const graphicsPresets = {
  performance: { label: 'Performance', width: 426, height: 240 },
  balanced: { label: 'Balanced', width: 640, height: 360 },
  quality: { label: 'Quality', width: 854, height: 480 },
} as const;

export type GraphicsPreset = keyof typeof graphicsPresets;
export const presetOrder: readonly GraphicsPreset[] = [
  'performance',
  'balanced',
  'quality',
];
export interface GraphicsSettings {
  preset: GraphicsPreset;
  adaptive: boolean;
}
export const defaultGraphics: Readonly<GraphicsSettings> = {
  preset: 'balanced',
  adaptive: true,
};
export const graphicsStorageKey = 'breakpoint.graphics.v1';
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
  return value === 'performance' || value === 'balanced' || value === 'quality';
}

export function loadGraphicsSettings(): GraphicsSettings {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(graphicsStorageKey) ?? 'null',
    );
    if (
      parsed &&
      typeof parsed === 'object' &&
      'preset' in parsed &&
      'adaptive' in parsed &&
      isGraphicsPreset(parsed.preset) &&
      typeof parsed.adaptive === 'boolean'
    ) {
      return { preset: parsed.preset, adaptive: parsed.adaptive };
    }
  } catch {
    /* Storage is optional, including in private browsing. */
  }
  return { ...defaultGraphics };
}

export function saveGraphicsSettings(settings: GraphicsSettings): void {
  try {
    localStorage.setItem(graphicsStorageKey, JSON.stringify(settings));
  } catch {
    /* Settings remain usable when persistence is unavailable. */
  }
}

/** Keep the preset's pixel budget on wide/portrait views without stretching camera projection. */
export function calculateResolution(
  preset: GraphicsPreset,
  outputWidth: number,
  outputHeight: number,
) {
  outputWidth = Math.max(1, Math.floor(outputWidth));
  outputHeight = Math.max(1, Math.floor(outputHeight));
  const base = graphicsPresets[preset];
  const aspect = outputWidth / outputHeight;
  let width: number = base.width;
  let height: number = base.height;
  if (Math.abs(aspect - 16 / 9) > 0.005) {
    height = Math.max(
      1,
      Math.floor(Math.sqrt((base.width * base.height) / aspect)),
    );
    width = Math.max(1, Math.floor(height * aspect));
  }
  const scale = Math.min(1, outputWidth / width, outputHeight / height);
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}
