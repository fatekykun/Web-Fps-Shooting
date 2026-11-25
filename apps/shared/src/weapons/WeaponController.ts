import {
  calculateSpread,
  combatConfig,
  movementConfig,
  weaponConfigs,
  weaponOrder,
  type AccuracyContext,
  type WeaponConfig,
  type WeaponId,
  type WeaponInput,
} from '../index';
import { Recoil } from './Recoil';

const syncedAdsZoomFraction = 0.35;
const syncedScopeMagnificationScale = 0.7;

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
  autoReload = true;
  private reloadEnd = 0;
  private equipEnd = 0;
  private fireBuffer = 0;
  private burstRemaining = 0;
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

  scopeMagnification(syncAdsFov = false): number | undefined {
    const magnification = this.config.scopeMagnification;
    return magnification && syncAdsFov
      ? Math.max(1, magnification * syncedScopeMagnificationScale)
      : magnification;
  }

  fieldOfView(base: number, ads = this.ads, syncAdsFov = false): number {
    const magnification = this.scopeMagnification(syncAdsFov);
    const target = magnification
      ? (Math.atan(Math.tan((base * Math.PI) / 360) / magnification) * 360) /
        Math.PI
      : syncAdsFov
        ? base - Math.max(0, base - this.config.adsFov) * syncedAdsZoomFraction
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
    this.ads = this.sampleAds(dt, aiming);
  }

  sampleAds(dt: number, aiming: boolean): number {
    const target = aiming && !this.reloading && !this.equipping ? 1 : 0;
    return (
      target +
      (this.ads - target) *
        Math.exp((-Math.LN10 * Math.min(dt, 0.1)) / this.config.adsTime)
    );
  }

  switchWeapon(id: WeaponId): void {
    if (id === this.selected) return;
    if (this.config.scopeMagnification || weaponConfigs[id].scopeMagnification)
      this.ads = 0;
    this.selected = id;
    this.reloadEnd = 0;
    this.equipEnd = this.time + combatConfig.equipTime;
    this.clearTriggerBuffer();
    this.recoil.resetPattern();
    this.onChange();
  }

  reload(): boolean {
    if (
      this.reloading ||
      this.equipping ||
      this.current.magazine >= this.config.magazine ||
      this.current.reserve <= 0
    )
      return false;
    this.reloadEnd = this.time + this.config.reloadTime;
    this.clearTriggerBuffer();
    this.onChange();
    return true;
  }

  /** Presentation correction only; ammo always comes from the authoritative owner snapshot. */
  synchronizeReload(reloading: boolean, progress: number): void {
    if (reloading) this.burstRemaining = 0;
    this.reloadEnd = reloading
      ? this.time +
        (1 - Math.max(0, Math.min(1, progress))) * this.config.reloadTime
      : 0;
  }

  clearTriggerBuffer(): void {
    this.fireBuffer = 0;
    this.burstRemaining = 0;
  }

  spreadFor(context: AccuracyContext): number {
    return calculateSpread(this.config, this.ads, this.current.bloom, context);
  }

  step(dt: number, input: WeaponInput, context: AccuracyContext): void {
    this.time += dt;
    if (input.autoReload !== undefined) this.autoReload = input.autoReload;
    for (const id of weaponOrder) {
      const ammo = this.ammo[id];
      if (this.time - ammo.lastShot > combatConfig.bloomRecoveryDelay)
        ammo.bloom = Math.max(
          0,
          ammo.bloom - weaponConfigs[id].bloomRecovery * dt,
        );
    }
    this.recoil.step(dt);
    if (input.switchTo) this.switchWeapon(input.switchTo);
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
    if (input.reloadPressed) this.reload();
    // Fresh presses interrupt partial reloads. Empty reloads must finish, and
    // completion is processed first so a press on that tick uses the loaded rounds.
    if (
      this.reloading &&
      (input.firePressed || input.aimPressed) &&
      this.current.magazine > 0
    ) {
      this.reloadEnd = 0;
      this.onChange();
    }
    if (this.autoReload && this.current.magazine === 0 && !this.reloading)
      this.reload();
    this.spread = this.spreadFor(context);
    this.fireBuffer = input.firePressed
      ? combatConfig.fireBuffer
      : Math.max(0, this.fireBuffer - dt);
    if (this.reloading || this.equipping || this.cycling) {
      this.fireBuffer = 0;
      return;
    }
    const wantsFire =
      this.fireBuffer > 0 ||
      this.burstRemaining > 0 ||
      (this.config.automatic && !this.config.burstSize && input.fire);
    if (
      !wantsFire ||
      this.current.magazine === 0 ||
      this.time + 1e-9 < this.current.nextShot
    )
      return;
    this.fireBuffer = 0;
    this.burstRemaining =
      this.burstRemaining > 0
        ? this.burstRemaining - 1
        : Math.min(
            this.current.magazine - 1,
            Math.max(0, Math.floor(this.config.burstSize ?? 1) - 1),
          );
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
    const profile = this.config.recoil;
    // Keep the camera climbing between rounds in a spray. The extra tick covers cadence rounding.
    const hold =
      this.config.automatic || (this.config.burstSize ?? 1) > 1
        ? Math.min(
            profile.resetDelay,
            this.config.fireInterval + movementConfig.fixedStep,
          )
        : 0;
    this.recoil.kick(profile, this.time, this.ads, hold);
    const autoStarted =
      this.autoReload && this.current.magazine === 0 && this.reload();
    if (!autoStarted) this.onChange();
  }
}
