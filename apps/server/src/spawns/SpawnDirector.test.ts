import { afterEach, beforeAll, expect, it } from 'vitest';
import { initializePhysics } from '@breakpoint/shared/physics';
import {
  arenas,
  type ArenaBox,
  type ArenaDefinition,
  type RespawnCandidate,
} from '@breakpoint/shared/maps';
import { ServerPlayer } from '../players/ServerPlayer';
import { PlayerState } from '../rooms/RoomState';
import { ServerCombat } from '../combat/ServerCombat';
import {
  SpawnDirector,
  validateSpawnLayout,
  type SpawnDebug,
} from './SpawnDirector';

const worlds: ServerPlayer[] = [];
beforeAll(initializePhysics);
afterEach(() => {
  for (const player of worlds.splice(0)) player.dispose();
});

const point = (x: number, z = 0, zone = String(x)): RespawnCandidate => ({
  x,
  y: 0.91,
  z,
  yaw: 0,
  zone,
});
const box = (
  position: ArenaBox['position'],
  size: ArenaBox['size'],
): ArenaBox => ({
  position,
  size,
  color: 0,
});

function fixture(
  candidates: RespawnCandidate[],
  obstacles: ArenaBox[] = [],
  draw = 0,
) {
  const arena: ArenaDefinition = {
    name: 'Spawn test',
    venue: 'arena',
    sector: '00',
    spawns: { none: [candidates[0]!], blue: [], orange: [] },
    colliders: [box([0, -0.5, 0], [48, 1, 48]), ...obstacles],
    respawns: { bounds: [18, 18], candidates },
  };
  const players = new Map<string, ServerPlayer>();
  const add = (id: string, x: number, z: number, alive = true) => {
    const player = new ServerPlayer(new PlayerState({ id, name: id }), arena);
    player.respawn(point(x, z));
    player.state.alive = alive;
    players.set(id, player);
    worlds.push(player);
    return player;
  };
  const diagnostics: SpawnDebug[] = [];
  const director = new SpawnDirector(
    () => draw,
    (message) => diagnostics.push(message),
  );
  return { director, players, add, diagnostics, arena };
}

it('validates opening slots and enough distributed candidates on all three production maps', () => {
  for (const arena of Object.values(arenas)) {
    expect(() => validateSpawnLayout(arena)).not.toThrow();
    for (const { x, z, yaw } of arena.respawns.candidates)
      expect(x * Math.sin(yaw) + z * Math.cos(yaw)).toBeGreaterThan(0);
    const player = new ServerPlayer(new PlayerState({ id: arena.name }), arena);
    worlds.push(player);
    const reports: SpawnDebug[] = [];
    const director = new SpawnDirector(
      () => 0,
      (report) => reports.push(report),
    );
    expect(director.choose(player, new Map(), 'ffa', 0)).toBeDefined();
    expect(
      reports[0]!.candidates.filter((candidate) => candidate.safe),
    ).toHaveLength(
      reports[0]!.candidates.length -
        reports[0]!.candidates.filter((row) => row.rejected).length,
    );
    expect(
      reports[0]!.candidates.filter((candidate) => candidate.safe).length,
    ).toBeGreaterThan(12);
    expect(
      reports[0]!.candidates.filter((candidate) => candidate.rejected),
      arena.name,
    ).toEqual([]);
  }
});

it('rejects geometry, floating points, wrong facing, and out-of-bounds positions', () => {
  const f = fixture(
    [
      point(-7),
      point(3, 3),
      { ...point(6), y: 3 },
      { ...point(7), yaw: Infinity },
      point(19),
    ],
    [box([3, 1, 3], [2, 2, 2])],
  );
  const player = f.add('respawning', 0, 0, false);
  expect(f.director.choose(player, f.players, 'ffa', 0)?.point.x).toBe(-7);
  expect(
    f.diagnostics[0]!.candidates.filter((row) => row.rejected === 'geometry'),
  ).toHaveLength(4);
  f.add('occupant', -7, 0);
  expect(f.director.choose(player, f.players, 'ffa', 0)).toBeUndefined();
});

