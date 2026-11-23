import { randomInt } from 'node:crypto';
import {
  movementConfig,
  weaponOrder,
  shotRandom,
  spreadDirection,
  calculateDamage,
  type WeaponInput,
  type WeaponId,
  type Vector3Like,
} from '@breakpoint/shared';
import {
  WeaponController,
  type ShotEvent,
} from '@breakpoint/shared/weapons/WeaponController';
import { intersectAvatar } from '@breakpoint/shared/avatar';
import {
  playerCombatConfig,
  type OwnerCombat,
  type ServerShot,
  type KillEvent,
} from '@breakpoint/shared/combat';
import type { ServerPlayer } from '../players/ServerPlayer';
import { spawnCandidates, type GameMode } from '@breakpoint/shared/match';
import type { ArenaSpawn } from '@breakpoint/shared/maps';

const neutral = (): WeaponInput => ({
  fire: false,
  aim: false,
  firePressed: false,
  reloadPressed: false,
  switchTo: null,
});
interface Loadout {
  weapons: WeaponController;
  nextWeapon?: WeaponId;
  owned: Set<WeaponId>;
  seed: number;
  held: WeaponInput;
  inputTick: number;
  respawnTick: number;
  shieldUntil: number;
  hitSequence: number;
  lastDamage: number;
  critical: boolean;
  damageSequence: number;
  yaw: number;
  pitch: number;
}
interface PendingShot {
  player: ServerPlayer;
  shot: ShotEvent;
  origin: Vector3Like;
  yaw: number;
  pitch: number;
  seed: number;
}

/** Receives validated controls, never client hits, ammo, rays, timestamps or damage. */
export class ServerCombat {
  private readonly loadouts = new Map<string, Loadout>();
  private readonly pending: PendingShot[] = [];
  private shotId = 0;
  private killId = 0;
  private tick = 0;
  private mode: GameMode = 'ffa';
  private allowedWeapons: readonly WeaponId[] = weaponOrder;

  setAllowedWeapons(weapons: readonly WeaponId[]): void {
    if (
      !weapons.length ||
      new Set(weapons).size !== weapons.length ||
      weapons.some((id) => !weaponOrder.includes(id))
    )
      throw new Error('Invalid room weapon loadout.');
    this.allowedWeapons = weaponOrder.filter((id) => weapons.includes(id));
    for (const [id, loadout] of this.loadouts) {
      loadout.owned = new Set(this.allowedWeapons);
      if (!loadout.owned.has(loadout.weapons.selected))
        loadout.weapons.switchWeapon(this.allowedWeapons[0]!);
      this.players.get(id)!.state.weapon = loadout.weapons.selected;
    }
  }

  setMode(mode: GameMode): void {
    this.mode = mode;
  }

  constructor(
    private readonly players: ReadonlyMap<string, ServerPlayer>,
    private readonly onShot: (shot: ServerShot) => void,
    private readonly onKill: (kill: KillEvent) => void,
    private readonly seed = () => randomInt(0x7fffffff),
  ) {}

  add(player: ServerPlayer): void {
    const previous = this.loadouts.get(player.state.id);
    const selected = previous?.nextWeapon ?? previous?.weapons.selected;
    player.state.protected = false;
    const loadout: Loadout = {
      weapons: new WeaponController((shot) =>
        this.queueShot(player, loadout, shot),
      ),
      owned: new Set(this.allowedWeapons),
      seed: this.seed(),
      held: neutral(),
      inputTick: -100,
      respawnTick: 0,
      shieldUntil: 0,
      hitSequence: 0,
      lastDamage: 0,
      critical: false,
      damageSequence: 0,
      yaw: player.state.yaw,
      pitch: player.state.pitch,
    };
    loadout.weapons.selected =
      selected && loadout.owned.has(selected)
        ? selected
        : this.allowedWeapons[0]!;
    player.state.weapon = loadout.weapons.selected;
    this.loadouts.set(player.state.id, loadout);
    player.movementScale = (input) =>
      loadout.weapons.movementScale(
        !!input.weapon?.aim,
        input,
        player.movement.state,
      );
  }

  selectLoadout(player: ServerPlayer, weapon: unknown): void {
    const loadout = this.loadouts.get(player.state.id);
    if (loadout && loadout.owned.has(weapon as WeaponId))
      loadout.nextWeapon = weapon as WeaponId;
  }
  remove(id: string): void {
    this.loadouts.delete(id);
  }
  get(id: string): Loadout | undefined {
    return this.loadouts.get(id);
  }

