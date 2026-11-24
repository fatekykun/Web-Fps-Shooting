import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import {
  movementConfig,
  weaponConfigs,
  type WeaponInput,
} from '@breakpoint/shared';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { MovementController } from '../movement/MovementController';
import { arenaBoxes, spawn } from '../maps/arenaLayout';
import { PracticeCombat } from './PracticeCombat';
import { avatarParts } from '@breakpoint/shared/avatar';

const idle: WeaponInput = {
  fire: false,
  aim: true,
  firePressed: false,
  reloadPressed: false,
  switchTo: null,
};
const dt = 1 / 60;

describe('local hitscan against Rapier world and target', () => {
  let physics: PhysicsWorld;
  let combat: PracticeCombat;
  let movement: MovementController;
  beforeAll(initializePhysics);
  afterEach(() => {
    combat.dispose();
    physics.dispose();
  });
  function setup(covered = false) {
    const cover = {
      position: [0, 1, -2] as const,
      size: [3, 2, 1] as const,
      color: 0,
    };
    physics = new PhysicsWorld(
      covered ? [...arenaBoxes, cover] : arenaBoxes,
      spawn,
    );
    movement = new MovementController(physics);
    combat = new PracticeCombat(physics, new Scene(), () => {});
    for (let i = 0; i < 10; i++)
      movement.step({ forward: 0, right: 0, yaw: 0 }, dt);
    combat.weapons.ads = 1;
  }
  function step(count: number, input = idle, pitch = 0, yaw = 0) {
    for (let i = 0; i < count; i++) {
      movement.step({ forward: 0, right: 0, yaw: 0 }, dt);
      combat.step(dt, input, movement, yaw, pitch);
    }
  }

  it('hits body/head sensors, excludes the player and respects range', () => {
    setup();
    const body = physics.castBullet(
      { x: 0, y: 1.56, z: 12 },
      { x: 0, y: 0, z: -1 },
      80,
    )!;
    expect(combat.dummy.region(body.colliderHandle)).toBe('upperTorso');
    expect(body.distance).toBeCloseTo(17.83, 1);
    const head = physics.castBullet(
      { x: 0, y: 1.9, z: 12 },
      { x: 0, y: 0, z: -1 },
      80,
    )!;
    expect(combat.dummy.region(head.colliderHandle)).toBe('head');
    expect(
      physics.castBullet({ x: 0, y: 1.56, z: 12 }, { x: 0, y: 0, z: -1 }, 5),
    ).toBeNull();
  });

  it('deals local body damage and registers a headshot multiplier', () => {
    setup();
    step(1, { ...idle, firePressed: true });
    expect(combat.dummy.health).toBe(75);
    expect(combat.hitSequence).toBe(1);
    step(10);
    combat.weapons.recoil.reset();
    step(1, { ...idle, firePressed: true }, 0.018);
    expect(combat.critical).toBe(true);
    expect(combat.lastDamage).toBe(45);
    expect(combat.dummy.health).toBe(30);
  });

  it.each(avatarParts.filter((part) => part.region !== null))(
    'gives the hologram a dedicated $region sensor matching its rendered part',
    (part) => {
      setup();
      const hit = physics.castBullet(
        {
          x: part.position[0] * 1.25,
          y: part.position[1] * 1.25 + 0.05,
          z: 12,
        },
        { x: 0, y: 0, z: -1 },
        80,
      )!;
      expect(combat.dummy.region(hit.colliderHandle)).toBe(part.region);
    },
  );

  it('applies actual SMG range falloff in training without rounding internal damage', () => {
    setup();
    combat.weapons.selected = 'smg';
    step(1, { ...idle, firePressed: true });
    expect(combat.hitSequence).toBe(1);
    expect(combat.lastDamage).toBeGreaterThan(14);
    expect(combat.lastDamage).toBeLessThan(17);
    expect(Number.isInteger(combat.lastDamage)).toBe(false);
    expect(combat.dummy.health).toBeCloseTo(100 - combat.lastDamage, 10);
  });

  it.each(avatarParts.filter((part) => part.region !== null))(
    'registers actual scoped sniper damage on the hologram $region from the player eye',
    (part) => {
      setup();
      combat.weapons.selected = 'sniper';
      const x = part.position[0] * 1.25;
      const y = part.position[1] * 1.25 + 0.05;
      const distanceZ = physics.position.z - (part.position[2] * 1.25 - 6);
      const pitch = Math.atan2(
        y - physics.position.y - movement.eyeOffset,
        Math.hypot(x, distanceZ),
      );
      step(1, { ...idle, firePressed: true }, pitch, -Math.atan2(x, distanceZ));
      const expected =
        weaponConfigs.sniper.damage *
        weaponConfigs.sniper.bodyMultipliers[part.region!];
      expect(combat.hitSequence, part.region!).toBe(1);
      expect(combat.lastDamage).toBeCloseTo(Math.min(100, expected));
      expect(combat.dummy.health).toBeCloseTo(Math.max(0, 100 - expected));
    },
  );

  it('stops shots at cover before the target', () => {
    setup(true);
    step(1, { ...idle, firePressed: true });
    expect(combat.weapons.shotsFired).toBe(1);
    expect(combat.dummy.health).toBe(100);
    expect(combat.hitSequence).toBe(0);
  });

  it('disables a downed target and resets it after the training cooldown', () => {
    setup();
    combat.dummy.damage(100);
    expect(combat.dummy.resetting).toBe(true);
    step(1);
    const hit = physics.castBullet(
      { x: 0, y: 1.56, z: 12 },
      { x: 0, y: 0, z: -1 },
      80,
    )!;
    expect(combat.dummy.region(hit.colliderHandle)).toBeNull();
    step(121);
    expect(combat.dummy.health).toBe(100);
    expect(combat.dummy.resetting).toBe(false);
  });

  it('allows the movement course to pass through holographic sensors', () => {
    setup();
    for (let i = 0; i < 400; i++)
      movement.step({ forward: 1, right: 0, yaw: 0 }, dt);
    const cover = arenaBoxes.find(
      (box) => box.kind === 'crate' && box.position[0] === 0,
    )!;
    expect(physics.position.z).toBeCloseTo(
      cover.position[2] +
        cover.size[2] / 2 +
        movementConfig.capsuleRadius +
        movementConfig.collisionOffset,
      2,
    );
  });
});
