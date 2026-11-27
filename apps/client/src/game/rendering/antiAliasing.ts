export const antiAliasingModes = [
  'off',
  'fxaa',
  'smaa',
  'msaa2',
  'msaa4',
] as const;
export type AntiAliasingMode = (typeof antiAliasingModes)[number];
export const antiAliasingLabels: Record<AntiAliasingMode, string> = {
  off: 'Off · fastest',
  fxaa: 'FXAA · lightweight',
  smaa: 'SMAA · sharper edges',
  msaa2: 'MSAA 2X',
  msaa4: 'MSAA 4X',
};
export interface AntiAliasingState {
  requested: AntiAliasingMode;
  active: AntiAliasingMode;
  supported: readonly AntiAliasingMode[];
  samples: number;
  passes: number;
  loading: boolean;
}
export function isAntiAliasingMode(value: unknown): value is AntiAliasingMode {
  return antiAliasingModes.some((mode) => mode === value);
}

/** Require exact sample counts for BOTH attachments; never silently turn 2X into 4X. */
export function supportedAntiAliasing(
  colorSamples: readonly number[],
  depthSamples: readonly number[],
  floatTargets: boolean,
): AntiAliasingMode[] {
  return antiAliasingModes.filter((mode) => {
    if (mode === 'smaa') return floatTargets;
    const count = mode === 'msaa2' ? 2 : mode === 'msaa4' ? 4 : 0;
    return (
      count === 0 ||
      (colorSamples.includes(count) && depthSamples.includes(count))
    );
  });
}
export function resolveAntiAliasing(
  requested: AntiAliasingMode,
  supported: readonly AntiAliasingMode[],
): AntiAliasingMode {
  if (supported.includes(requested)) return requested;
  if (requested === 'msaa4' && supported.includes('msaa2')) return 'msaa2';
  return supported.includes('fxaa') ? 'fxaa' : 'off';
}
