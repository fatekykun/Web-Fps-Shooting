import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { movementConfig } from '@breakpoint/shared';
import { arenaBoxes, spawn } from '../maps/arenaLayout';
import { MovementController } from '../movement/MovementController';
import { initializePhysics, PhysicsWorld } from './PhysicsWorld';

describe('Rapier capsule integration', () => {
  let world: PhysicsWorld | undefined;
  beforeAll(initializePhysics);
  afterEach(() => {
    world?.dispose();
    world = undefined;
  });

  function makePlayer() {
    world = new PhysicsWorld(arenaBoxes, spawn);
    return new MovementController(world);
  }

  it('settles on the floor without sinking or drifting', () => {
    const player = makePlayer();
    for (let i = 0; i < 600; i++)
      player.step({ forward: 0, right: 0, yaw: 0 }, movementConfig.fixedStep);
    expect(world!.grounded).toBe(true);
    expect(world!.position.y).toBeGreaterThan(0.87);
    expect(world!.position.y).toBeLessThan(0.92);
    expect(world!.position.z).toBeCloseTo(spawn.z);
  });

  it('stops against center cover at walking speed', () => {
    const player = makePlayer();
    for (let i = 0; i < 600; i++)
      player.step({ forward: 1, right: 0, yaw: 0 }, movementConfig.fixedStep);
    expect(world!.position.z).toBeGreaterThan(-10.7);
    expect(world!.position.z).toBeLessThan(-10.5);
    expect(Math.abs(player.velocity.z)).toBeLessThan(0.01);
  });

  it('reaches the configured walking speed on open ground', () => {
    const player = makePlayer();
    for (let i = 0; i < 60; i++)
      player.step({ forward: 0, right: 1, yaw: 0 }, movementConfig.fixedStep);
    expect(Math.hypot(player.velocity.x, player.velocity.z)).toBeCloseTo(
      movementConfig.walkSpeed,
      1,
    );
  });

  it('slides along a boundary and cannot tunnel through it', () => {
    const player = makePlayer();
    for (let i = 0; i < 360; i++)
      player.step({ forward: 0, right: 1, yaw: 0 }, movementConfig.fixedStep);
    expect(world!.position.x).toBeGreaterThan(19);
    expect(world!.position.x).toBeLessThan(19.2);
    const beforeZ = world!.position.z;
    for (let i = 0; i < 60; i++)
      player.step({ forward: 1, right: 1, yaw: 0 }, movementConfig.fixedStep);
    expect(world!.position.x).toBeLessThan(19.2);
    expect(world!.position.z).toBeLessThan(beforeZ - 2);
    world!.move({ x: 100, y: 0, z: 0 });
    expect(world!.position.x).toBeLessThan(19.2);
  });

  it('can explicitly stop momentum without changing position', () => {
    const player = makePlayer();
    for (let i = 0; i < 30; i++)
      player.step({ forward: 1, right: 0, yaw: 0 }, movementConfig.fixedStep);
    const position = { ...world!.position };
    player.stop();
    expect(player.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(world!.position).toEqual(position);
    expect(player.previousPosition).toEqual(position);
  });
});
