import type {
  DamageRangePoint,
  HitRegion,
  WeaponConfig,
} from '../types/weapons';

/** Piecewise linear curve in meters. Empty is an explicit no-falloff profile. */
export function rangeDamageMultiplier(
  profile: readonly Readonly<DamageRangePoint>[],
  distance: number,
): number {
  if (!Number.isFinite(distance) || distance < 0) return 0;
  if (!profile.length) return 1;
  let previous = profile[0]!;
  if (distance <= previous.distance) return previous.multiplier;
  for (let i = 1; i < profile.length; i++) {
    const next = profile[i]!;
    if (distance <= next.distance) {
      const t =
        (distance - previous.distance) / (next.distance - previous.distance);
      return previous.multiplier + (next.multiplier - previous.multiplier) * t;
    }
    previous = next;
  }
  return previous.multiplier;
}

/** Shared training/server rule. Keep fractional health; round only UI text. */
export function calculateDamage(
  config: Readonly<WeaponConfig>,
  region: HitRegion,
  distance: number,
): number {
  const body = config.bodyMultipliers[region];
  if (
    !Number.isFinite(distance) ||
    distance < 0 ||
    distance > config.range ||
    !Number.isFinite(body)
  )
    return 0;
  return (
    config.damage * body * rangeDamageMultiplier(config.damageFalloff, distance)
  );
}