  step(tick: number): void {
    this.tick = tick;
    this.pending.length = 0;
    for (const player of this.players.values()) {
      const loadout = this.loadouts.get(player.state.id)!;
      if (!player.state.alive) {
        if (tick < loadout.respawnTick) continue;
        player.respawn(this.chooseSpawn(player));
        const selected = loadout.nextWeapon ?? loadout.weapons.selected;
        loadout.nextWeapon = undefined;
        loadout.weapons = new WeaponController((shot) =>
          this.queueShot(player, loadout, shot),
        );
        loadout.weapons.selected = loadout.owned.has(selected)
          ? selected
          : this.allowedWeapons[0]!;
        loadout.seed = this.seed();
        loadout.held = neutral();
        loadout.inputTick = -100;
        loadout.shieldUntil =
          tick + playerCombatConfig.spawnProtectionSeconds * 60;
      }
      player.state.protected = tick < loadout.shieldUntil;
      const fresh = player.takeCombatInput();
      const input = fresh?.weapon;
      if (input) {
        loadout.yaw = fresh!.yaw;
        loadout.pitch = fresh!.pitch;
        loadout.held = {
          ...input,
          firePressed: false,
          aimPressed: false,
          reloadPressed: false,
          switchTo: null,
        };
        loadout.inputTick = tick;
      }
      const controls = input
        ? { ...input }
        : tick - loadout.inputTick <= playerCombatConfig.heldInputTicks
          ? { ...loadout.held }
          : neutral();
      if (controls.switchTo && !loadout.owned.has(controls.switchTo))
        controls.switchTo = null;
      if (!loadout.owned.has(loadout.weapons.selected)) {
        controls.fire = controls.firePressed = false;
        loadout.weapons.clearTriggerBuffer();
      }
      const movement = player.movement;
      if (loadout.inputTick >= 0) {
        player.state.yaw = loadout.yaw;
        player.state.pitch = loadout.pitch;
      }
      loadout.weapons.updateAds(movementConfig.fixedStep, controls.aim);
      loadout.weapons.step(movementConfig.fixedStep, controls, {
        speed: Math.hypot(movement.velocity.x, movement.velocity.z),
        grounded: movement.physics.grounded,
        verticalSpeed: movement.velocity.y,
      });
      player.state.weapon = loadout.weapons.selected;
      player.animation.weapon(
        movementConfig.fixedStep,
        loadout.weapons.reloading,
        loadout.weapons.reloadProgress,
        loadout.weapons.ads,
        !controls.aim &&
          !controls.fire &&
          !controls.firePressed &&
          !loadout.weapons.equipping &&
          loadout.weapons.time - loadout.weapons.current.lastShot >=
            Math.min(0.25, loadout.weapons.config.fireInterval + 0.08),
      );
      Object.assign(player.state, player.animation.values);
    }
    // All living shooters get their tick before damage resolves, allowing same-tick trades.
    for (const shot of this.pending) this.resolve(shot);
  }

  private queueShot(
    player: ServerPlayer,
    loadout: Loadout,
    shot: ShotEvent,
  ): void {
    const position = player.movement.physics.position;
    player.animation.fire();
    this.pending.push({
      player,
      shot: { ...shot },
      seed: loadout.seed,
      origin: {
        x: position.x,
        y: position.y + player.movement.eyeOffset,
        z: position.z,
      },
      yaw: loadout.yaw + loadout.weapons.recoil.yaw,
      pitch: Math.max(
        -1.55,
        Math.min(1.55, loadout.pitch + loadout.weapons.recoil.pitch),
      ),
    });
  }

  private resolve({
    player,
    shot,
    origin,
    yaw,
    pitch,
    seed,
  }: PendingShot): void {
    const event: ServerShot = {
      id: ++this.shotId,
      shooter: player.state.id,
      weapon: shot.config.id,
      origin,
      traces: [],
    };
    const damage = new Map<
      ServerPlayer,
      { amount: number; critical: boolean }
    >();
    const direction = { x: 0, y: 0, z: 0 };
    for (let pellet = 0; pellet < shot.config.pellets; pellet++) {
      const sample = seed ^ (shot.sequence * 131 + pellet * 11);
      spreadDirection(
        yaw,
        pitch,
        shot.spread,
        shotRandom(sample),
        shotRandom(sample + 1),
        direction,
      );
      const wall = player.movement.physics.castBullet(
        origin,
        direction,
        shot.config.range,
      );
      let distance = wall?.distance ?? shot.config.range;
      let normal: Vector3Like | null = wall ? { ...wall.normal } : null;
      let victim: ServerPlayer | null = null;
      let critical = false;
      let hitDamage = shot.config.damage;
      for (const target of this.players.values()) {
        if (target === player || !target.state.alive) continue;
        const hit = intersectAvatar(
          origin,
          direction,
          target.state,
          distance - 0.00001,
        );
        if (!hit) continue;
        distance = hit.distance;
        victim = target;
        critical = hit.head;
        const meters = Math.hypot(
          hit.point.x - origin.x,
          hit.point.y - origin.y,
          hit.point.z - origin.z,
        );
        hitDamage = calculateDamage(shot.config, hit.region, meters);
        normal = { x: -direction.x, y: -direction.y, z: -direction.z };
      }
      event.traces.push({
        end: {
          x: origin.x + direction.x * distance,
          y: origin.y + direction.y * distance,
          z: origin.z + direction.z * distance,
        },
        normal,
      });
      if (
        victim &&
        !victim.state.protected &&
        (this.mode !== 'tdm' ||
          (player.state.team !== 'none' &&
            victim.state.team !== 'none' &&
            victim.state.team !== player.state.team))
      ) {
        const result = damage.get(victim) ?? { amount: 0, critical: false };
        result.amount += hitDamage;
        result.critical ||= critical;
        damage.set(victim, result);
      }
    }
    let applied = 0,
      headshot = false;
    for (const [victim, result] of damage) {
      applied += Math.min(victim.state.health, result.amount);
      headshot ||= result.critical;
      victim.state.health = Math.max(0, victim.state.health - result.amount);
      victim.animation.hit(
        Math.atan2(origin.x - victim.state.x, origin.z - victim.state.z) -
          victim.state.yaw,
      );
      // Publish the reaction on the next tick so same-tick shots see one pose.
      const victimLoadout = this.loadouts.get(victim.state.id)!;
      victimLoadout.damageSequence++;
      if (victim.state.health === 0 && victim.state.alive) {
        victim.state.alive = false;
        victim.state.protected = false;
        victimLoadout.respawnTick =
          this.tick + playerCombatConfig.respawnSeconds * 60;
        victimLoadout.held = neutral();
        victim.freeze();
        this.onKill({
          id: ++this.killId,
          killer: player.state.name,
          victim: victim.state.name,
          weapon: shot.config.id,
          headshot: result.critical,
          killerId: player.state.id,
          victimId: victim.state.id,
        });
      }
    }
    if (applied > 0) {
      const owner = this.loadouts.get(player.state.id)!;
      owner.hitSequence++;
      owner.lastDamage = applied;
      owner.critical = headshot;
    }
    this.onShot(event);
  }

