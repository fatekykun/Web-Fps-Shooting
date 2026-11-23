import { beforeAll, expect, it } from 'vitest';
import { movementConfig } from '../config/movement';
import { MovementController } from '../movement/MovementController';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { arenas } from './arenas';

const yard = arenas.shipment;
beforeAll(initializePhysics);

it('has clearance for eight spawn slots and mirrored north and south teams', () => {
  expect(yard.size).toBe(36);
  expect(yard.wallHeight).toBe(5);
  expect(yard.spawns.none).toHaveLength(8);
  expect(yard.spawns.blue).toHaveLength(4);
  expect(yard.spawns.orange).toHaveLength(4);
  for (const point of yard.spawns.none) {
    const world = new PhysicsWorld(yard.colliders, point);
    try {
      expect(world.canOccupy(movementConfig.capsuleHalfHeight)).toBe(true);
      expect(point.yaw).toBe(point.z < 0 ? Math.PI : 0);
      const direction = { x: 0, y: 0, z: -Math.cos(point.yaw) };
      expect(world.castBullet(point, direction, 2)).toBeNull();
    } finally {
      world.dispose();
    }
  }
});

it('blocks capsules and shots at both levels of a stack and closes the perimeter corners', () => {
  const start = { x: -1.5, y: 0.91, z: 0 };
  const world = new PhysicsWorld(yard.colliders, start);
  try {
    for (const y of [1.6, 4.2]) {
      const hit = world.castBullet({ ...start, y }, { x: 0, y: 0, z: -1 }, 30);
      expect(hit?.point.z).toBeCloseTo(-2.1, 3);
    }
    for (let i = 0; i < 40; i++) world.move({ x: 0, y: -0.01, z: -0.15 });
    expect(world.position.z).toBeGreaterThan(
      -2.1 + movementConfig.capsuleRadius,
    );
    world.restore(
      { x: 16.9, y: 0.91, z: 16.9 },
      movementConfig.capsuleHalfHeight,
      false,
    );
    for (let i = 0; i < 40; i++) world.move({ x: 0.15, y: -0.01, z: 0.15 });
    expect(world.position.x).toBeLessThan(18);
    expect(world.position.z).toBeLessThan(18);
  } finally {
    world.dispose();
  }
});

it.each([-11.2, 11.2])(
  'supports sprint, slide, jump and crouch through the flank at x=%s',
  (x) => {
    const world = new PhysicsWorld(yard.colliders, { x, y: 0.91, z: 13 });
    try {
      const movement = new MovementController(world);
      const step = (extra = {}) =>
        movement.step(
          { right: 0, forward: 1, yaw: 0, sprint: true, ...extra },
          movementConfig.fixedStep,
        );
      for (let i = 0; i < 30; i++) step();
      expect(movement.state).toBe('sprinting');
      step({ slidePressed: true });
      expect(movement.state).toBe('sliding');
      step({ jumpPressed: true });
      expect(movement.state).toBe('airborne');
      for (let i = 0; i < 110; i++) step();
      expect(world.position.z).toBeLessThan(-5);
      step({ forward: 0, sprint: false, slidePressed: true });
      expect(movement.state).toBe('crouching');
    } finally {
      world.dispose();
    }
  },
);
