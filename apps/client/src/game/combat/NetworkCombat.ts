import {
  weaponConfigs,
  weaponOrder,
  type WeaponInput,
} from '@breakpoint/shared';
import {
  playerCombatConfig,
  type OwnerCombat,
  type ServerShot,
  type KillEvent,
} from '@breakpoint/shared/combat';
import { WeaponController } from '../weapons/WeaponController';
import { PooledImpacts } from '../effects/PooledImpacts';
import { ShotTrails } from '../effects/ShotTrails';
import type { MovementController } from '../movement/MovementController';
import type { Scene } from 'three';
import type { CombatSnapshot } from './PracticeCombat';

const idle: WeaponInput = {
  fire: false,
  aim: false,
  firePressed: false,
  reloadPressed: false,
  switchTo: null,
};

/** Predict presentation; health, ammo readouts and hit markers only use server results. */
export class NetworkCombat {
  weapons = new WeaponController(() => {});
  owner: OwnerCombat | null = null;
  private readonly impacts: PooledImpacts;
  private readonly trails: ShotTrails;
  private readonly feed: { event: KillEvent; remaining: number }[] = [];
  constructor(
    scene: Scene,
    private readonly onChange: () => void,
    private readonly onLifeChange: () => void,
  ) {
    this.impacts = new PooledImpacts(scene);
    this.trails = new ShotTrails(scene);
  }
  receive(owner: OwnerCombat): void {
    if (this.owner && owner.life < this.owner.life) return;
    const previous = this.owner;
    const changed =
      !previous ||
      owner.life !== previous.life ||
      owner.alive !== previous.alive ||
      owner.health !== previous.health ||
      owner.protected !== previous.protected ||
      owner.selected !== previous.selected ||
      owner.reloading !== previous.reloading ||
      owner.equipping !== previous.equipping ||
      owner.hitSequence !== previous.hitSequence ||
      owner.damageSequence !== previous.damageSequence ||
      weaponOrder.some(
        (id) =>
          owner.ammo[id].magazine !== previous.ammo[id].magazine ||
          owner.ammo[id].reserve !== previous.ammo[id].reserve,
      );
    if (
      !this.owner ||
      owner.life !== this.owner.life ||
      owner.alive !== this.owner.alive
    ) {
      this.weapons = new WeaponController(() => {});
      this.onLifeChange();
    }
    this.owner = owner;
    // Local ammo gates cosmetic prediction, while the HUD reports the server's inventory.
    for (const id of weaponOrder) {
      this.weapons.ammo[id].magazine = owner.ammo[id].magazine;
      this.weapons.ammo[id].reserve = owner.ammo[id].reserve;
    }
    if (changed) this.onChange();
  }
  shot(shot: ServerShot): void {
    for (const trace of shot.traces) {
      this.trails.spawn(shot.origin, trace.end);
      if (trace.normal) this.impacts.spawn(trace.end, trace.normal);
    }
  }
  kill(event: KillEvent): void {
    if (this.feed.some((item) => item.event.id === event.id)) return;
    this.feed.push({ event, remaining: playerCombatConfig.killFeedSeconds });
    if (this.feed.length > 5) this.feed.shift();
    this.onChange();
  }
  step(dt: number, input: WeaponInput, movement: MovementController): void {
    const count = this.feed.length;
    for (const item of this.feed) item.remaining -= dt;
    while (this.feed[0] && this.feed[0].remaining <= 0) this.feed.shift();
    if (count !== this.feed.length) this.onChange();
    this.impacts.step(dt);
    this.trails.step(dt);
    this.weapons.step(dt, this.owner?.alive ? input : idle, {
      speed: Math.hypot(movement.velocity.x, movement.velocity.z),
      grounded: movement.physics.grounded,
      verticalSpeed: movement.velocity.y,
    });
  }
  snapshot(): CombatSnapshot {
    const w = this.weapons,
      owner = this.owner,
      id = owner?.selected ?? w.selected;
    const config = weaponConfigs[id];
    return {
      weapon: id,
      name: config.name,
      magazine: owner?.ammo[id].magazine ?? config.magazine,
      reserve: owner?.ammo[id].reserve ?? config.reserve,
      reloading: owner?.reloading ?? false,
      equipping: owner?.equipping ?? false,
      reloadProgress: owner?.reloadProgress ?? 0,
      ads: w.ads,
      fov: w.fov,
      spread: owner?.spread ?? w.spread,
      recoilPitch: w.recoil.pitch,
      shots: owner?.shots ?? 0,
      hitSequence: owner?.hitSequence ?? 0,
      lastDamage: owner?.lastDamage ?? 0,
      critical: owner?.critical ?? false,
      dummyHealth: 0,
      dummyResetting: false,
      ...(owner ? { player: owner } : {}),
      killFeed: this.feed.map((item) => item.event),
    };
  }
  reset(): void {
    this.owner = null;
    this.feed.length = 0;
    this.weapons = new WeaponController(() => {});
    this.impacts.clear();
    this.trails.clear();
  }
  dispose(): void {
    this.impacts.dispose();
    this.trails.dispose();
  }
}
