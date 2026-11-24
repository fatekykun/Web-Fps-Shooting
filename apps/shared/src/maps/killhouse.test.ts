import { beforeAll, expect, it } from 'vitest';
import { movementConfig } from '../config/movement';
import { MovementController } from '../movement/MovementController';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { arenas } from './arenas';

const house = arenas.killhouse;
beforeAll(initializePhysics);

it('keeps eight clear elevated spawns inside a 42 by 36 by 9 metre warehouse', () => {
  expect([house.width, house.depth, house.height]).toEqual([42, 36, 9]);
  expect(house.spawns.none).toHaveLength(8);
  for (const point of house.spawns.none) {
    const world = new PhysicsWorld(house.colliders, point);
    try {
      expect(world.canOccupy(movementConfig.capsuleHalfHeight)).toBe(true);
      for (let i = 0; i < 8; i++) world.move({ x: 0, y: -0.035, z: 0 });
      expect(world.grounded).toBe(true);
      expect(world.position.y).toBeCloseTo(house.deckHeight + 0.885, 2);
      expect(point.yaw).toBe(point.z < 0 ? Math.PI : 0);
    } finally {
      world.dispose();
    }
  }
});

it.each(house.stairs.map((stair, index) => ({ stair, index })))(
  'walks up and down staircase $index without a jump',
  ({ stair }) => {
    const [x, , z] = stair.position;
    const [, rise, run] = stair.size;
    const yaw = stair.yaw ?? 0;
    const direction = Math.cos(yaw);
    const landing = z + direction * (run / 2 + 0.65);
    const world = new PhysicsWorld(house.colliders, { x, y: 0.91, z: landing });
    try {
      const movement = new MovementController(world);
      const travel = (angle: number, until: () => boolean) => {
        for (let frame = 0; frame < 180 && !until(); frame++)
          movement.step(
            { forward: 1, right: 0, yaw: angle },
            movementConfig.fixedStep,
          );
        expect(until(), `stuck at ${JSON.stringify(world.position)}`).toBe(
          true,
        );
      };
      travel(yaw, () => (z - world.position.z) * direction > run / 2 + 0.5);
      expect(world.position.y).toBeCloseTo(rise + 0.885, 1);
      travel(
        yaw + Math.PI,
        () => (world.position.z - landing) * direction > 0.3,
      );
      expect(world.position.y).toBeCloseTo(0.885, 1);
    } finally {
      world.dispose();
    }
  },
);

it.each([-18.6, 18.6])(
  'runs the outer flank at x=%s and stops at the warehouse corner',
  (x) => {
    const world = new PhysicsWorld(house.colliders, { x, y: 0.91, z: 13.5 });
    try {
      const movement = new MovementController(world);
      for (let frame = 0; frame < 230; frame++)
        movement.step(
          { forward: 1, right: 0, yaw: 0, sprint: true },
          movementConfig.fixedStep,
        );
      expect(world.position.z).toBeLessThan(-13);
      for (let frame = 0; frame < 40; frame++)
        world.move({ x: Math.sign(x) * 0.15, y: -0.01, z: -0.15 });
      expect(Math.abs(world.position.x)).toBeLessThan(21);
      expect(world.position.z).toBeGreaterThan(-18);
    } finally {
      world.dispose();
    }
  },
);

it('blocks shots at cover and the roof while leaving a crossover beneath the tower open', () => {
  const world = new PhysicsWorld(house.colliders, { x: 18, y: 0.91, z: 13 });
  try {
    const across = { x: 1, y: 0, z: 0 };
    expect(world.castBullet({ x: -5.5, y: 1.6, z: 0 }, across, 11)).toBeNull();
    expect(
      world.castBullet(
        { x: -5.5, y: house.towerHeight + 0.19, z: 0 },
        across,
        11,
      )?.point.x,
    ).toBeCloseTo(-2.9, 2);
    const brace = world.castBullet(
      { x: 0, y: house.towerHeight * 0.48, z: 0 },
      { x: 0, y: 0, z: -1 },
      3,
    );
    expect(brace?.point.z).toBeGreaterThan(-2.37);
    expect(brace?.point.z).toBeLessThan(-2);
    const forward = { x: 0, y: 0, z: 1 };
    expect(
      world.castBullet({ x: 6.8, y: 0.65, z: 6 }, forward, 4)?.point.z,
    ).toBeCloseTo(7.59, 2);
    expect(world.castBullet({ x: 6.8, y: 1.6, z: 6 }, forward, 4)).toBeNull();
    expect(
      world.castBullet({ x: 18.8, y: 1.6, z: 0 }, { x: 0, y: 1, z: 0 }, 20)
        ?.point.y,
    ).toBeCloseTo(9);
  } finally {
    world.dispose();
  }
});

