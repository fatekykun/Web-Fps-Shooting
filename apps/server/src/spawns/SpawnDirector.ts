import { movementConfig, type Vector3Like } from '@breakpoint/shared';
import type {
  ArenaDefinition,
  RespawnCandidate,
} from '@breakpoint/shared/maps';
import type { GameMode } from '@breakpoint/shared/match';
import { networkConfig } from '@breakpoint/shared/network';
import { PhysicsWorld } from '@breakpoint/shared/physics';
import type { ServerPlayer } from '../players/ServerPlayer';

const ticks = (seconds: number) => Math.round(seconds * networkConfig.tickRate);
const policy = {
  critical: 8,
  high: 15,
  moderate: 25,
  poolSize: 3,
  scoreWindow: 8,
  deathMemory: ticks(10),
  spawnMemory: ticks(8),
  activityMemory: ticks(4),
  campDwell: ticks(2),
  campSample: ticks(0.5),
  campRadius: 6,
  earlyDeath: ticks(4),
};

type Point = Vector3Like;
type SpawnPoint = RespawnCandidate & { id: string };
type Presence = { zone: string; since: number };
type Death = {
  point: Point;
  team: string;
  tick: number;
  spawnZone?: string;
};
type Spawn = { point: SpawnPoint; player: string; tick: number };
type Activity = { point: Point; tick: number };
type Assessment = {
  point: SpawnPoint;
  score: number;
  nearest: number;
  safe: boolean;
};
export type SpawnDecision = { point: SpawnPoint; fallback: boolean };
export interface SpawnDebug {
  player: string;
  selected?: string;
  fallback?: boolean;
  candidates: Record<string, string | number | boolean>[];
}
type Catalog = {
  points: SpawnPoint[];
  rejected: SpawnPoint[];
};
const catalogs = new WeakMap<ArenaDefinition, Catalog>();

