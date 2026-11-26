import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  movementConfig as config,
  type MovementInput,
} from '@breakpoint/shared';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import type { ArenaBox } from '../maps/arenaLayout';
import { arenaBoxes, spawn } from '../maps/arenaLayout';
import { MovementController } from './MovementController';

const idle: MovementInput = { forward: 0, right: 0, yaw: 0 };
const running: MovementInput = { forward: 1, right: 0, yaw: 0, sprint: true };
const floor: ArenaBox = {
  position: [0, -0.5, 0],
  size: [200, 1, 200],
  color: 0,
};
const dt = config.fixedStep;
const speed = (player: MovementController) =>
  Math.hypot(player.velocity.x, player.velocity.z);

describe('movement transitions with real Rapier collision', () => {
  const worlds: PhysicsWorld[] = [];
  beforeAll(initializePhysics);
  afterEach(() => {
    worlds.forEach((world) => world.dispose());
    worlds.length = 0;
  });

  function make(
    boxes: readonly ArenaBox[] = [floor],
    position = { x: 0, y: 0.91, z: 0 },
  ) {
    const world = new PhysicsWorld(boxes, position);
    worlds.push(world);
    const player = new MovementController(world);
    return player;
  }
  function steps(
    player: MovementController,
    count: number,
    input: MovementInput = idle,
  ) {
    for (let i = 0; i < count; i++) player.step(input, dt);
  }
  function run(player: MovementController) {
    steps(player, 10);
    steps(player, 60, running);
  }

  it('uses the slide button to toggle crouch at rest and while walking', () => {
    const player = make();
    steps(player, 12);
    player.step({ ...idle, slidePressed: true }, dt);
    steps(player, 20);
    expect(player.state).toBe('crouching');
    expect(player.physics.halfHeight).toBeCloseTo(config.crouchHalfHeight);
    expect(player.eyeOffset).toBeLessThan(config.eyeOffset);
    player.step({ ...idle, slidePressed: true }, dt);
    expect(player.state).toBe('walking');
    const walking = { ...idle, forward: 1 };
    steps(player, 30, walking);
    player.step({ ...walking, slidePressed: true }, dt);
    steps(player, 20, walking);
    expect(player.state).toBe('crouching');
    expect(speed(player)).toBeCloseTo(config.crouchSpeed, 2);
  });

  it('crawls prone through low cover and only rises when there is room', () => {
    const roof: ArenaBox = {
      position: [0, 1.55, -2],
      size: [4, 1.2, 2],
      color: 0,
    };
    const player = make([floor, roof]);
    steps(player, 12);
    player.step({ ...idle, pronePressed: true }, dt);
    steps(player, 105, { ...idle, forward: 1 });
    expect(player.state).toBe('prone');
    expect(player.physics.halfHeight).toBeCloseTo(config.proneHalfHeight);
    expect(speed(player)).toBeCloseTo(config.proneSpeed, 2);
    expect(player.physics.position.z).toBeLessThan(-1.5);
    expect(player.physics.canStand()).toBe(false);
    for (const input of [
      { pronePressed: true },
      { slidePressed: true },
      { jumpPressed: true },
    ]) {
      player.step({ ...idle, ...input }, dt);
      expect(player.state).toBe('prone');
    }
    steps(player, 128, { ...idle, right: 1 });
    expect(player.physics.canStand()).toBe(true);
    player.step({ ...idle, slidePressed: true }, dt);
    steps(player, 20);
    expect(player.state).toBe('crouching');
    expect(player.physics.halfHeight).toBeCloseTo(config.crouchHalfHeight);
    player.step({ ...idle, jumpPressed: true }, dt);
    expect(player.state).toBe('airborne');
  });

  it('accelerates to sprint speed and promptly returns to walk speed on Shift release', () => {
    const player = make();
    run(player);
    expect(player.state).toBe('sprinting');
    expect(speed(player)).toBeCloseTo(8, 1);
    player.step({ ...running, sprint: false }, dt);
    expect(player.state).toBe('walking');
    expect(speed(player)).toBeGreaterThanOrEqual(5);
    expect(speed(player)).toBeLessThan(6);
    steps(player, 3, { ...running, sprint: false });
    expect(speed(player)).toBeCloseTo(5, 1);
  });

  it('accepts a slide tap across different grounded simulation phases in the Depot', () => {
    for (let phase = 60; phase < 85; phase++) {
      const player = make(arenaBoxes, { ...spawn });
      steps(player, phase, running);
      player.step({ ...running, slidePressed: true }, dt);
      steps(player, 5, running);
      expect(
        player.state,
        `slide phase ${phase}, grounded ${player.physics.grounded}`,
      ).toBe('sliding');
    }
  });

  it('maintains sprint momentum across the Depot floor without swallowed frames', () => {
    const player = make(arenaBoxes, { ...spawn });
    steps(player, 60, running);
    for (let i = 0; i < 80; i++) {
      player.step(running, dt);
      expect(speed(player), `unobstructed frame ${i}`).toBeGreaterThan(7.9);
    }
  });

  it('slides with momentum, smoothly lowers the capsule, then jumps without a walk-speed reset', () => {
    const player = make();
    run(player);
    player.step({ ...running, slidePressed: true }, dt);
    expect(player.state).toBe('sliding');
    expect(speed(player)).toBeGreaterThan(9.5);
    expect(player.physics.halfHeight).toBeGreaterThan(config.slideHalfHeight);
    expect(player.previousEyeOffset - player.eyeOffset).toBeLessThanOrEqual(
      2 * config.postureSpeed * dt + 0.0001,
    );
    steps(player, 9, running);
    expect(player.physics.halfHeight).toBeCloseTo(config.slideHalfHeight);
    expect(player.physics.position.y).toBeGreaterThan(0.86);
    expect(player.physics.position.y).toBeLessThan(0.92);
    const before = speed(player);
    player.step({ ...running, jumpPressed: true }, dt);
    expect(player.state).toBe('airborne');
    expect(player.velocity.y).toBeGreaterThan(6);
    expect(speed(player)).toBeGreaterThan(before * 0.95);
    expect(player.physics.grounded).toBe(false);
  });

  it('cancels a slide into recovery without erasing momentum, and enforces cooldown', () => {
    const player = make();
    run(player);
    player.step({ ...running, slidePressed: true }, dt);
    steps(player, 8, running);
    const before = speed(player);
    player.step({ ...running, slidePressed: true }, dt);
    expect(player.state).toBe('recovering');
    expect(speed(player)).toBeGreaterThan(before * 0.9);
    steps(player, 18, running);
    expect(player.state).toBe('sprinting');
    player.step({ ...running, slidePressed: true }, dt);
    expect(player.state).toBe('sprinting');
    steps(player, 10, running);
    // The early press is buffered until the cooldown finishes, without a second press.
    expect(player.state).toBe('sliding');
  });

  it('ends a head-on slide on the contact tick and cannot launch off the stored speed', () => {
    const wall: ArenaBox = {
      position: [0, 2, -10.5],
      size: [4, 4, 0.5],
      color: 0,
    };
    const player = make([floor, wall]);
    run(player);
    player.step({ ...running, slidePressed: true }, dt);
    expect(player.state).toBe('sliding');
    let frames = 0;
    while (player.state === 'sliding' && frames++ < 30)
      player.step(running, dt);
    expect(frames * dt).toBeLessThan(config.slideDuration / 2);
    expect(player.state).toBe('recovering');
    expect(speed(player)).toBe(0);
    expect(player.capture().slideJumpSpeed).toBe(0);
    expect(player.physics.position.z).toBeCloseTo(
      -10.25 + config.capsuleRadius + config.collisionOffset,
      2,
    );
    steps(player, 24, { ...idle, right: 1 });
    expect(player.state).toBe('walking');
    expect(player.physics.halfHeight).toBeCloseTo(config.capsuleHalfHeight);
    expect(player.physics.position.x).toBeGreaterThan(1);
  });

  it('continues sliding along the wall after a shallow contact', () => {
    const wall: ArenaBox = {
      position: [1, 2, -10],
      size: [0.3, 4, 30],
      color: 0,
    };
    const player = make([floor, wall], { x: -2.2, y: 0.91, z: 0 });
    const approach = { ...running, yaw: -Math.PI / 12 };
    steps(player, 10);
    steps(player, 60, approach);
    player.step({ ...approach, slidePressed: true }, dt);
    steps(player, 20, approach);
    expect(player.physics.position.x).toBeCloseTo(
      0.85 - config.capsuleRadius - config.collisionOffset,
      2,
    );
    expect(player.state).toBe('sliding');
    expect(player.velocity.z).toBeLessThan(-6);
    const alongWall = player.physics.position.z;
    steps(player, 5, approach);
    expect(player.state).toBe('sliding');
    expect(player.physics.position.z).toBeLessThan(alongWall - 0.4);
  });

  it('boosts the incoming sprint, increases drag through the slide, and ends low momentum early', () => {
    const player = make();
    const partialSprint = { ...running, forward: 0.82 };
    steps(player, 10);
    steps(player, 60, partialSprint);
    const sprintSpeed = speed(player);
    player.step({ ...partialSprint, slidePressed: true }, dt);
    const boosted = speed(player);
    expect(boosted).toBeGreaterThan(sprintSpeed * 1.33);
    steps(player, 6, partialSprint);
    const earlyRatio = speed(player) / boosted;
    steps(player, 15, partialSprint);
    const middle = speed(player);
    steps(player, 6, partialSprint);
    expect(speed(player) / middle).toBeLessThan(earlyRatio);
    let elapsed = 27 * dt;
    while (player.state === 'sliding' && elapsed < config.slideDuration) {
      player.step(partialSprint, dt);
      elapsed += dt;
    }
    expect(elapsed).toBeLessThan(config.slideDuration);
    expect(player.state).toBe('recovering');
    expect(speed(player)).toBeLessThanOrEqual(config.slideExitSpeed);
  });

  it('backslides while keeping the camera direction unchanged', () => {
    const player = make();
    run(player);
    const input = { ...running, forward: -1, slidePressed: true };
    player.step(input, dt);
    expect(player.state).toBe('backsliding');
    expect(player.velocity.z).toBeGreaterThan(5.5);
    expect(speed(player)).toBeLessThanOrEqual(config.backslideSpeed + 0.01);
    expect(input.yaw).toBe(0);
  });

  it('allows a short W-to-S transition before the backslide press', () => {
    const player = make();
    run(player);
    steps(player, 5, { ...running, forward: -1 });
    expect(speed(player)).toBeLessThan(config.slideMinimumSpeed);
    player.step({ ...running, forward: -1, slidePressed: true }, dt);
    expect(player.state).toBe('backsliding');
    expect(player.velocity.z).toBeGreaterThan(5.5);
  });

  it('rejects low-speed and airborne slide/dive boosts', () => {
    const player = make();
    steps(player, 10);
    player.step({ ...running, slidePressed: true, divePressed: true }, dt);
    steps(player, 10, running);
    expect(player.state).toBe('sprinting');
    run(player);
    player.step({ ...running, jumpPressed: true }, dt);
    const before = speed(player);
    player.step({ ...running, slidePressed: true, divePressed: true }, dt);
    expect(player.state).toBe('airborne');
    expect(speed(player)).toBeLessThanOrEqual(before + 0.1);
    expect(player.physics.halfHeight).toBe(config.capsuleHalfHeight);
  });

  it('bunny hops repeatedly with bounded air steering and retained takeoff momentum', () => {
    const player = make();
    run(player);
    const before = speed(player);
    player.step({ ...running, jump: true }, dt);
    expect(speed(player)).toBeGreaterThan(before * 0.95);
    let jumps = 1;
    let previousY = player.velocity.y;
    for (let i = 0; i < 600; i++) {
      player.step({ ...running, right: i % 60 < 30 ? 1 : -1, jump: true }, dt);
      if (player.velocity.y > 5 && previousY <= 0) jumps++;
      previousY = player.velocity.y;
      expect(speed(player)).toBeLessThanOrEqual(
        config.maxHorizontalSpeed + 0.01,
      );
    }
    expect(jumps).toBeGreaterThan(5);
  });

  it('buffers a short jump press before landing', () => {
    const player = make([floor], { x: 0, y: 3, z: 0 });
    for (let i = 0; i < 120 && player.physics.position.y > 1.1; i++)
      player.step(idle, dt);
    expect(player.physics.grounded).toBe(false);
    player.step({ ...idle, jumpPressed: true }, dt);
    let highestVelocity = player.velocity.y;
    for (let i = 0; i < 10; i++) {
      player.step(idle, dt);
      highestVelocity = Math.max(highestVelocity, player.velocity.y);
    }
    expect(highestVelocity).toBeGreaterThan(5);
  });

  it('allows a coyote-time jump just after walking off a ledge', () => {
    const ledge: ArenaBox = {
      position: [0, -0.5, 0],
      size: [4, 1, 4],
      color: 0,
    };
    const player = make([ledge]);
    steps(player, 10);
    for (let i = 0; i < 120 && player.physics.grounded; i++)
      player.step(running, dt);
    expect(player.physics.grounded).toBe(false);
    player.step({ ...running, jumpPressed: true }, dt);
    expect(player.velocity.y).toBeGreaterThan(6);
  });

  it('dives airborne, stays low until landing, and recovers to sprint without a velocity reset', () => {
    const player = make();
    run(player);
    player.step({ ...running, divePressed: true }, dt);
    expect(player.state).toBe('diving');
    expect(player.velocity.y).toBeGreaterThan(3);
    expect(player.physics.grounded).toBe(false);
    steps(player, 12, { ...running, jump: true });
    expect(player.physics.halfHeight).toBeCloseTo(config.diveHalfHeight);
    expect(player.state).toBe('diving');
    // Holding jump cannot cancel a dive's mandatory landing/recovery interval.
    steps(player, 18, running);
    expect(player.state).toBe('diving');
    steps(player, 40, running);
    expect(player.state).toBe('sprinting');
    expect(player.physics.halfHeight).toBeCloseTo(config.capsuleHalfHeight);
    expect(speed(player)).toBeGreaterThan(3);
    steps(player, 60, running);
    expect(speed(player)).toBeCloseTo(config.sprintSpeed, 1);
  });

  it('enforces dive recovery even when jump is held on landing', () => {
    const player = make();
    run(player);
    player.step({ ...running, divePressed: true }, dt);
    for (let i = 0; i < 120 && player.state === 'diving'; i++)
      player.step({ ...running, jump: true }, dt);
    expect(player.state).toBe('recovering');
    steps(player, 8, { ...running, jump: true });
    expect(player.state).toBe('recovering');
    expect(player.velocity.y).toBe(0);
    steps(player, 8, { ...running, jump: true });
    expect(player.state).toBe('airborne');
    expect(player.velocity.y).toBeGreaterThan(0);
  });

  it('detects a ceiling by its contact normal, stops ascent and falls normally', () => {
    const ceiling: ArenaBox = {
      position: [0, 2.75, 0],
      size: [20, 1, 20],
      color: 0,
    };
    const player = make([floor, ceiling]);
    steps(player, 10);
    player.step({ ...idle, jumpPressed: true }, dt);
    let touchedCeiling = false;
    for (let i = 0; i < 100; i++) {
      player.step(idle, dt);
      expect(player.physics.position.y).toBeLessThan(1.4);
      touchedCeiling ||= player.physics.hitCeiling;
    }
    expect(touchedCeiling).toBe(true);
    expect(player.physics.grounded).toBe(true);
  });

  it('preserves capsule feet and rejects standing underneath an overhang', () => {
    const roof: ArenaBox = { position: [0, 1.6, 0], size: [4, 1, 4], color: 0 };
    const player = make([floor, roof]);
    player.physics.resize(config.slideHalfHeight);
    const anchor = player.physics.position.y;
    expect(player.physics.canStand()).toBe(false);
    expect(player.physics.resize(config.capsuleHalfHeight)).toBe(false);
    expect(player.physics.halfHeight).toBe(config.slideHalfHeight);
    expect(player.physics.position.y).toBe(anchor);
    player.physics.move({ x: 4, y: -0.03, z: 0 });
    expect(player.physics.canStand()).toBe(true);
    expect(player.physics.resize(config.capsuleHalfHeight)).toBe(true);
  });

  it('keeps recovery low under a roof and stands automatically after exiting', () => {
    const roof: ArenaBox = {
      position: [0, 1.6, -14],
      size: [4, 1, 12],
      color: 0,
    };
    const player = make([floor, roof]);
    steps(player, 10);
    // Begin lowering before the roof; the faster sprint ramp reaches it sooner.
    steps(player, 50, running);
    player.step({ ...running, slidePressed: true }, dt);
    expect(player.state).toBe('sliding');
    steps(player, 55, running);
    expect(player.state).toBe('recovering');
    expect(player.physics.halfHeight).toBeLessThan(config.capsuleHalfHeight);
    expect(player.physics.canStand()).toBe(false);
    player.step({ ...running, jumpPressed: true }, dt);
    expect(player.velocity.y).toBe(0);
    steps(player, 260, running);
    expect(player.physics.position.z).toBeLessThan(-17);
    expect(player.state).toBe('sprinting');
    expect(player.physics.halfHeight).toBeCloseTo(config.capsuleHalfHeight);
  });

  it.each([
    ['wall', { position: [1, 10, 0], size: [0.5, 20, 30], color: 0 }],
    ['crate', { position: [1.5, 1.25, 0], size: [1.5, 2.5, 3], color: 0 }],
  ] satisfies [string, ArenaBox][])(
    'blocks an airborne jump against a %s while allowing motion along its face',
    (_, obstacle) => {
      const player = make([floor, obstacle], { x: 0.36, y: 0.91, z: 0 });
      steps(player, 8);
      const towardWall = { ...idle, right: 1, forward: 1 };
      player.step({ ...towardWall, jumpPressed: true }, dt);
      expect(player.velocity.y).toBeGreaterThan(5);
      steps(player, 8, towardWall);
      expect(player.physics.grounded).toBe(false);
      const contact = { ...player.physics.position };
      expect(contact.x).toBeGreaterThan(0.39);
      expect(contact.x).toBeLessThan(0.75 - config.capsuleRadius);
      const verticalBefore = player.velocity.y;
      player.step({ ...towardWall, jumpPressed: true }, dt);
      expect(player.velocity.y).toBeCloseTo(
        verticalBefore - config.gravity * dt,
      );
      expect(player.physics.position.x).toBeCloseTo(contact.x, 2);
      expect(player.physics.position.z).toBeLessThan(contact.z);
    },
  );

  it('freezes momentum and interpolation during a pause in midair', () => {
    const player = make();
    run(player);
    player.step({ ...running, jump: true }, dt);
    const velocity = { ...player.velocity };
    const position = { ...player.physics.position };
    player.synchronize();
    expect(player.velocity).toEqual(velocity);
    expect(player.previousPosition).toEqual(position);
    expect(player.previousEyeOffset).toBe(player.eyeOffset);
    player.step(idle, dt);
    expect(player.velocity.y).toBeCloseTo(velocity.y - config.gravity * dt);
  });
});