it('keeps every smart spawn candidate on a clear floor and out of cover geometry', () => {
  const world = new PhysicsWorld(house.colliders, house.spawns.blue[0]!);
  try {
    for (const point of house.respawns.candidates)
      expect(
        world.canSpawnAt(point),
        `${point.zone} at ${point.x}, ${point.z}`,
      ).toBe(true);
  } finally {
    world.dispose();
  }
});

it('traverses the Breach Lab cross-route and stops pellets at solid panels or door headers', () => {
  const world = new PhysicsWorld(house.colliders, {
    x: 6.7,
    y: 0.91,
    z: -3.475,
  });
  try {
    const direction = { x: 1, y: 0, z: 0 };
    expect(
      world.castBullet({ x: 6.7, y: 1.6, z: -3.475 }, direction, 12),
    ).toBeNull();
    expect(
      world.castBullet({ x: 6.7, y: 2.45, z: -3.475 }, direction, 12)?.point.x,
    ).toBeCloseTo(8.11, 2);
    expect(
      world.castBullet({ x: 6.7, y: 1.6, z: -1 }, direction, 12)?.point.x,
    ).toBeCloseTo(8.11, 2);
    const movement = new MovementController(world);
    for (let i = 0; i < 155; i++)
      movement.step(
        { forward: 1, right: 0, yaw: -Math.PI / 2 },
        movementConfig.fixedStep,
      );
    expect(world.position.x).toBeGreaterThan(18.2);
    expect(world.position.z).toBeCloseTo(-3.475, 2);
  } finally {
    world.dispose();
  }
});

it('collides with rotated freight, with metal and wood contacts on upper surfaces', () => {
  const world = new PhysicsWorld(house.colliders, { x: -11.3, y: 0.91, z: 10 });
  const roof = new PhysicsWorld(house.colliders, { x: -11.3, y: 3.51, z: 7.3 });
  const tower = new PhysicsWorld(house.colliders, {
    x: 0,
    y: house.towerHeight + 0.91,
    z: 0,
  });
  try {
    expect(
      world.castBullet(world.position, { x: 0, y: 0, z: -1 }, 4)?.point.z,
    ).toBeCloseTo(8.5, 2);
    for (let i = 0; i < 75; i++) world.move({ x: 0, y: -0.04, z: -0.1 });
    expect(world.position.z).toBeGreaterThan(8.75);
    for (let i = 0; i < 8; i++) {
      roof.move({ x: 0, y: -0.035, z: 0 });
      tower.move({ x: 0, y: -0.035, z: 0 });
    }
    expect(roof.groundSurface()).toBe('metal');
    expect(tower.groundSurface()).toBe('wood');
    expect(tower.grounded).toBe(true);
  } finally {
    world.dispose();
    roof.dispose();
    tower.dispose();
  }
});

it('connects the north and south rooms to the east corridor through staggered doorways', () => {
  const world = new PhysicsWorld(house.colliders, {
    x: 12.2,
    y: 0.91,
    z: -7.6,
  });
  try {
    for (const [x, z] of [
      [12.2, -5.45],
      [10.5, -5.45],
      [10.5, 3.75],
      [15.2, 3.75],
      [15.2, 1.67],
      [18.35, 1.67],
    ] as const) {
      for (let frame = 0; frame < 160; frame++) {
        const dx = x - world.position.x,
          dz = z - world.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.07) break;
        const step = Math.min(0.08 / distance, 1);
        world.move({ x: dx * step, y: -0.025, z: dz * step });
      }
      expect(
        Math.hypot(x - world.position.x, z - world.position.z),
        `room waypoint ${x}, ${z}`,
      ).toBeLessThan(0.12);
    }
  } finally {
    world.dispose();
  }
});
