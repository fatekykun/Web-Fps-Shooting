import { expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import {
  createRigTransforms,
  evaluateRig,
  rigJoints,
} from '@breakpoint/shared/character';
import { TacticalSkeleton } from './TacticalSkeleton';
import { createTacticalGeometry } from './TacticalGeometry';

it('matches every Three.Bone world transform to authoritative server joint evaluation', () => {
  const model = new TacticalSkeleton();
  try {
    const pose = {
      pitch: 0.6,
      halfHeight: 0.2,
      animationTime: 3.7,
      gaitPhase: 1.2,
      gaitAmount: 0.8,
      sprintBlend: 0.3,
      carryBlend: 0.8,
      aimBlend: 0.6,
      fireBlend: 0.5,
      slideBlend: 0.6,
      diveBlend: 0.1,
      airBlend: 0.3,
      landingBlend: 0.2,
      reloadBlend: 0.8,
      reloadProgress: 0.4,
      hitBlend: 0.5,
      hitYaw: 1.3,
    };
    model.update(pose);
    const transforms = createRigTransforms();
    evaluateRig(pose, transforms);
    expect(model.skeleton.bones).toHaveLength(rigJoints.length);
    for (let i = 0; i < transforms.length; i++) {
      const server = transforms[i]!,
        p = new Vector3(),
        q = new Quaternion(),
        s = new Vector3();
      model.bones[i]!.matrixWorld.decompose(p, q, s);
      [p.x, p.y, p.z, q.x, q.y, q.z, q.w].forEach((value, n) =>
        expect(value, rigJoints[i]!.name).toBeCloseTo(
          [
            server.x,
            server.y,
            server.z,
            server.qx,
            server.qy,
            server.qz,
            server.qw,
          ][n]!,
          10,
        ),
      );
      s.toArray().forEach((value) => expect(value).toBeCloseTo(1, 10));
    }
    const attached = model.bones.find((bone) => bone.name === 'weapon')!;
    expect(attached.parent!.name).toBe('chest');
    const snapshot = attached.matrixWorld.clone();
    model.update({ ...pose, reloadProgress: 0.8 });
    expect(attached.matrixWorld.equals(snapshot)).toBe(false);
  } finally {
    model.dispose();
  }
});

it('uses bounded rounded segments with outward normals, UVs, and 72 triangles', () => {
  const geometry = createTacticalGeometry();
  try {
    expect(geometry.getAttribute('position').count / 3).toBe(72);
    const point = new Vector3(),
      normal = new Vector3();
    const position = geometry.getAttribute('position'),
      normals = geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i);
      normal.fromBufferAttribute(normals, i);
      expect(point.dot(normal)).toBeGreaterThan(0);
      expect(
        Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)),
      ).toBeLessThanOrEqual(0.5);
    }
    expect(geometry.getAttribute('uv').count).toBe(position.count);
  } finally {
    geometry.dispose();
  }
});
