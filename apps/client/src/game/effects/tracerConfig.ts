export interface TracerStyle {
  opacity: number;
  thickness: number;
  length: number;
  protectedRadius: number;
}
/** Visual tuning only: world meters, opacity 0..1, reticle radius in vertical NDC. */
export const tracerConfig = {
  capacity: 128,
  lifetime: 0.075,
  bridgeLength: 0.65,
  color: 0xd4b78a,
  hip: { opacity: 0.52, thickness: 0.012, length: 5, protectedRadius: 0 },
  ads: { opacity: 0.14, thickness: 0.005, length: 2.5, protectedRadius: 0.035 },
  scope: {
    opacity: 0.08,
    thickness: 0.003,
    length: 1.6,
    protectedRadius: 0.06,
  },
} satisfies {
  capacity: number;
  lifetime: number;
  bridgeLength: number;
  color: number;
  hip: TracerStyle;
  ads: TracerStyle;
  scope: TracerStyle;
};

export function tracerStyle(
  ads: number,
  scoped: boolean,
  out: TracerStyle,
): void {
  const t = Math.max(0, Math.min(1, ads));
  const blend = t * t * (3 - 2 * t),
    target = scoped ? tracerConfig.scope : tracerConfig.ads;
  for (const key of [
    'opacity',
    'thickness',
    'length',
    'protectedRadius',
  ] as const)
    out[key] =
      tracerConfig.hip[key] + (target[key] - tracerConfig.hip[key]) * blend;
}
