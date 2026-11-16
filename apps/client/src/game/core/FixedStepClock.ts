import { movementConfig } from '@breakpoint/shared';

export class FixedStepClock {
  private accumulator = 0;

  advance(delta: number, step: (dt: number) => void): number {
    this.accumulator += Math.min(
      Math.max(0, delta),
      movementConfig.maxFrameDelta,
    );
    let steps = 0;
    while (
      this.accumulator + 1e-10 >= movementConfig.fixedStep &&
      steps < movementConfig.maxSubsteps
    ) {
      step(movementConfig.fixedStep);
      this.accumulator -= movementConfig.fixedStep;
      steps++;
    }
    // Drop excess time instead of creating a catch-up spiral after suspension.
    if (steps === movementConfig.maxSubsteps)
      this.accumulator %= movementConfig.fixedStep;
    return Math.max(
      0,
      Math.min(1, this.accumulator / movementConfig.fixedStep),
    );
  }

  reset(): void {
    this.accumulator = 0;
  }
}
