import { beforeAll, expect, it } from 'vitest';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { movementConfig } from '../config/movement';
import { FootstepTracker, type Footstep } from './Footsteps';
import { MovementController } from './MovementController';

beforeAll(initializePhysics);
const dt = movementConfig.fixedStep;

it('uses actual travel to trigger concrete walking and metal sprint contacts', () => {
  const world = new PhysicsWorld(
    [
      { position: [-5, -0.5, 0], size: [10, 1, 25], color: 0 },
      {
        position: [5, -0.5, 0],
        size: [10, 1, 25],
        color: 0,
        footstepSurface: 'metal',
      },
    ],
    { x: -2.25, y: 0.91, z: 0 },
  );
  const player = new MovementController(world);
  const tracker = new FootstepTracker(),
    sounds: Footstep[] = [];
  function run(frames: number, forward: number, sprint = false) {
    for (let i = 0; i < frames; i++) {
      const vertical = player.velocity.y;
      player.step({ forward, right: 0, yaw: -Math.PI / 2, sprint }, dt);
      const sound = tracker.step(player, dt, vertical);
      if (sound) sounds.push(sound);
    }
  }
  try {
    run(35, 0);
    expect(sounds).toHaveLength(0);
    run(24, 1);
    expect(
      sounds.some(
        (sound) => sound.kind === 'walk' && sound.surface === 'concrete',
      ),
    ).toBe(true);
    run(40, 1, true);
    expect(
      sounds.some(
        (sound) => sound.kind === 'sprint' && sound.surface === 'metal',
      ),
    ).toBe(true);
    expect(sounds.filter((sound) => sound.kind === 'walk')).toHaveLength(1);
    expect(sounds.filter((sound) => sound.kind === 'sprint')).toHaveLength(2);
  } finally {
    world.dispose();
  }
});

it('emits crouch and crawl sounds, one scrape per slide, and one scaled landing after air time', () => {
  const pos = { x: 0, y: 0.89, z: 0 };
  const player = {
    physics: { position: pos, grounded: true, groundSurface: () => 'wood' },
    previousPosition: { ...pos },
    state: 'crouching',
  };
  const tracker = new FootstepTracker();
  const advance = (meters: number, vertical = 0) => {
    player.previousPosition.x = pos.x;
    pos.x += meters;
    return tracker.step(player as unknown as MovementController, dt, vertical);
  };
  expect(advance(0.65)).toBeUndefined();
  expect(advance(0.72)).toMatchObject({ kind: 'crouch', surface: 'wood' });
  player.state = 'prone';
  expect(advance(0.67)).toMatchObject({ kind: 'crawl' });
  player.state = 'sliding';
  expect(advance(0)).toBeUndefined();
  expect(advance(0.15)).toMatchObject({ kind: 'slide' });
  for (let i = 0; i < 36; i++) expect(advance(0.13)).toBeUndefined();
  player.state = 'airborne';
  player.physics.grounded = false;
  for (let i = 0; i < 12; i++) expect(advance(0.12, -6)).toBeUndefined();
  player.state = 'walking';
  player.physics.grounded = true;
  expect(advance(0.01, -6)).toMatchObject({ kind: 'land', strength: 0.6 });
  expect(advance(0, -6)).toBeUndefined();
  expect(advance(1.59)).toBeUndefined();
  player.state = 'backsliding';
  expect(advance(0.15)).toMatchObject({ kind: 'slide' });
});
