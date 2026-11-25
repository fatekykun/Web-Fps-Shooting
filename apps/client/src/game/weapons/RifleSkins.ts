export const rifleSkins = {
  standard: { name: 'Standard' },
  'cinder-wyrm': { name: 'Cinder Wyrm' },
} as const;

export type RifleSkin = keyof typeof rifleSkins;

export const cinderTuning = Object.freeze({
  coreBrightness: 1.1,
  fragmentSpeed: 1.4,
  particleIntensity: 0.75,
  reticleColor: 0xffa43e,
  animationSpeed: 1,
  inspectSeconds: 2.2,
});
