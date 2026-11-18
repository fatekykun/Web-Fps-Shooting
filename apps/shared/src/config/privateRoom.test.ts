import { expect, it } from 'vitest';
import {
  matchDefaults,
  parseMatchSettings,
  parsePrivateRoomSettings,
  playerLimits,
} from './match';

it('preserves legacy unrestricted eight-player settings without changing the base match parser', () => {
  expect(parsePrivateRoomSettings(matchDefaults.ffa)).toEqual({
    ...matchDefaults.ffa,
    playerLimit: 8,
  });
  expect(
    parseMatchSettings({
      ...matchDefaults.tdm,
      playerLimit: 2,
      allowedWeapons: ['sniper'],
    }),
  ).toEqual(matchDefaults.tdm);
});
it.each([['sniper'], ['shotgun'], ['sniper', 'shotgun'], ['rifle', 'smg']])(
  'accepts a custom loadout %j and each supported capacity',
  (...weapons) => {
    // Vitest expands table rows as arguments; copy into a plain wire array.
    for (const playerLimit of playerLimits) {
      const settings = parsePrivateRoomSettings({
        ...matchDefaults.ffa,
        playerLimit,
        allowedWeapons: weapons,
      });
      expect(settings?.playerLimit).toBe(playerLimit);
      expect(settings?.allowedWeapons).toHaveLength(weapons.length);
      expect(new Set(settings?.allowedWeapons)).toEqual(new Set(weapons));
    }
  },
);
it('rejects empty, duplicate, unknown or excessive custom categories and malformed capacities', () => {
  for (const allowedWeapons of [
    [],
    ['sniper', 'sniper'],
    ['rifle', 'smg', 'sniper'],
    ['knife'],
    ['Sniper'],
    ['sniper', null],
    null,
    'sniper',
    1,
    new Array(1),
  ])
    expect(
      parsePrivateRoomSettings({ ...matchDefaults.ffa, allowedWeapons }),
    ).toBeNull();
  for (const playerLimit of [
    0,
    1,
    3,
    5,
    7,
    9,
    2.5,
    '2',
    true,
    null,
    NaN,
    Infinity,
  ])
    expect(
      parsePrivateRoomSettings({ ...matchDefaults.ffa, playerLimit }),
    ).toBeNull();
});
it('copies and canonically orders allowed weapons without mutating the request or retaining claims', () => {
  const allowedWeapons = ['sniper', 'shotgun'];
  const result = parsePrivateRoomSettings({
    ...matchDefaults.ffa,
    allowedWeapons,
    playerLimit: 4,
    hostId: 'fake',
    maxClients: 100,
  });
  expect(result).toEqual({
    ...matchDefaults.ffa,
    playerLimit: 4,
    allowedWeapons: ['shotgun', 'sniper'],
  });
  expect(allowedWeapons).toEqual(['sniper', 'shotgun']);
  allowedWeapons[0] = 'rifle';
  expect(result!.allowedWeapons).toEqual(['shotgun', 'sniper']);
});
