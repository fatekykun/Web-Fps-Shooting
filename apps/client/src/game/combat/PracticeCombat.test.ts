import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Scene } from 'three';
import type { WeaponInput } from '@breakpoint/shared';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { MovementController } from '../movement/MovementController';
import { arenaBoxes, spawn } from '../maps/arenaLayout';
import { PracticeCombat } from './PracticeCombat';

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
  function step(count: number, input = idle, pitch = 0) {
    for (let i = 0; i < count; i++) {
      movement.step({ forward: 0, right: 0, yaw: 0 }, dt);
      combat.step(dt, input, movement, 0, pitch);
    }
  }

  it('hits body/head sensors, excludes the player and respects range', () => {
    setup();
    const body = physics.castBullet(
      { x: 0, y: 1.56, z: 12 },
      { x: 0, y: 0, z: -1 },
      80,
    )!;
    expect(combat.dummy.region(body.colliderHandle)).toBe('body');
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
    combat.weapons.recoil.pitch = 0;
    combat.weapons.recoil.yaw = 0;
    step(1, { ...idle, firePressed: true }, 0.018);
    expect(combat.critical).toBe(true);
    expect(combat.lastDamage).toBe(45);
    expect(combat.dummy.health).toBe(30);
  });

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
    expect(physics.position.z).toBeLessThan(-10.5);
    expect(physics.position.z).toBeGreaterThan(-10.7);
  });
});
