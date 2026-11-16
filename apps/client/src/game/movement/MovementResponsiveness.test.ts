import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { movementConfig, type MovementInput } from '@breakpoint/shared';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { MovementController } from './MovementController';
import { FixedStepClock } from '../core/FixedStepClock';
import { env } from 'node:process';

const dt = movementConfig.fixedStep;
const idle: MovementInput = { forward: 0, right: 0, yaw: 0 };
const forward: MovementInput = { ...idle, forward: 1 };
const backward: MovementInput = { ...idle, forward: -1 };
const right: MovementInput = { ...idle, right: 1 };
const left: MovementInput = { ...idle, right: -1 };
const running: MovementInput = { ...forward, sprint: true };
const worlds: PhysicsWorld[] = [];
const speed = (player: MovementController) =>
  Math.hypot(player.velocity.x, player.velocity.z);
function report(scenario: string, measurement: Record<string, number>) {
  if (env.BP_MOVEMENT_REPORT === '1')
    console.info(JSON.stringify({ scenario, ...measurement }));
}

beforeAll(initializePhysics);
afterEach(() => {
  worlds.forEach((world) => world.dispose());
  worlds.length = 0;
});
function step(player: MovementController, input: MovementInput, count = 1) {
  for (let i = 0; i < count; i++) player.step(input, dt);
}
function make() {
  const physics = new PhysicsWorld(
    [{ position: [0, -0.5, 0], size: [200, 1, 200], color: 0 }],
    { x: 0, y: 0.91, z: 0 },
  );
  worlds.push(physics);
  const player = new MovementController(physics);
  step(player, idle, 10);
  return player;
}

