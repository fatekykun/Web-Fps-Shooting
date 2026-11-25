import type { WeaponId } from '@breakpoint/shared';

export const rifleSkins = {
  standard: { name: 'Standard', mythic: false },
  'cinder-wyrm': { name: 'Molten Lava', mythic: true },
  'memento-mori': { name: 'Memento Mori', mythic: true },
} as const;

export type RifleSkin = keyof typeof rifleSkins;
export type RifleSkinStatus = 'loading' | 'ready' | 'unavailable';

export const rifleSkinIds = Object.keys(rifleSkins) as RifleSkin[];

export function normalizeRifleSkin(value: unknown): RifleSkin {
  return typeof value === 'string' && Object.hasOwn(rifleSkins, value)
    ? (value as RifleSkin)
    : 'standard';
}

export const isMoltenLavaRifle = (
  weapon: WeaponId,
  skin?: RifleSkin,
): boolean => weapon === 'rifle' && skin === 'cinder-wyrm';

export const cinderTuning = Object.freeze({
  coreBrightness: 1.1,
  fragmentSpeed: 1.4,
  particleIntensity: 0.75,
  reticleColor: 0xffa43e,
  animationSpeed: 1,
  inspectSeconds: 2.2,
});
