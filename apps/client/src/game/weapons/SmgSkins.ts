export const smgSkins = {
  standard: { name: 'Standard', mythic: false },
  'neon-blade': { name: 'Neon Blade', mythic: true },
} as const;

export type SmgSkin = keyof typeof smgSkins;
export const smgSkinIds = Object.keys(smgSkins) as SmgSkin[];

export function normalizeSmgSkin(value: unknown): SmgSkin {
  return value === 'neon-blade' ? value : 'standard';
}
