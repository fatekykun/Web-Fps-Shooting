import { expect, it } from 'vitest';
import {
  allowedDefault,
  defaultLoadouts,
  parseLoadoutProfile,
} from './loadouts';

it('gives fresh profiles the standard gun skin and operator and the Glacier Fang Knife', () => {
  const profile = defaultLoadouts();
  expect(profile.defaultSlot).toBe(0);
  expect(profile.slots.map(({ weapon }) => weapon)).toEqual([
    'rifle',
    'smg',
    'shotgun',
    'sniper',
  ]);
  for (const slot of profile.slots)
    expect(slot).toMatchObject({
      skin: 'standard',
      operator: 'standard',
      meleeSkin: 'glacier-fang',
    });
});

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
    equipment: {
      weapon: 'smg',
      skin: 'standard',
      operator: 'standard',
      meleeSkin: 'glacier-fang',
    },
  });
});

it('validates operator choices and keeps legacy slots usable', () => {
  const profile = defaultLoadouts();
  profile.slots[0].operator = 'ghost';
  profile.slots[1].operator = 'crimson-officer';
  profile.slots[3] = { weapon: 'sniper', skin: 'lotus-lava' };
  expect(parseLoadoutProfile(profile)).toEqual(profile);
  expect(
    allowedDefault(profile, ['sniper']).equipment.operator,
  ).toBeUndefined();
  expect(
    parseLoadoutProfile({
      ...profile,
      slots: [
        { ...profile.slots[0], operator: 'unknown' },
        ...profile.slots.slice(1),
      ],
    }),
  ).toBeUndefined();
});
