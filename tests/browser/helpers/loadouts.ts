import {
  defaultLoadouts,
  type LoadoutSlot,
  type WeaponSkin,
} from '@breakpoint/shared/weapons/loadouts';

export function loadoutsWithSkin(slot: LoadoutSlot, skin: WeaponSkin) {
  const profile = defaultLoadouts();
  profile.slots[slot].skin = skin;
  return profile;
}
