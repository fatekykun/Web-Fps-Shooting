import { expect, it } from 'vitest';
import { readInviteCode, roomInviteUrl } from './invites';

it('opens only valid room codes and shares a clean URL without unrelated query data', () => {
  expect(readInviteCode('https://game.example/?room=abc234')).toBe('ABC234');
  for (const url of [
    'not-a-url',
    'https://game.example',
    'https://game.example/?room=<script>',
    'https://game.example/?room=ABC000',
  ])
    expect(readInviteCode(url)).toBe('');
  expect(
    roomInviteUrl(
      'https://game.example/?debug=1&room=OLD234#settings',
      'ABC234',
    ),
  ).toBe('https://game.example/?room=ABC234');
  expect(() => roomInviteUrl('https://game.example', 'bad')).toThrow();
});
