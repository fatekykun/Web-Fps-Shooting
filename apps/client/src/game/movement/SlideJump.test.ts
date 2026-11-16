import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  movementConfig as config,
  type MovementInput,
} from '@breakpoint/shared';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { MovementController } from './MovementController';
import type { ArenaBox } from '../maps/arenaLayout';
import { FixedStepClock } from '../core/FixedStepClock';

const dt = config.fixedStep;
const idle: MovementInput = { forward: 0, right: 0, yaw: 0 };
const running: MovementInput = { ...idle, forward: 1, sprint: true };
const floor: ArenaBox = {
  position: [0, -0.5, 0],
  size: [200, 1, 200],
  color: 0,
};
const worlds: PhysicsWorld[] = [];
const speed = (player: MovementController) =>
  Math.hypot(player.velocity.x, player.velocity.z);
beforeAll(initializePhysics);
afterEach(() => {
  worlds.forEach((world) => world.dispose());
  worlds.length = 0;
});
function steps(player: MovementController, input: MovementInput, count = 1) {
  for (let i = 0; i < count; i++) player.step(input, dt);
}
function make(boxes: readonly ArenaBox[] = [floor]) {
  const physics = new PhysicsWorld(boxes, { x: 0, y: 0.91, z: 0 });
  worlds.push(physics);
  const player = new MovementController(physics);
  steps(player, idle, 10);
  steps(player, running, 60);
  return player;
}
function slide(player: MovementController, count = 9) {
  steps(player, { ...running, slidePressed: true });
  steps(player, running, count);
  expect(player.state).toBe('sliding');
}

