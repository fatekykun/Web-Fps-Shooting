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
    combat.weapons.recoil.pitch = 1;
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

it('follows server reload completion without spending reserves and preserves predicted interruption against old reload snapshots', () => {
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
      { ...input, fire: true, firePressed: true },
      context,
    );
    expect(combat.weapons.reloading).toBe(false);
    combat.receive({ ...partial, reloading: true, reloadProgress: 0.45 });
    expect(combat.weapons.reloading).toBe(false);
    combat.receive({
      ...partial,
      ammo: { ...partial.ammo, rifle: { magazine: 26, reserve: 120 } },
      shots: 1,
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
});
