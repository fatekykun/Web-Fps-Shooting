/** The CSS viewport and the perspective matrix project the same tangent disk as the pellet rays. */
export function projectConeRadius(
  halfAngle: number,
  viewportHeight: number,
  projectionScaleY: number,
): number {
  return 0.5 * viewportHeight * projectionScaleY * Math.tan(halfAngle);
}

export class ShotgunReticle {
  private angle = 0;

  reset(): void {
    this.angle = 0;
  }

  update(actual: number, dt: number, reducedMotion: boolean): number {
    // Never undershoot the live cone. Only contraction can lag, in angular space.
    this.angle =
      reducedMotion || actual >= this.angle
        ? actual
        : actual + (this.angle - actual) * Math.exp(-dt / 0.05);
    return this.angle;
  }
}
