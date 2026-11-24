import { degreesToRadians, shotRandom } from '../combat/spread';
import type { RecoilProfile } from '../types/weapons';

export interface RecoilAxes {
  pitch: number;
  yaw: number;
}

/** Analytic two-pole spring. Equal rates give critical damping. */
export class RecoilSpring {
  readonly position: RecoilAxes = { pitch: 0, yaw: 0 };
  private pitchDrive = 0;
  private yawDrive = 0;
  private attack = 74;
  private recovery = 13;
  private hold = 0;

  rates(attack: number, recovery: number): void {
    this.attack = attack;
    this.recovery = recovery;
  }

  impulse(
    pitch: number,
    yaw: number,
    pitchLimit: number,
    yawLimit: number,
    hold = 0,
  ): void {
    // A lower limit on a new ADS shot should not pull recoil from older shots back down.
    this.pitchDrive = Math.min(
      Math.max(pitchLimit, this.pitchDrive),
      this.pitchDrive + pitch,
    );
    this.yawDrive = Math.max(
      Math.min(-yawLimit, this.yawDrive),
      Math.min(Math.max(yawLimit, this.yawDrive), this.yawDrive + yaw),
    );
    this.hold = hold;
  }

  sample(dt: number, out: RecoilAxes): RecoilAxes {
    let { pitch, yaw } = this.position;
    const held = Math.min(dt, this.hold);
    if (held > 0) {
      const blend = -Math.expm1(-this.attack * held);
      pitch += (this.pitchDrive - pitch) * blend;
      yaw += (this.yawDrive - yaw) * blend;
      dt -= held;
    }
    if (
      dt <= 0 ||
      Math.abs(pitch) +
        Math.abs(yaw) +
        Math.abs(this.pitchDrive) +
        Math.abs(this.yawDrive) ===
        0
    ) {
      out.pitch = pitch;
      out.yaw = yaw;
      return out;
    }
    const rise = Math.exp(-this.attack * dt);
    const difference = this.attack - this.recovery;
    const drive =
      Math.abs(difference) < 1e-5
        ? this.attack * dt * rise
        : (this.attack * (Math.exp(-this.recovery * dt) - rise)) / difference;
    out.pitch = pitch * rise + this.pitchDrive * drive;
    out.yaw = yaw * rise + this.yawDrive * drive;
    return out;
  }

  step(dt: number): void {
    this.sample(dt, this.position);
    const decay = Math.exp(-this.recovery * Math.max(0, dt - this.hold));
    this.hold = Math.max(0, this.hold - dt);
    this.pitchDrive *= decay;
    this.yawDrive *= decay;
    if (
      Math.abs(this.position.pitch) +
        Math.abs(this.position.yaw) +
        Math.abs(this.pitchDrive) +
        Math.abs(this.yawDrive) <
      1e-8
    )
      this.reset();
  }

  reset(): void {
    this.hold = 0;
    this.position.pitch =
      this.position.yaw =
      this.pitchDrive =
      this.yawDrive =
        0;
  }
}

/** Deterministic shot pattern and camera offset shared by training, prediction and the server. */
export class Recoil {
  private readonly spring = new RecoilSpring();
  readonly shot: RecoilAxes = { pitch: 0, yaw: 0 };
  private sequence = 0;
  private lastShot = -Infinity;

  get pitch(): number {
    return this.spring.position.pitch;
  }
  get yaw(): number {
    return this.spring.position.yaw;
  }

  step(dt: number): void {
    this.spring.step(dt);
  }

  sample(dt: number, out: RecoilAxes): RecoilAxes {
    return this.spring.sample(dt, out);
  }

  kick(
    profile: Readonly<RecoilProfile>,
    time: number,
    ads: number,
    hold = 0,
  ): void {
    if (time - this.lastShot >= profile.resetDelay) this.sequence = 0;
    const index = this.sequence++;
    this.lastShot = time;
    const [vertical, horizontal] = profile.pattern[
      index % profile.pattern.length
    ] ?? [1, 0];
    const buildup = Math.min(
      index / Math.max(1, profile.pattern.length - 1),
      1,
    );
    const strength =
      index === 0
        ? profile.firstShotMultiplier
        : 1 + (profile.sustainedMultiplier - 1) * buildup;
    const variation =
      (shotRandom(23 + index * 91) * 2 - 1) * profile.randomness;
    this.shot.pitch = Math.max(0, vertical + variation * 0.5) * strength;
    this.shot.yaw = (horizontal + variation) * strength;

    const aimScale =
      profile.hipMultiplier +
      (profile.adsMultiplier - profile.hipMultiplier) * ads;
    const cameraScale = aimScale * profile.cameraKick * degreesToRadians;
    this.spring.rates(profile.cameraAttack, profile.cameraRecovery);
    this.spring.impulse(
      this.shot.pitch * profile.vertical * cameraScale,
      this.shot.yaw * profile.horizontal * cameraScale,
      profile.maxVertical * aimScale * degreesToRadians,
      profile.maxHorizontal * aimScale * degreesToRadians,
      hold,
    );
  }

  resetPattern(): void {
    this.lastShot = -Infinity;
  }

  reset(): void {
    this.resetPattern();
    this.spring.reset();
  }
}
