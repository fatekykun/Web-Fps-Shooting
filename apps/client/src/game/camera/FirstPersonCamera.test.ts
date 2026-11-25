import { Vector3 } from 'three';
import { beforeAll, expect, it } from 'vitest';
import { movementConfig as config } from '@breakpoint/shared';
import { MovementController } from '../movement/MovementController';
import { initializePhysics, PhysicsWorld } from '../physics/PhysicsWorld';
import { FirstPersonCamera } from './FirstPersonCamera';

beforeAll(initializePhysics);

it('widens and rolls through a slide, then settles without displacing the aim ray', () => {
  const physics = new PhysicsWorld([], { x: 0, y: 0.91, z: 0 });
  try {
    const player = new MovementController(physics);
    const { fixedStep } = config;
    const view = new FirstPersonCamera();
    const input = { pitch: 0.12, movement: { forward: 1, right: 0, yaw: 0.3 } };
    const draw = () =>
      view.update(player, input, 1, 0.03, 0.01, 85 + view.slideFovOffset);
    draw();
    const originalAim = view.camera.getWorldDirection(new Vector3());
    for (let i = 0; i < 6; i++) view.updateSlide('sliding', 11.1, fixedStep, 1);
    draw();
    expect(view.camera.fov).toBeGreaterThan(90);
    expect(view.camera.rotation.z).toBeGreaterThan(0.015);
    expect(
      view.camera.getWorldDirection(new Vector3()).distanceTo(originalAim),
    ).toBeLessThan(1e-10);

    const widened = view.camera.fov;
    view.updateSlide('recovering', 0, fixedStep, 1);
    draw();
    expect(view.camera.fov).toBeGreaterThan(85);
    expect(view.camera.fov).toBeLessThan(widened);
    for (let i = 0; i < 30; i++)
      view.updateSlide('recovering', 0, fixedStep, 1);
    draw();
    expect(view.camera.fov).toBeCloseTo(85, 1);
    expect(view.camera.rotation.z).toBeCloseTo(0, 5);
    view.resetSlide();
    for (let i = 0; i < 6; i++) view.updateSlide('sliding', 11.1, fixedStep, 0);
    draw();
    expect(view.slideFovOffset).toBe(0);
    expect(view.camera.rotation.z).toBe(0);
  } finally {
    physics.dispose();
  }
});
