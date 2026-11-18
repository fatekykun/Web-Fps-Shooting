import {
  shotRandom,
  spreadDirection,
  calculateDamage,
  type AccuracyContext,
  type WeaponInput,
  type Vector3Like,
  type WeaponId,
} from '@breakpoint/shared';
import type { Scene } from 'three';
import type { MovementController } from '../movement/MovementController';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { WeaponController, type ShotEvent } from '../weapons/WeaponController';
import { TrainingDummy } from './TrainingDummy';
import { PooledImpacts } from '../effects/PooledImpacts';
import type { OwnerCombat, KillEvent } from '@breakpoint/shared/combat';

export interface CombatSnapshot {
  allowedWeapons?: readonly WeaponId[];
  weapon: WeaponId;
  name: string;
  magazine: number;
  reserve: number;
  reloading: boolean;
  equipping: boolean;
  reloadProgress: number;
  cycling?: boolean;
  cycleProgress?: number;
  ads: number;
  fov: number;
  scopeMagnification?: number;
  spread: number;
  recoilPitch: number;
  shots: number;
  hitSequence: number;
  lastDamage: number;
  critical: boolean;
  dummyHealth: number;
  dummyResetting: boolean;
  player?: OwnerCombat;
  killFeed?: KillEvent[];
}

/** Single-player practice damage only. Multiplayer will replace this resolver with server results. */
export class PracticeCombat {
  readonly weapons: WeaponController;
  readonly dummy: TrainingDummy;
  private readonly impacts: PooledImpacts;
  private readonly context: AccuracyContext = {
    speed: 0,
    grounded: true,
    verticalSpeed: 0,
  };
  private readonly origin: Vector3Like = { x: 0, y: 0, z: 0 };
  private readonly direction: Vector3Like = { x: 0, y: 0, z: -1 };
  private yaw = 0;
  private pitch = 0;
  hitSequence = 0;
  lastDamage = 0;
  critical = false;

  constructor(
    private readonly physics: PhysicsWorld,
    scene: Scene,
    private readonly onChange: () => void,
  ) {
    this.dummy = new TrainingDummy(physics, scene);
    this.impacts = new PooledImpacts(scene);
    this.weapons = new WeaponController(this.fire, onChange);
  }

  step(
    dt: number,
    input: WeaponInput,
    movement: MovementController,
    yaw: number,
    pitch: number,
  ): void {
    this.context.speed = Math.hypot(movement.velocity.x, movement.velocity.z);
    this.context.grounded = this.physics.grounded;
    this.context.verticalSpeed = movement.velocity.y;
    this.origin.x = this.physics.position.x;
    this.origin.y = this.physics.position.y + movement.eyeOffset;
    this.origin.z = this.physics.position.z;
    this.yaw = yaw;
    this.pitch = pitch;
    const wasResetting = this.dummy.resetting;
    this.dummy.step(dt);
    this.impacts.step(dt);
    this.weapons.step(dt, input, this.context);
    if (wasResetting !== this.dummy.resetting) this.onChange();
  }

  private readonly fire = (shot: ShotEvent): void => {
    let damage = 0;
    let critical = false;
    for (let pellet = 0; pellet < shot.config.pellets; pellet++) {
      const seed = shot.sequence * 131 + pellet * 11;
      spreadDirection(
        this.yaw + this.weapons.recoil.yaw,
        Math.max(-1.55, Math.min(1.55, this.pitch + this.weapons.recoil.pitch)),
        shot.spread,
        shotRandom(seed),
        shotRandom(seed + 1),
        this.direction,
      );
      const hit = this.physics.castBullet(
        this.origin,
        this.direction,
        shot.config.range,
      );
      if (!hit) continue;
      this.impacts.spawn(hit.point, hit.normal);
      const region = this.dummy.region(hit.colliderHandle);
      if (region && !this.dummy.resetting) {
        const meters = Math.hypot(
          hit.point.x - this.origin.x,
          hit.point.y - this.origin.y,
          hit.point.z - this.origin.z,
        );
        damage += calculateDamage(shot.config, region, meters);
        critical ||= region === 'head';
      }
    }
    if (damage > 0) {
      this.lastDamage = Math.min(damage, this.dummy.health);
      this.critical = critical;
      this.hitSequence++;
      this.dummy.damage(damage);
    }
  };

  snapshot(): CombatSnapshot {
    const weapons = this.weapons;
    return {
      weapon: weapons.selected,
      name: weapons.config.name,
      magazine: weapons.current.magazine,
      reserve: weapons.current.reserve,
      reloading: weapons.reloading,
      equipping: weapons.equipping,
      reloadProgress: weapons.reloadProgress,
      cycling: weapons.cycling,
      cycleProgress: weapons.cycleProgress,
      ads: weapons.ads,
      fov: weapons.fov,
      scopeMagnification: weapons.config.scopeMagnification,
      spread: weapons.spread,
      recoilPitch: weapons.recoil.pitch,
      shots: weapons.shotsFired,
      hitSequence: this.hitSequence,
      lastDamage: this.lastDamage,
      critical: this.critical,
      dummyHealth: this.dummy.health,
      dummyResetting: this.dummy.resetting,
    };
  }

  setOnline(online: boolean): void {
    this.dummy.setVisible(!online);
    this.impacts.clear();
  }

  dispose(): void {
    this.dummy.dispose();
    this.impacts.dispose();
  }
}