it('chooses solid cover over an exposed position at the same distance and ignores sensors', () => {
  const f = fixture(
    [point(10), point(-10)],
    [box([-4, 1.5, 0], [0.3, 3, 3])],
    0.99,
  );
  const player = f.add('respawning', 1, 3, false);
  const enemy = f.add('enemy', 0, 0);
  enemy.movement.physics.addSensorBox(
    { x: 4, y: 1.5, z: 0 },
    { x: 1, y: 3, z: 3 },
  );
  enemy.respawn(point(0));
  const spawn = f.director.choose(player, f.players, 'ffa', 0);
  expect(spawn).toMatchObject({ point: { x: -10 }, fallback: false });
  expect(
    f.diagnostics[0]!.candidates.find(({ id }) => String(id).startsWith('10,'))
      ?.visible,
  ).toBe(1);
});

it.each([
  [0, -8],
  [0.99, 2],
])('limits weighted draws to the safe top pool (%s)', (draw, expected) => {
  const f = fixture([point(-8), point(-3), point(2), point(9)], [], draw);
  const player = f.add('respawning', 0, 1, false);
  const spawn = f.director.choose(player, f.players, 'ffa', 0)!;
  expect(spawn.point.x).toBe(expected);
  f.director.spawned(player, spawn.point, 0);
  expect(f.director.choose(player, f.players, 'ffa', 1)?.point.x).not.toBe(
    expected,
  );
});

it('penalizes camping, recent deaths and shots, and restores a cleared zone', () => {
  const f = fixture([point(-10), point(10)], [box([3.5, 1.5, 0], [0.4, 3, 6])]);
  const player = f.add('respawning', 0, 0, false);
  const enemy = f.add('enemy', -9, 0);
  f.director.sample(f.players, 0);
  f.director.sample(f.players, 120);
  expect(f.director.choose(player, f.players, 'ffa', 120)?.point.x).toBe(10);
  expect(
    f.diagnostics.at(-1)!.candidates.find(({ zone }) => zone === '-10')
      ?.campedBy,
  ).toBe(1);
  player.respawn(point(-10));
  player.state.alive = false;
  f.director.death(player, 120);
  f.director.death(player, 130);
  f.director.shot(point(-10), 130);
  enemy.respawn(point(0, 15));
  f.director.sample(f.players, 150);
  f.director.choose(player, f.players, 'ffa', 150);
  expect(
    f.diagnostics.at(-1)!.candidates.find(({ zone }) => zone === '-10'),
  ).toMatchObject({
    campedBy: 0,
    cooldownSeconds: 10,
  });
  f.director.choose(player, f.players, 'ffa', 800);
  expect(
    f.diagnostics.at(-1)!.candidates.find(({ zone }) => zone === '-10')
      ?.cooldownSeconds,
  ).toBe(0);
});

it('uses the least dangerous valid fallback when all points are visible and can shift TDM sides', () => {
  const f = fixture(
    [
      { ...point(-5), team: 'blue' },
      { ...point(15), team: 'orange' },
    ],
    [],
    0.99,
  );
  const player = f.add('respawning', 1, 2, false);
  player.state.team = 'blue';
  f.add('enemy', 0, 0).state.team = 'orange';
  expect(f.director.choose(player, f.players, 'tdm', 0)).toMatchObject({
    point: { x: 15 },
    fallback: true,
  });
});

it('reserves simultaneous spawns and retries when all valid space is occupied', () => {
  const f = fixture([point(-7), point(7)]);
  const a = f.add('a', 0, 1, false);
  const b = f.add('b', 0, 2, false);
  const c = f.add('c', 0, 3, false);
  const combat = new ServerCombat(
    f.players,
    () => {},
    () => {},
    undefined,
    { random: () => 0 },
  );
  for (const p of f.players.values()) {
    combat.add(p);
    p.state.alive = false;
  }
  combat.step(1);
  expect(a.state.alive && b.state.alive).toBe(true);
  expect(a.state.x).not.toBe(b.state.x);
  expect(combat.get('a')!.shieldUntil).toBe(91);
  expect(combat.get('b')!.shieldUntil).toBe(121);
  expect(c.state.alive).toBe(false);
  const life = c.state.life;
  a.respawn(point(0, 16));
  combat.step(7);
  expect(c.state.alive).toBe(true);
  expect(c.state.x).not.toBe(b.state.x);
  expect(c.state.life).toBe(life + 1);
  combat.step(8);
  expect(c.state.life).toBe(life + 1);
});