  chooseSpawn(player: ServerPlayer): ArenaSpawn {
    const points = spawnCandidates(
      this.mode === 'tdm' ? player.state.team : 'none',
      player.arena,
    );
    let best = points[0]!,
      bestDistance = -1,
      bestExposure = Infinity;
    for (const candidate of points) {
      let distance = Infinity;
      let exposure = 0;
      let occupied = false;
      for (const other of this.players.values()) {
        if (other === player || !other.state.alive) continue;
        const separation = Math.hypot(
          candidate.x - other.state.x,
          candidate.z - other.state.z,
        );
        occupied ||= separation < 1.5;
        if (this.mode === 'tdm' && other.state.team === player.state.team)
          continue;
        distance = Math.min(distance, separation);
        if (
          player.arena.preferCoveredSpawns &&
          this.hasSpawnSightline(other, candidate)
        )
          exposure++;
      }
      if (occupied) {
        exposure = Infinity;
        distance = -0.5;
      }
      if (
        exposure < bestExposure ||
        (exposure === bestExposure && distance > bestDistance)
      ) {
        best = candidate;
        bestDistance = distance;
        bestExposure = exposure;
      }
    }
    return best;
  }

  private hasSpawnSightline(
    enemy: ServerPlayer,
    candidate: ArenaSpawn,
  ): boolean {
    const origin = {
      x: enemy.state.x,
      y: enemy.state.y + enemy.movement.eyeOffset,
      z: enemy.state.z,
    };
    const x = candidate.x - origin.x;
    const y = candidate.y + 0.55 - origin.y;
    const z = candidate.z - origin.z;
    const distance = Math.hypot(x, y, z);
    if (distance <= 1e-6) return true;
    return !enemy.movement.physics.castBullet(
      origin,
      { x: x / distance, y: y / distance, z: z / distance },
      distance,
    );
  }

  owner(player: ServerPlayer): OwnerCombat {
    const l = this.loadouts.get(player.state.id)!,
      w = l.weapons;
    return {
      life: player.state.life,
      health: player.state.health,
      alive: player.state.alive,
      respawnIn: player.state.alive
        ? 0
        : Math.max(0, (l.respawnTick - this.tick) / 60),
      protected: player.state.protected,
      selected: w.selected,
      ...(l.nextWeapon === undefined ? {} : { nextWeapon: l.nextWeapon }),
      ammo: {
        rifle: {
          magazine: w.ammo.rifle.magazine,
          reserve: w.ammo.rifle.reserve,
        },
        smg: { magazine: w.ammo.smg.magazine, reserve: w.ammo.smg.reserve },
        sniper: {
          magazine: w.ammo.sniper.magazine,
          reserve: w.ammo.sniper.reserve,
        },
        shotgun: {
          magazine: w.ammo.shotgun.magazine,
          reserve: w.ammo.shotgun.reserve,
        },
      },
      reloading: w.reloading,
      equipping: w.equipping,
      reloadProgress: w.reloadProgress,
      cycling: w.cycling,
      cycleProgress: w.cycleProgress,
      ads: w.ads,
      spread: w.spread,
      shots: w.shotsFired,
      hitSequence: l.hitSequence,
      lastDamage: l.lastDamage,
      critical: l.critical,
      damageSequence: l.damageSequence,
    };
  }
}
