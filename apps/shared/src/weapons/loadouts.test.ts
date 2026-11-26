import { expect, it } from 'vitest';
import {
  allowedDefault,
  defaultLoadouts,
  parseLoadoutProfile,
} from './loadouts';

it('allows duplicate weapon categories with independently validated skins', () => {
  const profile = defaultLoadouts();
  profile.slots[1] = { weapon: 'rifle', skin: 'cinder-wyrm' };
  const received = parseLoadoutProfile({
    ...profile,
    slots: profile.slots.map((slot) => ({ ...slot, damage: 999 })),
  });
  expect(received).toEqual(profile);
  expect(received?.slots[0]).not.toBe(profile.slots[0]);
  expect(
    parseLoadoutProfile({ ...profile, slots: profile.slots.slice(1) }),
  ).toBeUndefined();
  expect(parseLoadoutProfile({ ...profile, defaultSlot: 4 })).toBeUndefined();
  expect(
    parseLoadoutProfile({
      ...profile,
      slots: [
        { weapon: 'rifle', skin: 'neon-blade' },
        ...profile.slots.slice(1),
      ],
    }),
  ).toBeUndefined();
});

it('selects the saved default, an eligible slot, or the room fallback', () => {
  const profile = defaultLoadouts();
  profile.defaultSlot = 3;
  expect(allowedDefault(profile, ['rifle', 'sniper'])).toEqual({
    slot: 3,
    equipment: profile.slots[3],
  });
  expect(allowedDefault(profile, ['smg'])).toEqual({
    slot: 1,
    equipment: profile.slots[1],
  });
  profile.slots[1] = profile.slots[0];
  expect(allowedDefault(profile, ['smg'])).toEqual({
    equipment: { weapon: 'smg', skin: 'standard' },
  });
});
