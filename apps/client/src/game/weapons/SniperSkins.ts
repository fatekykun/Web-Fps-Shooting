export const sniperSkins = {
  standard: { name: 'Standard', mythic: false },
  'lotus-lava': { name: 'Lotus Lava', mythic: true },
} as const;

export type SniperSkin = keyof typeof sniperSkins;
export const sniperSkinIds = Object.keys(sniperSkins) as SniperSkin[];

export function normalizeSniperSkin(value: unknown): SniperSkin {
  return value === 'lotus-lava' ? value : 'standard';
}
