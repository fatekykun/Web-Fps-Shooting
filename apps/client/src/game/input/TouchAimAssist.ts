import { spreadDirection, type Vector3Like } from '@breakpoint/shared';
import type { PublicPlayer } from '@breakpoint/shared/network';

const maxRange = 44;
const edgeFadeDistance = 10;
const targetRadius = 0.6;
const pullRadius = 1.25;
const maxConeTangent = Math.tan((6 * Math.PI) / 180);
const radiansPerDegree = Math.PI / 180;
const pullDeadZone = 0.15 * radiansPerDegree;

export function isTouchAimOpponent(
  owner: Pick<PublicPlayer, 'id' | 'team'>,
  target: Pick<PublicPlayer, 'id' | 'team' | 'alive' | 'protected'>,
): boolean {
  return (
    target.id !== owner.id &&
    target.alive &&
    !target.protected &&
    (owner.team === 'none' || target.team !== owner.team)
  );
}

/** Slow touch turns and gently guide the sights toward a nearby visible target. */
export class TouchAimAssist {
  private readonly sight: Vector3Like = { x: 0, y: 0, z: -1 };
  private readonly direction: Vector3Like = { x: 0, y: 0, z: -1 };

  constructor(
    private readonly occluded: (
      origin: Vector3Like,
      direction: Vector3Like,
      range: number,
    ) => boolean,
  ) {}

  scale(
    origin: Vector3Like,
    yaw: number,
    pitch: number,
    ads: number,
    targets: readonly Vector3Like[],
  ): number {
    const match = this.findTarget(origin, yaw, pitch, targets, targetRadius);
    return 1 - (match?.weight ?? 0) * (0.28 + 0.17 * ads);
  }

  correction(
    origin: Vector3Like,
    yaw: number,
    pitch: number,
    ads: number,
    targets: readonly Vector3Like[],
    dt: number,
  ): { yaw: number; pitch: number } | null {
    const match = this.findTarget(origin, yaw, pitch, targets, pullRadius);
    if (!match) return null;
    const { target, weight } = match;
    const x = target.x - origin.x;
    const y = target.y - origin.y;
    const z = target.z - origin.z;
    const yawOffset = Math.atan2(-x, -z) - yaw;
    const yawError = Math.atan2(Math.sin(yawOffset), Math.cos(yawOffset));
    const pitchError = Math.atan2(y, Math.hypot(x, z)) - pitch;
    const error = Math.hypot(yawError, pitchError);
    if (error <= pullDeadZone) return null;
    const rate = 4 + 2 * ads;
    const blend = 1 - Math.exp(-rate * weight * dt);
    const step = Math.min(
      (error - pullDeadZone) * blend,
      rate * radiansPerDegree * dt,
    );
    return {
      yaw: (yawError * step) / error,
      pitch: (pitchError * step) / error,
    };
  }

  private findTarget(
    origin: Vector3Like,
    yaw: number,
    pitch: number,
    targets: readonly Vector3Like[],
    radiusLimit: number,
  ) {
    if (!targets.length) return null;
    spreadDirection(yaw, pitch, 0, 0, 0, this.sight);
    let strongest = 0;
    let closest: Vector3Like | undefined;
    for (const target of targets) {
      const x = target.x - origin.x;
      const y = target.y - origin.y;
      const z = target.z - origin.z;
      const depth = x * this.sight.x + y * this.sight.y + z * this.sight.z;
      if (depth <= 0 || depth >= maxRange) continue;
      const distanceSquared = x * x + y * y + z * z;
      const radius = Math.min(radiusLimit, depth * maxConeTangent);
      const offsetSquared = Math.max(0, distanceSquared - depth * depth);
      if (offsetSquared >= radius * radius) continue;
      const distance = Math.sqrt(distanceSquared);
      const rangeWeight = Math.min(1, (maxRange - distance) / edgeFadeDistance);
      const t = 1 - Math.sqrt(offsetSquared) / radius;
      const weight = t * t * (3 - 2 * t) * rangeWeight;
      if (weight <= strongest) continue;
      this.direction.x = x / distance;
      this.direction.y = y / distance;
      this.direction.z = z / distance;
      if (!this.occluded(origin, this.direction, distance)) {
        strongest = weight;
        closest = target;
      }
    }
    return closest ? { target: closest, weight: strongest } : null;
  }
}