function getCatalog(arena: ArenaDefinition, physics: PhysicsWorld): Catalog {
  const cached = catalogs.get(arena);
  if (cached) return cached;
  const source: RespawnCandidate[] = [...(arena.respawns?.candidates ?? [])];
  for (const team of ['blue', 'orange', 'none'] as const) {
    source.push(
      ...arena.spawns[team].map((point) => ({
        ...point,
        zone: `${team}-start`,
        team: team === 'none' ? undefined : team,
      })),
    );
  }
  const catalog: Catalog = { points: [], rejected: [] };
  const seen = new Set<string>();
  for (const candidate of source) {
    const id = `${candidate.x},${candidate.y},${candidate.z}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const point = { ...candidate, id };
    const bounds = arena.respawns?.bounds;
    const valid =
      [point.x, point.y, point.z, point.yaw].every(Number.isFinite) &&
      Math.abs(point.yaw) <= Math.PI &&
      (!bounds ||
        (Math.abs(point.x) + movementConfig.capsuleRadius <= bounds[0] &&
          Math.abs(point.z) + movementConfig.capsuleRadius <= bounds[1])) &&
      physics.canSpawnAt(point);
    (valid ? catalog.points : catalog.rejected).push(point);
  }
  catalogs.set(arena, catalog);
  return catalog;
}

/** Validate fixed opening slots as well as caching the dynamic catalog. */
export function validateSpawnLayout(arena: ArenaDefinition): void {
  if (catalogs.has(arena)) return;
  const physics = new PhysicsWorld(arena.colliders, arena.spawns.none[0]!);
  try {
    const catalog = getCatalog(arena, physics);
    const valid = new Set(catalog.points.map(({ id }) => id));
    for (const opening of Object.values(arena.spawns).flat()) {
      if (
        !valid.has(`${opening.x},${opening.y},${opening.z}`) ||
        !Number.isFinite(opening.yaw) ||
        Math.abs(opening.yaw) > Math.PI
      ) {
        catalogs.delete(arena);
        throw new Error(`Invalid opening spawn on ${arena.name}.`);
      }
    }
  } finally {
    physics.dispose();
  }
}

function range(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function remember<T>(history: T[], item: T, limit: number): void {
  if (history.length >= limit) history.shift();
  history.push(item);
}

export class SpawnDirector {
  private readonly deaths: Death[] = [];
  private readonly spawns: Spawn[] = [];
  private readonly activity: Activity[] = [];
  private readonly presence = new Map<string, Presence>();
  private nextSample = 0;

  constructor(
    private readonly random: () => number,
    private readonly debug?: (message: SpawnDebug) => void,
  ) {}

  reset(): void {
    this.deaths.length = this.spawns.length = this.activity.length = 0;
    this.presence.clear();
    this.nextSample = 0;
  }

  remove(id: string): void {
    this.presence.delete(id);
  }

  sample(players: ReadonlyMap<string, ServerPlayer>, tick: number): void {
    if (tick < this.nextSample) return;
    this.nextSample = tick + policy.campSample;
    for (const player of players.values()) {
      const { id, alive } = player.state;
      const position = player.movement.physics.position;
      let zone: string | undefined;
      let distance = policy.campRadius;
      if (alive) {
        for (const point of getCatalog(player.arena, player.movement.physics)
          .points) {
          const candidateDistance = range(position, point);
          if (candidateDistance < distance) {
            distance = candidateDistance;
            zone = point.zone;
          }
        }
      }
      if (!zone) this.presence.delete(id);
      else if (this.presence.get(id)?.zone !== zone)
        this.presence.set(id, { zone, since: tick });
    }
  }

  shot(point: Point, tick: number): void {
    const last = this.activity.at(-1);
    if (last && tick - last.tick < ticks(0.4) && range(point, last.point) < 2)
      return;
    remember(this.activity, { point: { ...point }, tick }, 128);
  }

  death(player: ServerPlayer, tick: number): void {
    const spawn = this.lastSpawn(player.state.id);
    remember(
      this.deaths,
      {
        point: { ...player.movement.physics.position },
        team: player.state.team,
        tick,
        spawnZone:
          spawn && tick - spawn.tick <= policy.earlyDeath
            ? spawn.point.zone
            : undefined,
      },
      64,
    );
    this.presence.delete(player.state.id);
  }

  spawned(player: ServerPlayer, point: SpawnPoint, tick: number): void {
    remember(this.spawns, { point, player: player.state.id, tick }, 64);
    this.presence.delete(player.state.id);
  }

  private lastSpawn(id: string): Spawn | undefined {
    for (let i = this.spawns.length - 1; i >= 0; i--) {
      const spawn = this.spawns[i]!;
      if (spawn.player === id) return spawn;
    }
    return undefined;
  }

  choose(
    player: ServerPlayer,
    players: ReadonlyMap<string, ServerPlayer>,
    mode: GameMode,
    tick: number,
  ): SpawnDecision | undefined {
    const { points, rejected } = getCatalog(
      player.arena,
      player.movement.physics,
    );
    const living = [...players.values()].filter(
      (other) => other !== player && other.state.alive,
    );
    const enemies = living.filter(
      (other) => mode !== 'tdm' || other.state.team !== player.state.team,
    );
    const allies =
      mode === 'tdm'
        ? living.filter((other) => other.state.team === player.state.team)
        : [];
    const diagnostics: SpawnDebug['candidates'] = [];
    const log = (
      point: SpawnPoint,
      details: SpawnDebug['candidates'][number],
    ) => {
      if (this.debug)
        diagnostics.push({ id: point.id, zone: point.zone, ...details });
    };
    if (this.debug)
      for (const point of rejected) log(point, { rejected: 'geometry' });

    const bounds = player.arena.respawns?.bounds;
    const scale = bounds ? Math.min(...bounds) / 18 : 1;
    const critical = policy.critical * scale;
    const high = policy.high * scale;
    const moderate = policy.moderate * scale;
    const ranked: Assessment[] = [];
    const lastSpawn = this.lastSpawn(player.state.id);
    for (const point of points) {
      if (this.occupied(point, living)) {
        log(point, { rejected: 'occupied' });
        continue;
      }
      let nearest = Infinity;
      let proximity = 0,
        visible = 0,
        campedBy = 0;
      for (const enemy of enemies) {
        const distance = range(point, enemy.movement.physics.position);
        nearest = Math.min(nearest, distance);
        proximity +=
          distance < critical
            ? 1
            : distance < high
              ? 0.6
              : distance < moderate
                ? 0.26
                : 0;
        if (this.exposed(point, enemy)) visible++;
        const presence = this.presence.get(enemy.state.id);
        if (
          presence?.zone === point.zone &&
          tick - presence.since >= policy.campDwell
        )
          campedBy++;
      }
      let deaths = 0,
        cooldown = 0;
      for (const death of this.deaths) {
        const remaining = death.tick + policy.deathMemory - tick;
        if (
          remaining <= 0 ||
          (mode === 'tdm' && death.team !== player.state.team)
        )
          continue;
        if (
          death.spawnZone !== point.zone &&
          range(point, death.point) > policy.campRadius
        )
          continue;
        deaths += death.spawnZone === point.zone ? 2 : 1;
        cooldown = Math.max(cooldown, remaining);
      }
      const camped = campedBy > 0 || deaths >= 2;
      let usage = 0;
      for (const spawn of this.spawns)
        if (spawn.point.id === point.id)
          usage += Math.max(0, 1 - (tick - spawn.tick) / policy.spawnMemory);
      if (
        lastSpawn?.point.id === point.id &&
        tick - lastSpawn.tick < policy.deathMemory
      )
        usage += 0.6;
      const active = this.activity.some(
        (event) =>
          tick - event.tick < policy.activityMemory &&
          range(point, event.point) < policy.campRadius,
      );
      const support = allies.some((ally) => {
        const distance = range(point, ally.movement.physics.position);
        return distance >= 2 && distance <= 10;
      });
      const teamPreference =
        mode === 'tdm' && point.team === player.state.team ? 5 : 0;
      const proximityPenalty = 30 * Math.min(1.35, proximity);
      const score =
        100 -
        proximityPenalty -
        30 * Math.min(1.45, visible * 0.68) -
        Math.min(15, deaths * 6) -
        Math.min(10, usage * 7) -
        (active ? 5 : 0) -
        (camped ? 24 : 0) -
        (nearest < critical && visible > 0 ? 15 : 0) +
        teamPreference +
        (support ? 8 : 0);
      const safe = nearest >= critical && visible === 0 && !camped;
      ranked.push({ point, score, nearest, safe });
      log(point, {
        score: Math.round(score),
        proximity: Math.round(proximityPenalty),
        nearest: Number.isFinite(nearest)
          ? Math.round(nearest * 10) / 10
          : 'none',
        visible,
        campedBy,
        cooldownSeconds: Math.ceil(cooldown / networkConfig.tickRate),
        safe,
      });
    }
    ranked.sort(
      (a, b) =>
        Number(b.safe) - Number(a.safe) ||
        b.score - a.score ||
        b.nearest - a.nearest,
    );
    const safest = ranked[0];
    let selected: Assessment | undefined;
    if (safest?.safe) {
      const pool = ranked
        .filter(
          ({ safe, score }) =>
            safe && score >= safest.score - policy.scoreWindow,
        )
        .slice(0, policy.poolSize);
      const weights = pool.map(
        ({ score, point }) =>
          (1 + Math.max(0, score - (safest.score - policy.scoreWindow))) *
          Math.max(0.1, Math.min(2, point.weight ?? 1)),
      );
      let draw =
        this.random() * weights.reduce((sum, weight) => sum + weight, 0);
      selected =
        pool.find((_, index) => (draw -= weights[index]!) < 0) ?? pool.at(-1);
    } else selected = safest;

    // Reserve implicitly by publishing the position in the same server tick.
    const stillValid = ({ point }: Assessment) =>
      player.movement.physics.canSpawnAt(point) &&
      !this.occupied(point, living);
    if (selected && !stillValid(selected)) {
      log(selected.point, { rejected: 'revalidation' });
      selected = ranked.find(stillValid);
    }
    this.debug?.({
      player: player.state.id,
      selected: selected?.point.id,
      fallback: selected ? !selected.safe : undefined,
      candidates: diagnostics,
    });
    return selected && { point: selected.point, fallback: !selected.safe };
  }

  private occupied(
    point: SpawnPoint,
    living: readonly ServerPlayer[],
  ): boolean {
    // Standing height at both positions is conservative for crouching opponents.
    const height =
      2 * (movementConfig.capsuleHalfHeight + movementConfig.capsuleRadius);
    return living.some((other) => {
      const position = other.movement.physics.position;
      return (
        Math.abs(point.y - position.y) < height &&
        Math.hypot(point.x - position.x, point.z - position.z) <
          2 * movementConfig.capsuleRadius + 0.15
      );
    });
  }

  private exposed(point: SpawnPoint, enemy: ServerPlayer): boolean {
    const physics = enemy.movement.physics;
    const origin = {
      ...physics.position,
      y: physics.position.y + enemy.movement.eyeOffset,
    };
    // One unobstructed torso or head ray is enough. Target sensors do not count as cover.
    for (const height of [0.14, 0.58]) {
      const x = point.x - origin.x,
        y = point.y + height - origin.y,
        z = point.z - origin.z;
      const distance = Math.hypot(x, y, z);
      if (
        distance < 0.001 ||
        !physics.castBullet(
          origin,
          { x: x / distance, y: y / distance, z: z / distance },
          distance,
          true,
        )
      )
        return true;
    }
    return false;
  }
}
