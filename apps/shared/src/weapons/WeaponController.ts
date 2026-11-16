import {
  calculateSpread,
  combatConfig,
  shotRandom,
  weaponConfigs,
  weaponOrder,
  type AccuracyContext,
  type WeaponConfig,
  type WeaponId,
  type WeaponInput,
} from '../index';
import { Recoil } from './Recoil';

interface WeaponAmmo {
  magazine: number;
  reserve: number;
  nextShot: number;
  bloom: number;
  lastShot: number;
  cycleEnd: number;
}
export interface ShotEvent {
  config: Readonly<WeaponConfig>;
  spread: number;
  sequence: number;
}

/** Shared weapon timing and inventory rules. The server alone resolves multiplayer hits/damage. */
export class WeaponController {
  readonly recoil = new Recoil();
  readonly ammo: Record<WeaponId, WeaponAmmo> = {
    rifle: this.createAmmo('rifle'),
    smg: this.createAmmo('smg'),
    shotgun: this.createAmmo('shotgun'),
    sniper: this.createAmmo('sniper'),
  };
  selected: WeaponId = 'rifle';
  ads = 0;
  spread = (weaponConfigs.rifle.hipSpread * Math.PI) / 180;
  shotsFired = 0;
  time = 0;
  private reloadEnd = 0;
  private equipEnd = 0;
  private fireBuffer = 0;
  private readonly shot: ShotEvent = {
    config: weaponConfigs.rifle,
    spread: 0,
    sequence: 0,
  };

  constructor(
    private readonly onShot: (shot: ShotEvent) => void,
    private readonly onChange: () => void = () => {},
  ) {}
  get config() {
    return weaponConfigs[this.selected];
  }
  get current() {
    return this.ammo[this.selected];
  }
  get reloading(): boolean {
    return this.reloadEnd > 0;
  }
  get equipping(): boolean {
    return this.time < this.equipEnd;
  }
  get equipLowering(): number {
    return Math.max(0, (this.equipEnd - this.time) / combatConfig.equipTime);
  }
  get reloadProgress(): number {
    return this.reloading
      ? 1 - Math.max(0, this.reloadEnd - this.time) / this.config.reloadTime
      : 0;
  }
  get fov(): number {
    return this.fieldOfView(combatConfig.baseFov);
  }

  fieldOfView(base: number, ads = this.ads): number {
    const target = this.config.scopeMagnification
      ? (Math.atan(
          Math.tan((base * Math.PI) / 360) / this.config.scopeMagnification,
        ) *
          360) /
        Math.PI
      : this.config.adsFov;
    return base + (target - base) * ads;
  }
  get cycling(): boolean {
    return this.time + 1e-9 < this.current.cycleEnd;
  }
  get cycleProgress(): number {
    return this.cycling
      ? 1 - (this.current.cycleEnd - this.time) / this.config.boltCycleTime!
      : 0;
  }
  movementScale(
    aim: boolean,
    input: { sprint?: boolean; slidePressed?: boolean; divePressed?: boolean },
    state: string,
  ): number {
    return aim &&
      !this.reloading &&
      !this.equipping &&
      state === 'walking' &&
      !input.sprint &&
      !input.slidePressed &&
      !input.divePressed
      ? (this.config.scopedMovementScale ?? 1)
      : 1;
  }

  private createAmmo(id: WeaponId): WeaponAmmo {
    return {
      magazine: weaponConfigs[id].magazine,
      reserve: weaponConfigs[id].reserve,
      nextShot: 0,
      bloom: 0,
      lastShot: -100,
      cycleEnd: 0,
    };
  }

  updateAds(dt: number, aiming: boolean): void {
    const target = aiming && !this.reloading && !this.equipping ? 1 : 0;
    this.ads +=
      (target - this.ads) *
      (1 - Math.exp((-Math.LN10 * Math.min(dt, 0.1)) / this.config.adsTime));
  }

  switchWeapon(id: WeaponId): void {
    if (id === this.selected) return;
    if (this.config.scopeMagnification || weaponConfigs[id].scopeMagnification)
      this.ads = 0;
    this.selected = id;
    this.reloadEnd = 0;
    this.equipEnd = this.time + combatConfig.equipTime;
    this.fireBuffer = 0;
    this.onChange();
  }

  reload(): void {
    if (
      this.reloading ||
      this.equipping ||
      this.current.magazine >= this.config.magazine ||
      this.current.reserve <= 0
    )
      return;
    this.reloadEnd = this.time + this.config.reloadTime;
    this.fireBuffer = 0;
    this.onChange();
  }

  clearTriggerBuffer(): void {
    this.fireBuffer = 0;
  }

  step(dt: number, input: WeaponInput, context: AccuracyContext): void {
    this.time += dt;
    for (const id of weaponOrder) {
      const ammo = this.ammo[id];
      if (this.time - ammo.lastShot > combatConfig.bloomRecoveryDelay)
        ammo.bloom = Math.max(
          0,
          ammo.bloom - weaponConfigs[id].bloomRecovery * dt,
        );
    }
    this.recoil.step(dt, this.config.recoilRecovery);
    if (input.switchTo) this.switchWeapon(input.switchTo);
    if (input.reloadPressed) this.reload();
    if (this.reloading && this.time + 1e-9 >= this.reloadEnd) {
      const amount = Math.min(
        this.config.magazine - this.current.magazine,
        this.current.reserve,
      );
      this.current.magazine += amount;
      this.current.reserve -= amount;
      this.reloadEnd = 0;
      this.onChange();
    }
    this.spread = calculateSpread(
      this.config,
      this.ads,
      this.current.bloom,
      context,
    );
    this.fireBuffer = input.firePressed
      ? combatConfig.fireBuffer
      : Math.max(0, this.fireBuffer - dt);
    if (this.reloading || this.equipping || this.cycling) {
      this.fireBuffer = 0;
      return;
    }
    const wantsFire =
      this.fireBuffer > 0 || (this.config.automatic && input.fire);
    if (
      !wantsFire ||
      this.current.magazine === 0 ||
      this.time + 1e-9 < this.current.nextShot
    )
      return;
    this.fireBuffer = 0;
    this.current.magazine--;
    this.current.nextShot = this.time + this.config.fireInterval;
    this.current.lastShot = this.time;
    this.current.cycleEnd = this.time + (this.config.boltCycleTime ?? 0);
    this.shotsFired++;
    this.shot.config = this.config;
    this.shot.spread = this.spread;
    this.shot.sequence = this.shotsFired;
    // The bullet leaves along the current aim; its recoil impulse moves subsequent aim.
    this.onShot(this.shot);
    this.current.bloom = Math.min(
      this.config.maxBloom,
      this.current.bloom + this.config.bloomPerShot,
    );
    this.recoil.kick(this.config, shotRandom(this.shotsFired * 17), this.ads);
    this.onChange();
  }
}
