import type { MovementState } from '../types/movement';
import { strideRadiansPerMeter } from './weaponHandling';

export const animationFields = [
  'animationTime',
  'gaitPhase',
  'gaitAmount',
  'sprintBlend',
  'carryBlend',
  'fireBlend',
  'airBlend',
  'slideBlend',
  'diveBlend',
  'crouchBlend',
  'proneBlend',
  'landingBlend',
  'reloadBlend',
  'reloadProgress',
  'aimBlend',
  'hitBlend',
  'hitYaw',
] as const;
export type CharacterAnimationValues = Record<
  (typeof animationFields)[number],
  number
>;
const damp = (value: number, target: number, dt: number, rate = 12) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));

/** Fixed-tick presentation state, owned by the server alongside the movement capsule. */
export class CharacterAnimation {
  readonly values: CharacterAnimationValues = Object.fromEntries(
    animationFields.map((key) => [key, 0]),
  ) as CharacterAnimationValues;
  private grounded = true;
  private sprinting = false;

  reset(): void {
    for (const key of animationFields) this.values[key] = 0;
    this.grounded = true;
    this.sprinting = false;
  }

  step(
    dt: number,
    speed: number,
    grounded: boolean,
    movement: MovementState,
  ): void {
    const v = this.values;
    v.animationTime += dt;
    const locomotion =
      grounded &&
      (movement === 'walking' ||
        movement === 'sprinting' ||
        movement === 'crouching' ||
        movement === 'prone');
    this.sprinting = movement === 'sprinting' && speed > 0.5;
    v.gaitAmount = damp(
      v.gaitAmount,
      locomotion ? Math.min(1, speed / 6) : 0,
      dt,
    );
    if (locomotion)
      v.gaitPhase =
        (v.gaitPhase + speed * dt * strideRadiansPerMeter) % (2 * Math.PI);
    v.sprintBlend = damp(
      v.sprintBlend,
      movement === 'sprinting' && speed > 0.5 ? 1 : 0,
      dt,
    );
    v.airBlend = damp(
      v.airBlend,
      !grounded && movement !== 'diving' ? 1 : 0,
      dt,
    );
    v.slideBlend = damp(
      v.slideBlend,
      movement === 'sliding' || movement === 'backsliding' ? 1 : 0,
      dt,
      16,
    );
    v.diveBlend = damp(v.diveBlend, movement === 'diving' ? 1 : 0, dt, 16);
    v.crouchBlend = damp(
      v.crouchBlend,
      movement === 'crouching' ? 1 : 0,
      dt,
      18,
    );
    v.proneBlend = damp(v.proneBlend, movement === 'prone' ? 1 : 0, dt, 14);
    v.landingBlend =
      !this.grounded && grounded ? 1 : v.landingBlend * Math.exp(-10 * dt);
    v.hitBlend *= Math.exp(-10 * dt);
    v.fireBlend *= Math.exp(-18 * dt);
    this.grounded = grounded;
  }

  weapon(
    dt: number,
    reloading: boolean,
    progress: number,
    ads: number,
    canCarry = true,
  ): void {
    const v = this.values;
    v.reloadBlend = damp(
      v.reloadBlend,
      reloading ? 1 : 0,
      dt,
      reloading ? 12 : 18,
    );
    if (reloading) v.reloadProgress = progress;
    else if (v.reloadBlend < 0.001) v.reloadProgress = 0;
    v.aimBlend = ads;
    const carrying = this.sprinting && canCarry && !reloading && ads < 0.01;
    v.carryBlend = damp(v.carryBlend, carrying ? 1 : 0, dt, carrying ? 12 : 18);
  }

  fire(): void {
    this.values.fireBlend = 1;
  }

  hit(yaw: number): void {
    this.values.hitBlend = 1;
    this.values.hitYaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  }
}
