import { describe, expect, it } from 'vitest';
import { codePattern, parseInput, parseName } from './protocol';

const input = {
  seq: 1,
  forward: 1,
  right: 0,
  yaw: 0,
  pitch: 0,
  sprint: true,
  jump: false,
  jumpPressed: false,
  slidePressed: false,
  divePressed: false,
};

describe('room protocol validation', () => {
  it('accepts only weapon controls and strips forged shot results, seeds and ammunition', () => {
    const weapon = {
      fire: true,
      firePressed: true,
      aim: false,
      reloadPressed: false,
      switchTo: null,
    };
    expect(
      parseInput({
        ...input,
        life: 1,
        weapon: {
          ...weapon,
          ammo: 999,
          damage: 999,
          seed: 1,
          origin: { x: 20 },
          victim: 'other',
        },
      }),
    ).toEqual({ ...input, life: 1, weapon });
    for (const malformed of [
      { ...weapon, switchTo: 'rocket' },
      { ...weapon, fire: 1 },
      null,
      { ...weapon, aim: NaN },
      { ...weapon, aimPressed: 'true' },
      { ...weapon, aimPressed: null },
    ]) {
      expect(parseInput({ ...input, life: 1, weapon: malformed })).toBeNull();
    }
    expect(parseInput({ ...input, weapon })).toBeNull();
    expect(parseInput({ ...input, life: 0, weapon })).toBeNull();
  });
  it('accepts normalized inputs and strips claimed movement results', () => {
    expect(parseInput({ ...input, x: 100, dt: 10, damage: 100 })).toEqual(
      input,
    );
  });
  it.each([
    { seq: 0 },
    { seq: 1.1 },
    { seq: 2 ** 31 },
    { forward: 10 },
    { right: NaN },
    { yaw: Infinity },
    { pitch: 3 },
    { jump: 'true' },
    { slidePressed: null },
  ])('rejects malformed input %j', (override) => {
    expect(parseInput({ ...input, ...override })).toBeNull();
  });
  it('normalizes names and rejects blank, long or control-character names', () => {
    expect(parseName('  Raven  ')).toBe('Raven');
    for (const name of ['', '  ', 'x'.repeat(21), 'a\nb', null, 12])
      expect(parseName(name)).toBeNull();
  });
  it('uses unambiguous six-character room codes', () => {
    expect(codePattern.test('ABC234')).toBe(true);
    for (const code of ['AB0123', 'ABCDEF7', 'abc234', '../ABC'])
      expect(codePattern.test(code)).toBe(false);
  });
});

it.each([true, false])(
  'preserves the optional fresh ADS press %s',
  (aimPressed) => {
    const weapon = {
      fire: false,
      firePressed: false,
      aim: true,
      aimPressed,
      reloadPressed: false,
      switchTo: null,
    };
    expect(parseInput({ ...input, life: 1, weapon })?.weapon).toEqual(weapon);
  },
);

it('validates the optional auto-reload preference while preserving legacy input and stripping ammo claims', () => {
  const weapon = {
    fire: false,
    firePressed: false,
    aim: false,
    reloadPressed: false,
    switchTo: null,
  };
  for (const autoReload of [true, false]) {
    expect(
      parseInput({
        ...input,
        life: 1,
        weapon: { ...weapon, autoReload, magazine: 999, reserve: 999 },
      })?.weapon,
    ).toEqual({ ...weapon, autoReload });
  }
  expect(parseInput({ ...input, life: 1, weapon })?.weapon).toEqual(weapon);
  for (const autoReload of [null, 'false', 0, {}, []])
    expect(
      parseInput({ ...input, life: 1, weapon: { ...weapon, autoReload } }),
    ).toBeNull();
});
