export const shotgunSkins = {
  standard: { name: 'Standard', mythic: false },
  'glorious-blaze': { name: 'Glorious Blaze', mythic: true },
} as const;

export type ShotgunSkin = keyof typeof shotgunSkins;
export const shotgunSkinIds = Object.keys(shotgunSkins) as ShotgunSkin[];

export function normalizeShotgunSkin(value: unknown): ShotgunSkin {
  return value === 'glorious-blaze' ? value : 'standard';
}
