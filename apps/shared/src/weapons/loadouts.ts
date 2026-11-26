import type { WeaponId } from '../types/weapons';
import { weaponOrder } from '../config/weapons';
import { isOperator, type OperatorId } from '../combat/operators';

export type SkinRarity = 'Default' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export const skinDefinitions = {
  standard: { name: 'Standard', rarity: 'Default' },
  'cinder-wyrm': { name: 'Molten Lava', rarity: 'Mythic' },
  'memento-mori': {
    name: 'Memento Mori',
    rarity: 'Mythic',
    model: 'memento.glb',
  },
  'neon-blade': {
    name: 'Neon Blade',
    rarity: 'Mythic',
    model: 'neon_legend_smg.glb',
  },
  'glorious-blaze': {
    name: 'Glorious Blaze',
    rarity: 'Mythic',
    model: 'Glorious_Blaze_Shotgun.glb',
  },
  'lotus-lava': {
    name: 'Lotus Lava',
    rarity: 'Mythic',
    model: 'lotus_inferno_v2.glb',
  },
} as const satisfies Record<
  string,
  { name: string; rarity: SkinRarity; model?: string }
>;

export type WeaponSkin = keyof typeof skinDefinitions;
export const weaponSkinIds = {
  rifle: ['standard', 'cinder-wyrm', 'memento-mori'],
  smg: ['standard', 'neon-blade'],
  shotgun: ['standard', 'glorious-blaze'],
  sniper: ['standard', 'lotus-lava'],
} as const satisfies Record<WeaponId, readonly WeaponSkin[]>;

export interface Equipment {
  weapon: WeaponId;
  skin: WeaponSkin;
  operator?: OperatorId;
}
export const loadoutSlots = [0, 1, 2, 3] as const;
export type LoadoutSlot = (typeof loadoutSlots)[number];
export interface LoadoutProfile {
  slots: [Equipment, Equipment, Equipment, Equipment];
  defaultSlot: LoadoutSlot;
}

export function defaultLoadouts(): LoadoutProfile {
  return {
    slots: [
      { weapon: 'rifle', skin: 'memento-mori' },
      { weapon: 'smg', skin: 'neon-blade' },
      { weapon: 'shotgun', skin: 'glorious-blaze' },
      { weapon: 'sniper', skin: 'lotus-lava' },
    ],
    defaultSlot: 0,
  };
}

export function isLoadoutSlot(value: unknown): value is LoadoutSlot {
  return loadoutSlots.some((slot) => slot === value);
}

export function parseEquipment(value: unknown): Equipment | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('weapon' in value) ||
    !('skin' in value)
  )
    return;
  const { weapon, skin, operator } = value as Equipment;
  if (
    !weaponOrder.includes(weapon) ||
    !(weaponSkinIds[weapon] as readonly WeaponSkin[]).includes(skin) ||
    (operator !== undefined && !isOperator(operator))
  )
    return;
  return { weapon, skin, ...(operator === undefined ? {} : { operator }) };
}

export function parseLoadoutProfile(
  value: unknown,
): LoadoutProfile | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('slots' in value) ||
    !('defaultSlot' in value) ||
    !Array.isArray(value.slots) ||
    value.slots.length !== loadoutSlots.length ||
    !isLoadoutSlot(value.defaultSlot)
  )
    return;
  const [first, second, third, fourth] = value.slots.map(parseEquipment);
  if (first && second && third && fourth)
    return {
      slots: [first, second, third, fourth],
      defaultSlot: value.defaultSlot,
    };
  return undefined;
}

/** Keep room restrictions authoritative even when every saved slot is unavailable. */
export function allowedDefault(
  profile: LoadoutProfile,
  allowed: readonly WeaponId[],
): { slot?: LoadoutSlot; equipment: Equipment } {
  const slot = allowed.includes(profile.slots[profile.defaultSlot].weapon)
    ? profile.defaultSlot
    : loadoutSlots.find((index) =>
        allowed.includes(profile.slots[index].weapon),
      );
  if (slot !== undefined) return { slot, equipment: profile.slots[slot] };
  const operator = profile.slots[profile.defaultSlot].operator;
  return {
    equipment: {
      weapon: allowed[0] ?? 'rifle',
      skin: 'standard',
      ...(operator === undefined ? {} : { operator }),
    },
  };
}

export const weaponCategories = {
  rifle: 'Assault Rifle',
  smg: 'Submachine Gun',
  shotgun: 'Shotgun',
  sniper: 'Sniper Rifle',
} satisfies Record<WeaponId, string>;
