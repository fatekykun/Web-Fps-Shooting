import { spreadDirection, type Vector3Like } from '@breakpoint/shared';
import type { PublicPlayer } from '@breakpoint/shared/network';

const maxRange = 44;
const edgeFadeDistance = 10;
const targetRadius = 0.6;
const maxConeTangent = Math.tan((6 * Math.PI) / 180);

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

/** Slow deliberate touch input near a visible target. Never supply a look delta. */
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
    if (!targets.length) return 1;
    spreadDirection(yaw, pitch, 0, 0, 0, this.sight);
    let strongest = 0;
    for (const target of targets) {
      const x = target.x - origin.x;
      const y = target.y - origin.y;
      const z = target.z - origin.z;
      const depth = x * this.sight.x + y * this.sight.y + z * this.sight.z;
      if (depth <= 0 || depth >= maxRange) continue;
      const distanceSquared = x * x + y * y + z * z;
      const radius = Math.min(targetRadius, depth * maxConeTangent);
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
      if (!this.occluded(origin, this.direction, distance)) strongest = weight;
    }
    return 1 - strongest * (0.28 + 0.17 * ads);
  }
}
