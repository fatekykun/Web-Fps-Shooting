import { expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  degreesToRadians,
  spreadDirection,
  type AccuracyContext,
} from '@breakpoint/shared';
import { WeaponController } from './WeaponController';
import { ShotgunReticle, projectConeRadius } from './ShotgunReticle';

it('projects the edge of the firing cone to the same CSS radius at every phase', () => {
  const yaw = 0.62,
    pitch = -0.37,
    height = 580,
    width = 920;
  const camera = new PerspectiveCamera(96, width / height, 0.08, 90);
  camera.position.set(4, 2, 8);
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  camera.zoom = 1.4;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const halfAngle = 7.5 * degreesToRadians;
  const radius = projectConeRadius(
    halfAngle,
    height,
    camera.projectionMatrix.elements[5]!,
  );
  const ray = new Vector3();
  for (const distance of [3, 5, 10, 15]) {
    for (const phase of [0, 0.125, 0.25, 0.5, 0.75]) {
      spreadDirection(yaw, pitch, halfAngle, 1, phase, ray);
      const projected = ray
        .multiplyScalar(distance)
        .add(camera.position)
        .project(camera);
      expect(
        Math.hypot((projected.x * width) / 2, (projected.y * height) / 2),
      ).toBeCloseTo(radius, 7);
    }
  }
});

it.each([
  ['idle', 0, true, 0, 0, 4.5],
  ['walk', 5, true, 0, 0, 5.375],
  ['sprint', 8, true, 0, 0, 5.9],
  ['slide', 10, true, 0, 0, 6.25],
  ['crouch walk', 2.65, true, 0, 0, 4.96375],
  ['rising', 5, false, 3, 0, 8.375],
  ['falling', 5, false, -3, 0, 9.375],
  ['ADS', 0, true, 0, 1, 2],
] as const)(
  'uses the same %s spread for the live reticle and fired pellets',
  (_, speed, grounded, verticalSpeed, ads, degrees) => {
    let fired = 0;
    const weapon = new WeaponController((shot) => {
      fired = shot.spread;
    });
    weapon.selected = 'shotgun';
    weapon.ads = ads;
    const motion: AccuracyContext = { speed, grounded, verticalSpeed };
    const angle = weapon.spreadFor(motion);
    weapon.step(
      1 / 60,
      {
        fire: true,
        firePressed: true,
        aim: ads > 0,
        reloadPressed: false,
        switchTo: null,
      },
      motion,
    );
    expect(angle / degreesToRadians).toBeCloseTo(degrees, 5);
    expect(fired).toBe(angle);
    expect(weapon.spreadFor(motion)).toBeGreaterThan(angle); // Post-shot bloom is visible on the next frame.
  },
);

it('expands immediately and contracts at the same rate across frame sizes', () => {
  const a = new ShotgunReticle(),
    b = new ShotgunReticle();
  expect(a.update(0.2, 0.001, false)).toBe(0.2);
  b.update(0.2, 0.001, false);
  const first = a.update(0.1, 0.03, false);
  expect(first).toBeGreaterThan(0.1);
  expect(first).toBeLessThan(0.2);
  expect(a.update(0.1, 0.03, false)).toBeCloseTo(
    b.update(0.1, 0.06, false),
    12,
  );
  expect(a.update(0.12, 0.001, true)).toBe(0.12);
  a.reset();
  expect(a.update(0.08, 0, false)).toBe(0.08);
});
