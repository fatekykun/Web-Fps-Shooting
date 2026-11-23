import {
  weaponConfigs,
  weaponOrder,
  type WeaponInput,
  type WeaponId,
} from '@breakpoint/shared';
import {
  playerCombatConfig,
  type OwnerCombat,
  type ServerShot,
  type KillEvent,
} from '@breakpoint/shared/combat';
import { WeaponController } from '../weapons/WeaponController';
import { PooledImpacts } from '../effects/PooledImpacts';
import type { MovementController } from '../movement/MovementController';
import type { Scene } from 'three';
import type { CombatSnapshot } from './PracticeCombat';

const idle: WeaponInput = {
  fire: false,
  aim: false,
  firePressed: false,
  reloadPressed: false,
  switchTo: null,
  autoReload: false,
};

/** Predict presentation; health, ammo readouts and hit markers only use server results. */
export class NetworkCombat {
  allowedWeapons: readonly WeaponId[] = weaponOrder;
  setAllowedWeapons(weapons: readonly WeaponId[]): void {
    this.allowedWeapons = weapons.length ? weapons : weaponOrder;
    if (!this.allowedWeapons.includes(this.weapons.selected))
      this.weapons.switchWeapon(this.allowedWeapons[0]!);
  }
  filterInput(input: WeaponInput): WeaponInput {
    return input.switchTo && !this.allowedWeapons.includes(input.switchTo)
      ? { ...input, switchTo: null }
      : input;
  }
  weapons = new WeaponController(() => {});
  owner: OwnerCombat | null = null;
  private readonly impacts: PooledImpacts;
  private readonly seenShots = new Set<number>();
  private readonly feed: { event: KillEvent; remaining: number }[] = [];
  constructor(
    scene: Scene,
    private readonly onChange: () => void,
    private readonly onLifeChange: () => void,
  ) {
    this.impacts = new PooledImpacts(scene);
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
      owner.nextWeapon !== previous.nextWeapon ||
      owner.reloading !== previous.reloading ||
      owner.equipping !== previous.equipping ||
      owner.cycling !== previous.cycling ||
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
      this.weapons.selected = owner.selected;
      this.onLifeChange();
    }
    this.owner = owner;
    if (
      owner.selected === this.weapons.selected &&
      owner.cycling &&
      !this.weapons.cycling
    ) {
      this.weapons.current.cycleEnd =
        this.weapons.time +
        (1 - owner.cycleProgress) * (this.weapons.config.boltCycleTime ?? 0);
      this.weapons.current.nextShot = Math.max(
        this.weapons.current.nextShot,
        this.weapons.current.cycleEnd,
      );
    }
    // Local ammo gates cosmetic prediction, while the HUD reports the server's inventory.
    for (const id of weaponOrder) {
      this.weapons.ammo[id].magazine = owner.ammo[id].magazine;
      this.weapons.ammo[id].reserve = owner.ammo[id].reserve;
    }
    // Follow confirmed reload progress/completion without undoing a locally
    // predicted shoot-to-cancel on unchanged, older reload snapshots.
    const reloadChanged =
      !previous ||
      owner.life !== previous.life ||
      owner.selected !== previous.selected ||
      owner.reloading !== previous.reloading;
    if (
      owner.selected === this.weapons.selected &&
      (reloadChanged || (owner.reloading && this.weapons.reloading))
    ) {
      this.weapons.synchronizeReload(owner.reloading, owner.reloadProgress);
    }
    if (changed) this.onChange();
  }
  shot(shot: ServerShot): boolean {
    if (this.seenShots.has(shot.id)) return false;
    this.seenShots.add(shot.id);
    if (this.seenShots.size > 128)
      this.seenShots.delete(this.seenShots.values().next().value!);
    for (const trace of shot.traces) {
      if (trace.normal) this.impacts.spawn(trace.end, trace.normal);
    }
    return true;
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
    this.weapons.step(dt, this.owner?.alive ? this.filterInput(input) : idle, {
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
      allowedWeapons: this.allowedWeapons,
      weapon: id,
      name: config.name,
      magazine: owner?.ammo[id].magazine ?? config.magazine,
      reserve: owner?.ammo[id].reserve ?? config.reserve,
      reloading: owner?.reloading ?? false,
      equipping: owner?.equipping ?? false,
      reloadProgress: owner?.reloadProgress ?? 0,
      cycling: owner?.cycling ?? false,
      cycleProgress: owner?.cycleProgress ?? 0,
      ads: w.ads,
      fov: w.fov,
      scopeMagnification: config.scopeMagnification,
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
    this.allowedWeapons = weaponOrder;
    this.owner = null;
    this.feed.length = 0;
    this.weapons = new WeaponController(() => {});
    this.impacts.clear();
    this.seenShots.clear();
  }
  dispose(): void {
    this.impacts.dispose();
  }
}