describe('BP-03 slide-jump direction and momentum with real collision', () => {
  function complete(player: MovementController, yaw = 0) {
    for (let i = 0; i < 60 && player.state === 'sliding'; i++)
      steps(player, { ...running, yaw });
    expect(player.state).toBe('recovering');
  }

  it.each([
    ['forward', 0],
    ['backward', Math.PI],
    ['left', Math.PI / 2],
    ['right', -Math.PI / 2],
  ] as const)(
    'launches %s using facing at activation, not slide start direction',
    (_name, yaw) => {
      const player = make();
      slide(player);
      steps(player, { ...idle, yaw }, 2); // Looking alone must not snap the slide around.
      expect(player.velocity.z).toBeLessThan(-7);
      const before = speed(player),
        position = { ...player.physics.position };
      steps(player, { ...idle, yaw, jumpPressed: true });
      expect(player.state).toBe('airborne');
      const facing =
        -player.velocity.x * Math.sin(yaw) - player.velocity.z * Math.cos(yaw);
      const sideways =
        player.velocity.x * Math.cos(yaw) - player.velocity.z * Math.sin(yaw);
      expect(facing).toBeGreaterThan(before * 0.95);
      expect(Math.abs(sideways)).toBeLessThan(0.02);
      expect(speed(player)).toBeLessThanOrEqual(before + 0.001);
      expect(player.velocity.y).toBeCloseTo(
        config.jumpImpulse - config.gravity * dt,
        4,
      );
      expect(
        Math.hypot(
          player.physics.position.x - position.x,
          player.physics.position.z - position.z,
        ),
      ).toBeLessThanOrEqual(config.maxHorizontalSpeed * dt + 0.001);
    },
  );

  it('preserves slide momentum when jumping backward just after completion', () => {
    const player = make();
    slide(player);
    let lastSlideSpeed = speed(player);
    for (let i = 0; i < 60 && player.state === 'sliding'; i++) {
      lastSlideSpeed = speed(player);
      steps(player, { ...running, yaw: Math.PI });
    }
    expect(player.state).toBe('recovering');
    steps(player, { ...running, yaw: Math.PI }, 3);
    steps(player, { ...idle, yaw: Math.PI, jumpPressed: true });
    expect(player.state).toBe('airborne');
    expect(player.velocity.z).toBeGreaterThan(lastSlideSpeed * 0.88);
    expect(Math.abs(player.velocity.x)).toBeLessThan(0.02);
  });

  it('keeps the facing captured by a buffered slide-jump press under low cover', () => {
    const roof: ArenaBox = {
      position: [0, 1.6, -10],
      size: [4, 1, 2],
      color: 0,
    };
    const player = make([floor, roof]);
    slide(player, 0);
    for (let i = 0; i < 50 && player.physics.position.z > -10.9; i++)
      steps(player, running);
    expect(player.state).toBe('sliding');
    expect(player.physics.canStand()).toBe(false);
    steps(player, { ...idle, yaw: -Math.PI / 2, jumpPressed: true });
    for (let i = 0; i < 10 && player.state !== 'airborne'; i++)
      steps(player, { ...idle, yaw: Math.PI });
    expect(player.state).toBe('airborne');
    expect(player.velocity.x).toBeGreaterThan(5);
    expect(Math.abs(player.velocity.z)).toBeLessThan(0.02);
  });

  it('allows a redirected jump after an explicit slide cancel', () => {
    const player = make();
    slide(player);
    steps(player, { ...running, slidePressed: true });
    expect(player.state).toBe('recovering');
    const momentum = player.capture().slideJumpSpeed;
    steps(player, { ...idle, yaw: Math.PI, jumpPressed: true });
    expect(player.velocity.z).toBeGreaterThan(momentum * 0.94);
    expect(player.state).toBe('airborne');
  });

  it('expires the transition window without changing normal jumping', () => {
    const player = make();
    slide(player);
    complete(player);
    steps(
      player,
      running,
      Math.ceil(config.slideJumpTransitionWindow / dt) + 3,
    );
    expect(player.capture().slideJumpGrace).toBe(0);
    expect(player.capture().slideJumpSpeed).toBe(0);
    const before = speed(player);
    steps(player, { ...idle, yaw: Math.PI, jumpPressed: true });
    expect(player.velocity.z).toBeLessThan(-before * 0.95); // Ordinary jumps retain movement direction.
    expect(player.velocity.y).toBeCloseTo(
      config.jumpImpulse - config.gravity * dt,
      4,
    );
  });

  it.each([false, true])(
    'keeps ordinary walk/sprint jumping unchanged (sprint=%s)',
    (sprint) => {
      const player = make();
      steps(player, { ...running, sprint }, 20);
      const before = speed(player);
      steps(player, { ...idle, yaw: Math.PI, jumpPressed: true });
      expect(player.velocity.z).toBeLessThan(-before * 0.95);
      expect(player.velocity.y).toBeCloseTo(
        config.jumpImpulse - config.gravity * dt,
        4,
      );
    },
  );

  it('consumes slide momentum once and respects airborne/cooldown rules', () => {
    const player = make();
    slide(player);
    steps(player, { ...idle, yaw: Math.PI, jump: true, jumpPressed: true });
    expect(player.capture().slideJumpSpeed).toBe(0);
    expect(player.capture().slideJumpGrace).toBe(0);
    expect(player.capture().slideCooldown).toBe(config.slideCooldown);
    let vertical = player.velocity.y;
    for (let tick = 0; tick < 18; tick++) {
      steps(player, {
        ...idle,
        yaw: 0,
        jump: true,
        jumpPressed: tick % 3 === 0,
        slidePressed: true,
        sprint: true,
      });
      expect(player.state).toBe('airborne');
      expect(player.velocity.y).toBeLessThan(vertical);
      expect(speed(player)).toBeLessThanOrEqual(
        config.maxHorizontalSpeed + 0.001,
      );
      vertical = player.velocity.y;
    }
  });

  it('makes backslide jumps face the current camera without changing the retreat itself', () => {
    const player = make();
    steps(player, { ...running, forward: -1, slidePressed: true });
    expect(player.state).toBe('backsliding');
    expect(player.velocity.z).toBeGreaterThan(5);
    steps(player, { ...idle, yaw: Math.PI / 2, jumpPressed: true });
    expect(player.velocity.x).toBeLessThan(-5);
    expect(Math.abs(player.velocity.z)).toBeLessThan(0.02);
  });

  it('does not let strafing input override the facing direction on the launch tick', () => {
    const player = make();
    slide(player);
    steps(player, { ...idle, right: 1, yaw: Math.PI, jumpPressed: true });
    expect(player.velocity.z).toBeGreaterThan(7);
    expect(Math.abs(player.velocity.x)).toBeLessThan(0.02);
  });

  it('keeps wall collision in charge of the redirected trajectory', () => {
    const wall: ArenaBox = {
      position: [1.5, 3, 0],
      size: [0.5, 6, 80],
      color: 0,
    };
    const player = make([floor, wall]);
    slide(player);
    steps(player, { ...idle, yaw: -Math.PI / 2, jumpPressed: true });
    steps(player, idle, 15);
    expect(player.physics.position.x).toBeLessThan(0.94);
    expect(Math.abs(player.velocity.x)).toBeLessThan(0.1);
    expect(player.physics.position.y).toBeGreaterThan(1);
  });

  it('does not restore banked momentum after colliding during the completion window', () => {
    const wall: ArenaBox = {
      position: [0, 3, -13.4],
      size: [10, 6, 0.5],
      color: 0,
    };
    const player = make([floor, wall]);
    slide(player);
    complete(player);
    expect(player.capture().slideJumpSpeed).toBeGreaterThan(3);
    steps(player, running, 8);
    expect(player.capture().slideJumpSpeed).toBeLessThan(0.1);
    steps(player, { ...idle, yaw: Math.PI, jumpPressed: true });
    expect(speed(player)).toBeLessThan(0.2);
  });

  it('clears a stored completion launch on stop', () => {
    const player = make();
    slide(player);
    complete(player);
    expect(player.capture().slideJumpSpeed).toBeGreaterThan(0);
    player.stop();
    expect(player.capture().slideJumpSpeed).toBe(0);
    expect(player.capture().slideJumpGrace).toBe(0);
  });

  it('keeps horizontal travel comparable across headings, including after completion', () => {
    for (const completed of [false, true]) {
      const distances = [0, Math.PI, Math.PI / 2, -Math.PI / 2].map((yaw) => {
        const player = make();
        slide(player);
        if (completed) {
          complete(player, yaw);
          steps(player, { ...running, yaw }, 3);
        }
        const before = { ...player.physics.position };
        steps(player, { ...idle, yaw, jumpPressed: true });
        steps(player, { ...idle, yaw }, 18);
        return Math.hypot(
          player.physics.position.x - before.x,
          player.physics.position.z - before.z,
        );
      });
      expect(Math.min(...distances)).toBeGreaterThan(completed ? 1.3 : 2.3);
      expect(Math.min(...distances) / Math.max(...distances)).toBeGreaterThan(
        0.95,
      );
    }
  });

  it('repeats eight legal turn/slide/jump combinations without speed growth or stale launches', () => {
    const player = make();
    for (let combo = 0; combo < 8; combo++) {
      const yaw = [0, Math.PI / 2, Math.PI, -Math.PI / 2][combo % 4]!;
      const jumpYaw = yaw > 0 ? yaw - Math.PI : yaw + Math.PI;
      steps(player, { ...running, yaw }, 60);
      expect(player.state).toBe('sprinting');
      steps(player, { ...running, yaw, slidePressed: true });
      steps(player, { ...running, yaw }, 5);
      expect(player.state).toBe('sliding');
      const momentum = speed(player);
      steps(player, { ...idle, yaw: jumpYaw, jumpPressed: true });
      expect(player.state).toBe('airborne');
      expect(
        -player.velocity.x * Math.sin(jumpYaw) -
          player.velocity.z * Math.cos(jumpYaw),
      ).toBeGreaterThan(momentum * 0.95);
      expect(player.capture().slideJumpSpeed).toBe(0);
      expect(player.capture().slideJumpGrace).toBe(0);
      for (let tick = 0; tick < 90 && !player.physics.grounded; tick++) {
        steps(player, { ...idle, yaw: jumpYaw });
        expect(speed(player)).toBeLessThanOrEqual(
          config.maxHorizontalSpeed + 0.001,
        );
        expect(Number.isFinite(player.physics.position.y)).toBe(true);
      }
      expect(player.physics.grounded).toBe(true);
    }
  });

  it.each([30, 60, 144])(
    'keeps completion-window redirection deterministic at %i render FPS',
    (fps) => {
      function simulate(rate: number) {
        const player = make();
        const clock = new FixedStepClock();
        let tick = 0;
        for (let frame = 0; frame < rate * 2; frame++)
          clock.advance(1 / rate, (fixedDt) => {
            player.step(
              {
                forward: tick < 10 || tick >= 112 ? 0 : 1,
                right: 0,
                sprint: tick < 112,
                yaw: tick >= 103 ? Math.PI : 0,
                slidePressed: tick === 70,
                jumpPressed: tick === 112,
              },
              fixedDt,
            );
            tick++;
          });
        expect(player.state).toBe('airborne');
        expect(player.velocity.z).toBeGreaterThan(3);
        return player.capture();
      }
      expect(simulate(fps)).toEqual(simulate(60));
    },
  );
});
