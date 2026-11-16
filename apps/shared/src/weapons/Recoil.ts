import { combatConfig, degreesToRadians, type WeaponConfig } from '../index';

/** Recovering aim displacement, independent of random bullet dispersion. */
export class Recoil {
  pitch = 0;
  yaw = 0;

  step(dt: number, recovery: number): void {
    const decay = Math.exp(-recovery * dt);
    this.pitch *= decay;
    this.yaw *= decay;
  }

  kick(
    config: Readonly<WeaponConfig>,
    lateralSample: number,
    ads: number,
  ): void {
    const scale = 1 - ads * 0.2;
    this.pitch = Math.min(
      combatConfig.maxRecoilPitch * degreesToRadians,
      this.pitch + config.recoilPitch * degreesToRadians * scale,
    );
    this.yaw = Math.max(
      -combatConfig.maxRecoilYaw * degreesToRadians,
      Math.min(
        combatConfig.maxRecoilYaw * degreesToRadians,
        this.yaw +
          (lateralSample * 2 - 1) * config.recoilYaw * degreesToRadians * scale,
      ),
    );
  }
}
