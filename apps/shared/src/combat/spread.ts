import type { AccuracyContext, Vector3Like, WeaponConfig } from '../index';

export const degreesToRadians = Math.PI / 180;

/** Accuracy is a cone angle; camera recoil is deliberately absent from this calculation. */
export function calculateSpread(
  config: Readonly<WeaponConfig>,
  ads: number,
  bloom: number,
  context: AccuracyContext,
): number {
  const base = config.hipSpread + (config.adsSpread - config.hipSpread) * ads;
  const moving = config.movementSpread * Math.min(1.5, context.speed / 8);
  const airborne = context.grounded
    ? 0
    : context.verticalSpeed >= 0
      ? config.jumpSpread
      : config.fallSpread;
  return (
    (base + (moving + airborne + bloom) * (1 - ads * 0.45)) * degreesToRadians
  );
}

/** Uniform disk inside a tangent cone, with a reusable result and caller-supplied samples. */
export function spreadDirection(
  yaw: number,
  pitch: number,
  angle: number,
  radiusSample: number,
  phaseSample: number,
  result: Vector3Like,
): void {
  const radius = Math.sqrt(radiusSample) * Math.tan(angle);
  const phase = phaseSample * Math.PI * 2;
  const horizontal = radius * Math.cos(phase);
  const vertical = radius * Math.sin(phase);
  const sy = Math.sin(yaw),
    cy = Math.cos(yaw),
    sp = Math.sin(pitch),
    cp = Math.cos(pitch);
  result.x = -sy * cp + cy * horizontal + sy * sp * vertical;
  result.y = sp + cp * vertical;
  result.z = -cy * cp - sy * horizontal + cy * sp * vertical;
  const length = Math.hypot(result.x, result.y, result.z);
  result.x /= length;
  result.y /= length;
  result.z /= length;
}

export function shotRandom(seed: number): number {
  let value = (seed ^ 0x9e3779b9) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}
