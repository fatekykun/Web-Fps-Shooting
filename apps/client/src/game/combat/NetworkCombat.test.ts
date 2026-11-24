import { expect, it } from 'vitest';
import { Scene } from 'three';
import { NetworkCombat } from './NetworkCombat';
import type { OwnerCombat } from '@breakpoint/shared/combat';
const owner: OwnerCombat = {
  life: 1,
  health: 100,
  alive: true,
  respawnIn: 0,
  protected: false,
  selected: 'rifle',
  ammo: {
    rifle: { magazine: 30, reserve: 120 },
    smg: { magazine: 35, reserve: 140 },
    shotgun: { magazine: 8, reserve: 40 },
    sniper: { magazine: 5, reserve: 20 },
  },
  reloading: false,
  equipping: false,
  reloadProgress: 0,
  cycling: false,
  cycleProgress: 0,
  ads: 0,
  spread: 0.02,
  shots: 0,
  hitSequence: 0,
  lastDamage: 0,
  critical: false,
  damageSequence: 0,
};
it('keeps predicted weapon animation separate from authoritative ammo, health and hit markers', () => {
  const combat = new NetworkCombat(
    new Scene(),
    () => {},
    () => {},
  );
  try {
    combat.receive(owner);
    combat.weapons.step(
      1 / 60,
      {
        fire: true,
        firePressed: true,
        aim: false,
        reloadPressed: false,
        switchTo: null,
      },
      { speed: 0, grounded: true, verticalSpeed: 0 },
    );
    expect(combat.weapons.shotsFired).toBe(1);
    expect(combat.snapshot()).toMatchObject({
      magazine: 30,
      shots: 0,
      hitSequence: 0,
      lastDamage: 0,
    });
    expect(combat.snapshot().player?.health).toBe(100);
    combat.receive({
      ...owner,
      health: 55,
      hitSequence: 1,
      lastDamage: 45,
      critical: true,
      shots: 1,
      ammo: { ...owner.ammo, rifle: { magazine: 29, reserve: 120 } },
    });
    expect(combat.snapshot()).toMatchObject({
      magazine: 29,
      hitSequence: 1,
      lastDamage: 45,
      critical: true,
    });
    expect(combat.snapshot().player?.health).toBe(55);
  } finally {
    combat.dispose();
  }
});
it('resets cosmetic weapon state on a new life and ignores older life snapshots', () => {
  let cleared = 0;
  const combat = new NetworkCombat(
    new Scene(),
    () => {},
    () => {
      cleared++;
    },
  );
  try {
    combat.receive(owner);
    combat.weapons.recoil.kick(combat.weapons.config.recoil, 0, 0);
    combat.weapons.recoil.step(1 / 60);
    expect(combat.weapons.recoil.pitch).toBeGreaterThan(0);
    combat.receive({ ...owner, life: 2 });
    expect(cleared).toBe(2);
    expect(combat.weapons.recoil.pitch).toBe(0);
    combat.receive({ ...owner, alive: false });
    expect(combat.owner?.alive).toBe(true);
    expect(combat.owner?.life).toBe(2);
  } finally {
    combat.dispose();
  }
});

it('clears pooled online effects when leaving the room', () => {
  const scene = new Scene();
  const combat = new NetworkCombat(
    scene,
    () => {},
    () => {},
  );
  try {
    combat.shot({
      id: 1,
      shooter: 'other',
      weapon: 'rifle',
      origin: { x: 0, y: 1, z: 0 },
      traces: [{ end: { x: 0, y: 1, z: -5 }, normal: { x: 0, y: 0, z: 1 } }],
    });
    expect(scene.children.some((object) => object.visible)).toBe(true);
    combat.reset();
    expect(
      scene.children.every(
        (object) =>
          !object.visible || ('count' in object && object.count === 0),
      ),
    ).toBe(true);
  } finally {
    combat.dispose();
  }
});

