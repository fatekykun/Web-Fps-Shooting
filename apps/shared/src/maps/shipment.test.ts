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

it('blocks capsules and shots at all three levels of the tall stack and closes the perimeter corners', () => {
  const start = { x: -1.5, y: 0.91, z: 0 };
  const world = new PhysicsWorld(yard.colliders, start);
  try {
    for (const y of [1.6, 4.2, 6.8]) {
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

it('walks through the west tunnel on metal and blocks shots at its sides and roof', () => {
  const world = new PhysicsWorld(yard.colliders, {
    x: -14.35,
    y: 0.91,
    z: 2.9,
  });
  try {
    expect(
      world.castBullet(
        { x: -14.35, y: 1.6, z: 2.9 },
        { x: 0, y: 0, z: -1 },
        8.8,
      ),
    ).toBeNull();
    expect(
      world.castBullet({ x: -14.35, y: 1.6, z: -1.5 }, { x: 1, y: 0, z: 0 }, 3)
        ?.point.x,
    ).toBeCloseTo(-13.23, 2);
    expect(
      world.castBullet({ x: -14.35, y: 1.6, z: -1.5 }, { x: 0, y: 1, z: 0 }, 3)
        ?.point.y,
    ).toBeCloseTo(2.52, 2);
    const movement = new MovementController(world);
    const step = () =>
      movement.step({ forward: 1, right: 0, yaw: 0 }, movementConfig.fixedStep);
    for (let i = 0; i < 48; i++) step();
    expect(world.position.z).toBeLessThan(0);
    expect(world.grounded).toBe(true);
    expect(world.groundSurface()).toBe('metal');
    for (let i = 0; i < 70; i++) step();
    expect(world.position.z).toBeLessThan(-5.1);
    expect(world.groundSurface()).toBe('concrete');
  } finally {
    world.dispose();
  }
});

it('keeps the east storage bay open at the front, closed at the rear, and the forklift solid', () => {
  const world = new PhysicsWorld(yard.colliders, {
    x: 14.28,
    y: 0.91,
    z: 5.12,
  });
  try {
    const across = { x: 0, y: 0, z: 1 };
    expect(
      world.castBullet({ x: 14.28, y: 1.4, z: 5.12 }, across, 8)?.point.z,
    ).toBeCloseTo(12.32, 2);
    for (let i = 0; i < 47; i++) world.move({ x: 0, y: -0.025, z: 0.075 });
    expect(world.position.z).toBeGreaterThan(8.4);
    expect(world.groundSurface()).toBe('metal');
    expect(
      world.castBullet({ x: 14.25, y: 0.7, z: -16.2 }, across, 3)?.point.z,
    ).toBeLessThan(-13.7);
  } finally {
    world.dispose();
  }
});

it('preserves valid smart-spawn candidates and a center-to-west crossover', () => {
  const world = new PhysicsWorld(yard.colliders, { x: 0, y: 0.91, z: -9.35 });
  try {
    for (const point of yard.respawns.candidates)
      expect(
        world.canSpawnAt(point),
        `${point.zone} at ${point.x}, ${point.z}`,
      ).toBe(true);
    for (const [x, z] of [
      [0, -5.43],
      [2.62, -5.43],
      [2.62, 8.65],
      [-10.33, 8.65],
    ] as const) {
      for (let frame = 0; frame < 190; frame++) {
        const dx = x - world.position.x,
          dz = z - world.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= 0.07) break;
        const dt = Math.min(1, 0.082 / distance);
        world.move({ x: dx * dt, y: -0.024, z: dz * dt });
      }
      expect(
        Math.hypot(x - world.position.x, z - world.position.z),
        `yard waypoint ${x}, ${z}`,
      ).toBeLessThan(0.11);
    }
  } finally {
    world.dispose();
  }
});