describe('BP-02 responsive ground control with real Rapier collision', () => {
  it.each([
    ['forward to backward', forward, backward],
    ['backward to forward', backward, forward],
    ['right to left', right, left],
    ['left to right', left, right],
    ['sprint to backward', running, { ...backward, sprint: true }],
    [
      'rotated sprint to backward',
      { ...running, yaw: Math.PI / 2 },
      { ...backward, yaw: Math.PI / 2, sprint: true },
    ],
  ] as const)(
    'reverses %s within 50 ms and reaches target within 117 ms',
    (_name, from, to) => {
      const player = make();
      step(player, from, 60);
      const x = to.right * Math.cos(to.yaw) - to.forward * Math.sin(to.yaw);
      const z = -to.forward * Math.cos(to.yaw) - to.right * Math.sin(to.yaw);
      let reversal = Infinity,
        full = Infinity;
      for (let tick = 1; tick <= 60; tick++) {
        step(player, to);
        if (
          player.velocity.x * x + player.velocity.z * z > 0 &&
          !Number.isFinite(reversal)
        )
          reversal = tick * dt;
        if (
          Math.hypot(player.velocity.x - x * 5, player.velocity.z - z * 5) <
            0.02 &&
          !Number.isFinite(full)
        )
          full = tick * dt;
        expect(speed(player)).toBeLessThanOrEqual(
          movementConfig.sprintSpeed + 0.001,
        );
      }
      const measured = JSON.stringify({
        reversalMs: reversal * 1000,
        fullSpeedMs: full * 1000,
      });
      report(_name, { reversalMs: reversal * 1000, fullSpeedMs: full * 1000 });
      expect(reversal, measured).toBeLessThanOrEqual(3 * dt);
      expect(full, measured).toBeLessThanOrEqual(7 * dt);
    },
  );

  it.each([
    ['walking', forward, 0.12],
    ['sprinting with Shift held', running, 0.25],
    ['strafing', right, 0.12],
    ['backward', backward, 0.12],
  ] as const)(
    'stops %s within 100 ms with bounded stopping distance',
    (_name, input, maxDistance) => {
      const player = make();
      step(player, input, 60);
      const start = { ...player.physics.position };
      const before = speed(player);
      const release = { ...idle, sprint: true };
      step(player, release);
      expect(speed(player)).toBeLessThan(before);
      expect(player.state).toBe('walking');
      let stop = speed(player) < 0.001 ? dt : Infinity;
      for (let tick = 2; tick <= 60; tick++) {
        step(player, release);
        if (speed(player) < 0.001 && !Number.isFinite(stop)) stop = tick * dt;
      }
      const distance = Math.hypot(
        player.physics.position.x - start.x,
        player.physics.position.z - start.z,
      );
      const measured = JSON.stringify({ stopMs: stop * 1000, distance });
      report(_name, { stopMs: stop * 1000, distance });
      expect(stop, measured).toBeLessThanOrEqual(0.1);
      expect(distance, measured).toBeLessThanOrEqual(maxDistance);
      const stopped = { ...player.physics.position };
      step(player, release, 120);
      // Rapier's contact settling may move sub-millimetres; no perceptible drift
      // or residual horizontal velocity is allowed after two seconds idle.
      expect(
        Math.hypot(
          player.physics.position.x - stopped.x,
          player.physics.position.z - stopped.z,
        ),
      ).toBeLessThan(0.001);
      expect(Math.abs(player.physics.position.y - stopped.y)).toBeLessThan(
        0.002,
      );
      expect(speed(player)).toBe(0);
      expect(player.velocity.y).toBe(0);
    },
  );

  it('changes sprint diagonals promptly without accelerating beyond sprint speed', () => {
    const player = make();
    step(player, { ...running, right: 1 }, 60);
    let minimum = 8;
    step(player, { ...running, right: -1 });
    for (let tick = 1; tick < 7; tick++) {
      minimum = Math.min(minimum, speed(player));
      step(player, { ...running, right: -1 });
      expect(speed(player)).toBeLessThanOrEqual(8.001);
    }
    expect(player.velocity.x).toBeCloseTo(-8 / Math.SQRT2, 2);
    expect(player.velocity.z).toBeCloseTo(-8 / Math.SQRT2, 2);
    expect(minimum).toBeGreaterThan(5.5);
    expect(player.state).toBe('sprinting');
  });

  it('removes excess speed from ordinary walking without teleporting or changing gravity', () => {
    const player = make();
    player.velocity.z = -10;
    let previous = player.physics.position.z;
    for (let tick = 0; tick < 6; tick++) {
      step(player, forward);
      expect(
        Math.abs(player.physics.position.z - previous),
      ).toBeLessThanOrEqual(12 * dt + 0.001);
      previous = player.physics.position.z;
    }
    expect(speed(player)).toBeCloseTo(5, 2);
    expect(player.physics.grounded).toBe(true);
    expect(player.velocity.y).toBe(0);
  });

  it('keeps neutral slide and airborne momentum separate from ground braking', () => {
    const player = make();
    step(player, running, 60);
    step(player, { ...running, slidePressed: true });
    step(player, idle, 10);
    expect(player.state).toBe('sliding');
    expect(speed(player)).toBeGreaterThan(8);
    const beforeJump = speed(player);
    step(player, { ...idle, jumpPressed: true });
    expect(player.state).toBe('airborne');
    expect(speed(player)).toBeGreaterThan(beforeJump * 0.95);
    const airborne = speed(player);
    step(player, idle, 6);
    expect(speed(player)).toBeGreaterThan(airborne * 0.97);
    expect(player.physics.position.y).toBeGreaterThan(1.1);
    expect(player.velocity.y).toBeGreaterThan(0);
  });

  it('repeated ground direction changes stay within the walk-speed cap', () => {
    const player = make();
    const inputs = [forward, left, backward, right];
    for (let tick = 0; tick < 1200; tick++) {
      step(player, inputs[Math.floor(tick / 8) % 4]!);
      expect(speed(player)).toBeLessThanOrEqual(5.001);
    }
  });

  it.each([30, 60, 144])(
    'simulates the same reversal/braking sequence at %i rendering FPS',
    (fps) => {
      function simulate(renderFps: number) {
        const player = make();
        const clock = new FixedStepClock();
        let tick = 0;
        for (let frame = 0; frame < renderFps * 2; frame++)
          clock.advance(1 / renderFps, (fixedDt) => {
            const input =
              tick < 60
                ? running
                : tick < 72
                  ? backward
                  : tick < 90
                    ? { ...running, right: 1 }
                    : tick < 108
                      ? { ...running, right: -1 }
                      : idle;
            player.step(input, fixedDt);
            tick++;
          });
        return {
          tick,
          position: { ...player.physics.position },
          velocity: { ...player.velocity },
          state: player.state,
        };
      }
      const actual = simulate(fps),
        expected = simulate(60);
      expect(actual.tick).toBe(120);
      expect(actual).toEqual(expected);
    },
  );
});