it('accepts each server shot once, bounds duplicate tracking and never produces predicted tracers', () => {
  const scene = new Scene(),
    combat = new NetworkCombat(
      scene,
      () => {},
      () => {},
    );
  const shot = {
    id: 1,
    shooter: 'other',
    weapon: 'rifle' as const,
    origin: { x: 0, y: 1, z: 0 },
    traces: [],
  };
  try {
    expect(scene.getObjectByName('bullet-trails')).toBeUndefined();
    expect(combat.shot(shot)).toBe(true);
    expect(combat.shot(shot)).toBe(false);
    for (let id = 2; id <= 140; id++)
      expect(combat.shot({ ...shot, id })).toBe(true);
    expect(combat.shot({ ...shot, id: 140 })).toBe(false);
    combat.reset();
    expect(combat.shot(shot)).toBe(true);
  } finally {
    combat.dispose();
  }
});

it.each(['fire', 'aim'] as const)(
  'follows server reload completion and preserves predicted %s interruption against old reload snapshots',
  (action) => {
    const combat = new NetworkCombat(
      new Scene(),
      () => {},
      () => {},
    );
    const context = { speed: 0, grounded: true, verticalSpeed: 0 };
    const input = {
      fire: false,
      firePressed: false,
      aim: false,
      reloadPressed: false,
      switchTo: null,
    };
    const partial = {
      ...owner,
      ammo: { ...owner.ammo, rifle: { magazine: 27, reserve: 120 } },
    };
    try {
      combat.receive(partial);
      combat.weapons.reload();
      combat.receive({ ...partial, reloading: true, reloadProgress: 0.4 });
      expect(combat.weapons.reloadProgress).toBeCloseTo(0.4);
      combat.weapons.step(
        1 / 60,
        action === 'fire'
          ? { ...input, fire: true, firePressed: true }
          : { ...input, aim: true, aimPressed: true },
        context,
      );
      expect(combat.weapons.reloading).toBe(false);
      combat.receive({ ...partial, reloading: true, reloadProgress: 0.45 });
      expect(combat.weapons.reloading).toBe(false);
      combat.receive({
        ...partial,
        ammo: {
          ...partial.ammo,
          rifle: { magazine: action === 'fire' ? 26 : 27, reserve: 120 },
        },
        shots: action === 'fire' ? 1 : 0,
      });
      expect(combat.weapons.reloading).toBe(false);
      combat.weapons.reload();
      combat.receive({ ...partial, reloading: true, reloadProgress: 0.7 });
      expect(combat.weapons.reloading).toBe(true);
      combat.receive({
        ...owner,
        ammo: { ...owner.ammo, rifle: { magazine: 30, reserve: 117 } },
      });
      expect(combat.weapons.reloading).toBe(false);
      expect(combat.weapons.current).toMatchObject({
        magazine: 30,
        reserve: 117,
      });
    } finally {
      combat.dispose();
    }
  },
);

it('initializes a restricted authoritative spawn and filters forbidden keys without changing valid controls', () => {
  const combat = new NetworkCombat(
    new Scene(),
    () => {},
    () => {},
  );
  try {
    combat.setAllowedWeapons(['shotgun', 'sniper']);
    combat.receive({ ...owner, selected: 'sniper' });
    expect(combat.weapons.selected).toBe('sniper');
    const forbidden = {
      fire: true,
      firePressed: true,
      aim: true,
      reloadPressed: false,
      switchTo: 'rifle' as const,
    };
    expect(combat.filterInput(forbidden)).toEqual({
      ...forbidden,
      switchTo: null,
    });
    expect(forbidden.switchTo).toBe('rifle');
    expect(
      combat.filterInput({ ...forbidden, switchTo: 'shotgun' }).switchTo,
    ).toBe('shotgun');
    expect(combat.snapshot().allowedWeapons).toEqual(['shotgun', 'sniper']);
    combat.receive({ ...owner, life: 2, selected: 'shotgun' });
    expect(combat.weapons.selected).toBe('shotgun');
    combat.reset();
    expect(combat.allowedWeapons).toEqual([
      'rifle',
      'smg',
      'shotgun',
      'sniper',
    ]);
    expect(combat.filterInput(forbidden)).toBe(forbidden);
  } finally {
    combat.dispose();
  }
});
