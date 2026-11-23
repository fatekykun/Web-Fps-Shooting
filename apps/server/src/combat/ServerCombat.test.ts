import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initializePhysics } from '@breakpoint/shared/physics';
import { arenaBoxes } from '@breakpoint/shared/maps';
import {
  weaponConfigs,
  weaponOrder,
  calculateDamage,
  type WeaponInput,
  type MovementInput,
} from '@breakpoint/shared';
import type { KillEvent, ServerShot } from '@breakpoint/shared/combat';
import { ServerCombat } from './ServerCombat';
import { ServerPlayer } from '../players/ServerPlayer';
import { PlayerState } from '../rooms/RoomState';
import {
  avatarParts,
  standingAnchor,
  intersectAvatar,
} from '@breakpoint/shared/avatar';
import {
  characterHitboxes,
  createRigTransforms,
  evaluateRig,
  partTransform,
  rotatePoint,
} from '@breakpoint/shared/character';

it.each(weaponOrder)(
  'applies all eleven authoritative %s region multipliers without duplicating pellets',
  (id) => {
    for (const part of avatarParts) {
      if (!part.region) continue;
      const f = fixture(),
        shooter = f.add('shooter', 0, 4),
        victim = f.add('victim', 0, 8);
      const w = f.combat.get('shooter')!.weapons;
      w.selected = id;
      w.ads = 1;
      const eye =
        shooter.movement.physics.position.y + shooter.movement.eyeOffset;
      const definition = characterHitboxes.find(
        (candidate) =>
          candidate.region === part.region && candidate.name !== 'neck',
      )!;
      const rig = createRigTransforms();
      evaluateRig(victim.state, rig);
      const center = partTransform(definition, rig, {
        x: 0,
        y: 0,
        z: 0,
        qx: 0,
        qy: 0,
        qz: 0,
        qw: 1,
      });
      // Two-handed poses can cover a region's center. Select an exposed point
      // on the actual animated hull, then still validate the real server shot.
      const candidates = [0, -0.25, 0.25].flatMap((x) =>
        [0, -0.25, 0.25].flatMap((y) =>
          [0, -0.25, 0.25].map((z) => {
            const offset = rotatePoint(
              center,
              x * definition.size[0],
              y * definition.size[1],
              z * definition.size[2],
              { x: 0, y: 0, z: 0 },
            );
            return {
              x: center.x + offset.x,
              y: center.y + offset.y,
              z: center.z + offset.z,
            };
          }),
        ),
      );
      const hitsRegion = (point: { x: number; y: number; z: number }) => {
        const origin = { x: 0, y: eye, z: 4 };
        const delta = {
          x: point.x,
          y: victim.state.y - standingAnchor + point.y - eye,
          z: 8 + point.z - 4,
        };
        const distance = Math.hypot(delta.x, delta.y, delta.z);
        return (
          intersectAvatar(
            origin,
            {
              x: delta.x / distance,
              y: delta.y / distance,
              z: delta.z / distance,
            },
            victim.state,
            distance + 0.2,
          )?.region === part.region
        );
      };
      // Keep small ADS spread away from the adjacent support hand as well.
      const target =
        candidates.find((point) =>
          [-0.025, 0, 0.025].every((x) =>
            [-0.025, 0, 0.025].every((y) =>
              hitsRegion({ ...point, x: point.x + x, y: point.y + y }),
            ),
          ),
        ) ?? candidates.find(hitsRegion);
      expect(target, `exposed ${part.region}`).toBeDefined();
      const { x, y, z } = target!;
      const dz = 4 - (8 + z);
      const aimY = y - (part.region.includes('Foot') ? 0.035 : 0);
      f.controls(
        shooter,
        { ...trigger, aim: true },
        -Math.atan2(x, dz),
        Math.atan2(
          victim.state.y - standingAnchor + aimY - eye,
          Math.hypot(x, dz),
        ),
      );
      f.step();
      const shot = f.shots[0]!;
      expect(f.shots).toHaveLength(1);
      expect(shot.weapon).toBe(id);
      expect(shot.traces).toHaveLength(weaponConfigs[id].pellets);
      const expected = shot.traces.reduce((sum, trace) => {
        const distance = Math.hypot(
          trace.end.x - shot.origin.x,
          trace.end.y - shot.origin.y,
          trace.end.z - shot.origin.z,
        );
        const direction = {
          x: (trace.end.x - shot.origin.x) / distance,
          y: (trace.end.y - shot.origin.y) / distance,
          z: (trace.end.z - shot.origin.z) / distance,
        };
        const hit = intersectAvatar(
          shot.origin,
          direction,
          {
            ...victim.state,
            ...victim.animation.values,
            x: victim.state.x,
            y: victim.state.y,
            z: victim.state.z,
            yaw: victim.state.yaw,
            pitch: victim.state.pitch,
            halfHeight: victim.state.halfHeight,
            hitBlend: 0,
          },
          distance + 0.00001,
        );
        if (id !== 'shotgun') expect(hit?.region).toBe(part.region);
        return (
          sum +
          (hit ? calculateDamage(weaponConfigs[id], hit.region, distance) : 0)
        );
      }, 0);
      expect(victim.state.health, `${id}/${part.region}`).toBeCloseTo(
        Math.max(0, 100 - expected),
      );
      expect(f.combat.owner(shooter).lastDamage).toBeCloseTo(
        Math.min(100, expected),
      );
      expect(w.current.magazine).toBe(weaponConfigs[id].magazine - 1);
      expect(f.combat.owner(shooter).hitSequence).toBe(1);
      expect(f.combat.owner(victim).damageSequence).toBe(1);
    }
  },
);

it.each(weaponOrder)(
  'uses actual diagonal hit distance for %s falloff and keeps health fractional',
  (id) => {
    const f = fixture(),
      shooter = f.add('shooter', 0, 12),
      victim = f.add('victim', 0.6, -23);
    const w = f.combat.get('shooter')!.weapons;
    w.selected = id;
    w.ads = 1;
    // Isolate range/region damage from arena cover; cover occlusion is tested separately.
    vi.spyOn(shooter.movement.physics, 'castBullet').mockReturnValue(null);
    const eye =
      shooter.movement.physics.position.y + shooter.movement.eyeOffset;
    f.controls(
      shooter,
      { ...trigger, aim: true },
      -Math.atan2(0.6, 35),
      Math.atan2(
        victim.state.y - standingAnchor + 1.145 - eye,
        Math.hypot(0.6, 35),
      ),
    );
    f.step();
    expect(f.shots).toHaveLength(1);
    const shot = f.shots[0]!;
    if (id !== 'shotgun') {
      const point = shot.traces[0]!.end;
      const meters = Math.hypot(
        point.x - shot.origin.x,
        point.y - shot.origin.y,
        point.z - shot.origin.z,
      );
      expect(meters).toBeGreaterThan(34);
      expect(meters).toBeLessThan(36);
      const expected = calculateDamage(weaponConfigs[id], 'upperTorso', meters);
      expect(expected).toBeLessThan(
        calculateDamage(weaponConfigs[id], 'upperTorso', 0),
      );
      expect(victim.state.health).toBeCloseTo(100 - expected, 8);
      expect(f.combat.owner(shooter).lastDamage).toBeCloseTo(expected, 8);
    } else {
      expect(victim.state.health).toBeGreaterThan(
        100 - weaponConfigs.shotgun.damage * weaponConfigs.shotgun.pellets,
      );
    }
  },
);

beforeAll(initializePhysics);
it('publishes directional hit reactions on the next tick without changing same-tick collision poses', () => {
  const f = fixture(),
    shooter = f.add('shooter', 0, 12),
    victim = f.add('victim', 0, 8);
  victim.state.yaw = 0.5;
  f.controls(shooter);
  f.step();
  expect(victim.state.health).toBeLessThan(100);
  expect(victim.animation.values.hitBlend).toBe(1);
  expect(victim.state.hitBlend).toBe(0);
  f.step();
  expect(victim.state.hitBlend).toBeGreaterThan(0.8);
  expect(victim.state.hitYaw).toBeCloseTo(-0.5);
  f.step(120);
  expect(victim.state.hitBlend).toBeLessThan(0.001);
});
const worlds: ServerPlayer[] = [];

it('publishes sprint carry, ADS, confirmed shot recoil and reload handling from authoritative controls', () => {
  const f = fixture(),
    player = f.add('runner', 0, 12);
  const moving = { forward: 1, sprint: true };
  const neutralWeapon = { ...trigger, fire: false, firePressed: false };
  for (let i = 0; i < 45; i++) {
    f.controls(player, neutralWeapon, 0, 0, player.state.life, moving);
    f.step();
  }
  expect(player.state.carryBlend).toBeGreaterThan(0.9);
  for (let i = 0; i < 25; i++) {
    f.controls(
      player,
      { ...neutralWeapon, aim: true },
      0,
      0,
      player.state.life,
      moving,
    );
    f.step();
  }
  expect(player.state.aimBlend).toBeGreaterThan(0.99);
  expect(player.state.carryBlend).toBeLessThan(0.001);
  f.controls(player, trigger, 0, 0, player.state.life, moving);
  f.step();
  expect(f.shots).toHaveLength(1);
  expect(player.state.fireBlend).toBe(1);
  f.controls(
    player,
    { ...neutralWeapon, reloadPressed: true },
    0,
    0,
    player.state.life,
    moving,
  );
  f.step(10);
  expect(player.state.reloadBlend).toBeGreaterThan(0.8);
  expect(player.state.carryBlend).toBeLessThan(0.01);
});
afterEach(() => {
  for (const player of worlds) player.dispose();
  worlds.length = 0;
});
const trigger: WeaponInput = {
  fire: true,
  aim: false,
  firePressed: true,
  reloadPressed: false,
  switchTo: null,
};
function fixture() {
  const players = new Map<string, ServerPlayer>();
  const shots: ServerShot[] = [],
    kills: KillEvent[] = [];
  const combat = new ServerCombat(
    players,
    (shot) => shots.push(shot),
    (kill) => kills.push(kill),
    () => 12345,
  );
  let tick = 0;
  const sequences = new Map<string, number>();
  function add(id: string, x: number, z: number) {
    const player = new ServerPlayer(new PlayerState({ id, name: id }));
    worlds.push(player);
    player.movement.physics.restore({ x, y: 0.885, z }, 0.55, true);
    player.movement.synchronize();
    // Publish the trusted test placement through one neutral movement step.
    player.enqueue([
      {
        seq: 1,
        forward: 0,
        right: 0,
        yaw: 0,
        pitch: 0,
        sprint: false,
        jump: false,
        jumpPressed: false,
        slidePressed: false,
        divePressed: false,
      },
    ]);
    player.step();
    sequences.set(id, 1);
    players.set(id, player);
    combat.add(player);
    return player;
  }
  function controls(
    player: ServerPlayer,
    weapon: WeaponInput = trigger,
    yaw = 0,
    pitch = 0,
    life = player.state.life,
    movement: Partial<MovementInput> = {},
  ) {
    const seq = (sequences.get(player.state.id) ?? 0) + 1;
    sequences.set(player.state.id, seq);
    expect(
      player.enqueue([
        {
          seq,
          forward: 0,
          right: 0,
          yaw,
          pitch,
          life,
          weapon,
          sprint: false,
          jump: false,
          jumpPressed: false,
          slidePressed: false,
          divePressed: false,
          ...movement,
        },
      ]),
    ).toBe(true);
  }
  function step(count = 1) {
    for (let i = 0; i < count; i++) {
      for (const p of players.values()) p.step();
      combat.step(++tick);
    }
  }
  return {
    add,
    controls,
    step,
    combat,
    shots,
    kills,
    players,
    tick: () => tick,
  };
}

describe('authoritative hitscan', () => {
  it('casts from the server eye, damages the nearest player and records exactly one kill', () => {
    const f = fixture(),
      shooter = f.add('shooter', 0, 12),
      victim = f.add('victim', 0, 8),
      behind = f.add('behind', 0, 4);
    for (let i = 0; i < 3; i++) {
      f.controls(shooter);
      f.step(6);
    }
    expect(victim.state.alive).toBe(false);
    expect(victim.state.health).toBe(0);
    expect(behind.state.health).toBe(100);
    expect(f.kills).toHaveLength(1);
    expect(f.kills[0]).toMatchObject({
      killer: 'shooter',
      victim: 'victim',
      weapon: 'rifle',
      headshot: true,
    });
    expect(f.combat.owner(shooter).hitSequence).toBe(3);
    expect(f.shots[0]!.origin.x).toBeCloseTo(shooter.state.x, 3);
    expect(f.shots[0]!.origin.y).toBeCloseTo(
      shooter.movement.physics.position.y + shooter.movement.eyeOffset,
      3,
    );
    expect(shooter.state.health).toBe(100);
  });
  it('blocks shots on world cover and does not use client-reported origins or damage', () => {
    const f = fixture(),
      shooter = f.add('shooter', -7, 12),
      target = f.add('target', -7, -10);
    f.controls(shooter);
    f.step();
    expect(target.state.health).toBe(100);
    const cover = arenaBoxes.find(
      (box) => box.kind === 'container' && box.position[0] === -7,
    )!;
    expect(f.shots[0]!.traces[0]!.end.z).toBeCloseTo(
      cover.position[2] + cover.size[2] / 2,
      2,
    );
    expect(f.combat.owner(shooter).hitSequence).toBe(0);
    expect(f.combat.owner(shooter).ammo.rifle.magazine).toBe(29);
  });
  it('validates direction and body regions against the actual current server poses', () => {
    const f = fixture(),
      shooter = f.add('shooter', 0, 12),
      target = f.add('target', 0, 8);
    f.controls(shooter, trigger, Math.PI);
    f.step();
    expect(target.state.health).toBe(100);
    f.step(10);
    f.controls(shooter, trigger, 0, -0.14);
    f.step(2);
    expect(target.state.health).toBe(75);
    expect(f.combat.owner(shooter).critical).toBe(false);
  });
  it('does not hit protected bodies or apply damage to dead players', () => {
    const f = fixture(),
      shooter = f.add('shooter', 0, 12),
      target = f.add('target', 0, 8);
    f.combat.get('target')!.shieldUntil = 100;
    f.controls(shooter);
    f.step();
    expect(target.state.health).toBe(100);
    expect(f.combat.owner(shooter).hitSequence).toBe(0);
    target.state.alive = false;
    f.combat.get('target')!.respawnTick = 100;
    f.step(6);
    f.controls(shooter);
    f.step();
    expect(f.kills).toHaveLength(0);
  });
  it('applies shotgun pellets independently with one ammo charge and bounded damage', () => {
    const f = fixture(),
      shooter = f.add('shooter', 0, 12),
      target = f.add('target', 0, 10);
    f.controls(shooter, {
      ...trigger,
      fire: false,
      firePressed: false,
      switchTo: 'shotgun',
    });
    f.step(13);
    f.controls(shooter);
    f.step();
    expect(f.shots.at(-1)!.traces).toHaveLength(weaponConfigs.shotgun.pellets);
    expect(f.combat.owner(shooter).ammo.shotgun.magazine).toBe(7);
    expect(target.state.health).toBeLessThan(100);
    expect(target.state.health).toBeGreaterThanOrEqual(0);
    f.controls(shooter, { ...trigger, firePressed: false });
    f.step(60);
    expect(f.combat.owner(shooter).ammo.shotgun.magazine).toBe(7);
  });
});

describe('server weapon budget and life cycle', () => {
  it('lets teammates block rays without taking friendly damage and respawns enemies on their side', () => {
    const f = fixture(),
      shooter = f.add('shooter', 0, 12),
      ally = f.add('ally', 0, 10),
      enemy = f.add('enemy', 0, 8);
    f.combat.setMode('tdm');
    shooter.state.team = ally.state.team = 'blue';
    enemy.state.team = 'orange';
    f.controls(shooter);
    f.step();
    expect(ally.state.health).toBe(100);
    expect(enemy.state.health).toBe(100);
    expect(f.combat.owner(shooter).hitSequence).toBe(0);
    ally.movement.physics.restore({ x: 4, y: 0.885, z: 10 }, 0.55, true);
    enemy.movement.physics.restore({ x: 0, y: 0.885, z: 10 }, 0.55, true);
    f.step(7);
    f.controls(shooter, trigger, 0, -0.25);
    f.step();
    expect(enemy.state.health).toBeLessThan(100);
    expect(ally.state.health).toBe(100);
    enemy.state.alive = false;
    f.combat.get('enemy')!.respawnTick = f.tick() + 1;
    f.step();
    expect(enemy.state.z).toBe(-13.5);
    expect(enemy.state.yaw).toBe(Math.PI);
    expect(enemy.state.protected).toBe(true);
  });
  it('bounds firing by server ticks, ammo and ownership even when inputs are queued in a burst', () => {
    const f = fixture(),
      player = f.add('player', 0, 12);
    for (let i = 0; i < 60; i++) f.controls(player);
    f.step();
    expect(f.shots).toHaveLength(1);
    for (let i = 0; i < 59; i++) {
      f.controls(player);
      f.step();
    }
    expect(f.shots).toHaveLength(10);
    f.combat.get('player')!.weapons.ammo.rifle.magazine = 0;
    f.controls(player);
    f.step(10);
    expect(f.shots).toHaveLength(10);
    f.combat.get('player')!.owned.delete('smg');
    f.controls(player, { ...trigger, switchTo: 'smg' });
    f.step(20);
    expect(player.state.weapon).toBe('rifle');
  });
  it('reloads atomically on server time and cancels reload on a valid switch', () => {
    const f = fixture(),
      player = f.add('player', 0, 12);
    f.controls(player);
    f.step();
    f.controls(player, {
      ...trigger,
      fire: false,
      firePressed: false,
      reloadPressed: true,
    });
    f.step(60);
    expect(f.combat.owner(player).ammo.rifle).toEqual({
      magazine: 29,
      reserve: 120,
    });
    f.controls(player, {
      ...trigger,
      fire: false,
      firePressed: false,
      switchTo: 'smg',
    });
    f.step(70);
    expect(f.combat.owner(player).ammo.rifle).toEqual({
      magazine: 29,
      reserve: 120,
    });
    f.controls(player, {
      ...trigger,
      fire: false,
      firePressed: false,
      switchTo: 'rifle',
    });
    f.step(12);
    f.controls(player, {
      ...trigger,
      fire: false,
      firePressed: false,
      reloadPressed: true,
    });
    f.step(121);
    expect(f.combat.owner(player).ammo.rifle).toEqual({
      magazine: 30,
      reserve: 119,
    });
  });
  it('respawns with fresh movement/ammo and rejects old-life queued firing', () => {
    const f = fixture(),
      shooter = f.add('shooter', 0, 12),
      victim = f.add('victim', 0, 8);
    f.combat.get('victim')!.weapons.switchWeapon('smg');
    for (let i = 0; i < 3; i++) {
      f.controls(shooter);
      f.step(6);
    }
    const life = victim.state.life;
    expect(victim.state.alive).toBe(false);
    f.controls(victim, trigger);
    f.step(5);
    expect(f.combat.owner(victim).shots).toBe(0);
    expect(f.combat.owner(victim).respawnIn).toBeGreaterThan(0);
    f.step(180);
    expect(victim.state.life).toBe(life + 1);
    expect(victim.state.alive).toBe(true);
    expect(victim.state.health).toBe(100);
    expect(victim.state.protected).toBe(true);
    expect(victim.state.weapon).toBe('smg');
    expect(f.combat.owner(victim).ammo.rifle.magazine).toBe(30);
    const position = { ...victim.movement.physics.position };
    f.controls(victim, trigger, 0, 0, life);
    f.step();
    expect(f.combat.owner(victim).shots).toBe(0);
    expect(victim.movement.physics.position.x).toBe(position.x);
    f.controls(victim, trigger);
    f.step();
    expect(f.combat.owner(victim).shots).toBe(1);
  });
  it('expires held fire when inputs stop arriving', () => {
    const f = fixture(),
      shooter = f.add('shooter', 0, 12);
    f.controls(shooter);
    f.step(60);
    expect(f.combat.owner(shooter).shots).toBeLessThanOrEqual(2);
  });
  it('uses fresh release and aim without draining a backlog of old held fire', () => {
    const f = fixture(),
      player = f.add('player', 0, 12);
    for (let i = 0; i < 40; i++) f.controls(player);
    f.step();
    expect(f.shots).toHaveLength(1);
    f.controls(
      player,
      { ...trigger, fire: false, firePressed: false },
      Math.PI,
    );
    f.step(60);
    expect(f.shots).toHaveLength(1);
    expect(player.state.yaw).toBeCloseTo(Math.PI);
  });
});

describe('authoritative sniper', () => {
  it.each([
    [0, 1.48, 135, true],
    [0, 1.15, 100, false],
    [0, 0.8, 81, false],
    [-0.33, 1.2, 63, false],
    [0.33, 1.2, 63, false],
    [-0.15, 0.43, 63, false],
    [0.15, 0.43, 63, false],
  ])(
    'resolves server hitboxes and damage at x=%s y=%s',
    (x, y, damage, headshot) => {
      const f = fixture(),
        shooter = f.add('shooter', 0, 12),
        victim = f.add('victim', 0, 8);
      const eye =
        shooter.movement.physics.position.y + shooter.movement.eyeOffset;
      const yaw = -Math.atan2(Number(x), 4);
      const pitch = Math.atan2(Number(y) - eye, Math.hypot(Number(x), 4));
      f.controls(
        shooter,
        {
          ...trigger,
          fire: false,
          firePressed: false,
          aim: true,
          switchTo: 'sniper',
        },
        yaw,
        pitch,
      );
      f.step(15);
      // Keep validated aim fresh while the shared ADS transition settles.
      for (let i = 0; i < 60; i++) {
        f.controls(
          shooter,
          { ...trigger, fire: false, firePressed: false, aim: true },
          yaw,
          pitch,
        );
        f.step();
      }
      f.controls(shooter, { ...trigger, aim: true }, yaw, pitch);
      f.step();
      expect(victim.state.health).toBeCloseTo(
        100 - Math.min(100, Number(damage)),
      );
      expect(f.combat.owner(shooter)).toMatchObject({
        selected: 'sniper',
        cycling: true,
        shots: 1,
        critical: headshot,
      });
      expect(f.combat.owner(shooter).lastDamage).toBeCloseTo(
        Math.min(100, Number(damage)),
      );
      expect(f.combat.owner(shooter).ammo.sniper.magazine).toBe(4);
      expect(f.shots[0]).toMatchObject({
        weapon: 'sniper',
        shooter: 'shooter',
      });
      if (Number(damage) >= 100)
        expect(f.kills[0]).toMatchObject({ weapon: 'sniper', headshot });
    },
  );
  it('rejects rapid fire, ownership bypass and cover hits using the same server weapon controller', () => {
    const f = fixture(),
      shooter = f.add('shooter', -7, 12),
      victim = f.add('victim', -7, -10);
    f.controls(shooter, {
      ...trigger,
      fire: false,
      firePressed: false,
      switchTo: 'sniper',
    });
    f.step(15);
    for (let i = 0; i < 70; i++) {
      f.controls(shooter);
      f.step();
    }
    expect(f.shots).toHaveLength(1);
    expect(victim.state.health).toBe(100);
    expect(f.combat.owner(shooter).ammo.sniper.magazine).toBe(4);
    f.combat.get('shooter')!.owned.delete('sniper');
    f.step(80);
    f.controls(shooter);
    f.step();
    expect(f.shots).toHaveLength(1);
  });
});

it('reloads the server sniper inventory only after the full magazine reload and cancels on switching', () => {
  const f = fixture(),
    player = f.add('sniper', 0, 12);
  f.controls(player, {
    ...trigger,
    fire: false,
    firePressed: false,
    switchTo: 'sniper',
    autoReload: false,
  });
  f.step(15);
  for (let i = 0; i < 5; i++) {
    f.controls(player);
    f.step(80);
  }
  expect(f.combat.owner(player).ammo.sniper).toEqual({
    magazine: 0,
    reserve: 20,
  });
  f.controls(player, {
    ...trigger,
    fire: false,
    firePressed: false,
    reloadPressed: true,
  });
  f.step(100);
  expect(f.combat.owner(player).ammo.sniper).toEqual({
    magazine: 0,
    reserve: 20,
  });
  f.step(70);
  expect(f.combat.owner(player).ammo.sniper).toEqual({
    magazine: 5,
    reserve: 15,
  });
  expect(f.shots).toHaveLength(5);
  f.controls(player);
  f.step();
  f.controls(player, {
    ...trigger,
    fire: false,
    firePressed: false,
    reloadPressed: true,
  });
  f.step(40);
  f.controls(player, {
    ...trigger,
    switchTo: 'rifle',
    fire: false,
    firePressed: false,
  });
  f.step(200);
  expect(f.combat.owner(player).ammo.sniper).toEqual({
    magazine: 4,
    reserve: 15,
  });
});

it('allows server-authoritative sniper ADS while sprinting, sliding and slide-jumping', () => {
  const f = fixture(),
    player = f.add('moving-sniper', 0, 12);
  const aim = { ...trigger, fire: false, firePressed: false, aim: true };
  f.controls(player, { ...aim, aim: false, switchTo: 'sniper' });
  f.step(15);
  for (let i = 0; i < 45; i++) {
    f.controls(player, aim, 0, 0, player.state.life, {
      forward: 1,
      sprint: true,
    });
    f.step();
  }
  expect(player.movement.state).toBe('sprinting');
  expect(f.combat.owner(player).ads).toBeGreaterThan(0.99);
  expect(
    Math.hypot(player.movement.velocity.x, player.movement.velocity.z),
  ).toBeGreaterThan(7.5);
  f.controls(player, aim, 0, 0, player.state.life, {
    forward: 1,
    sprint: true,
    slidePressed: true,
  });
  f.step();
  expect(player.movement.state).toBe('sliding');
  for (let i = 0; i < 12; i++) {
    f.controls(player, aim, 0, 0, player.state.life, {
      forward: 1,
      sprint: true,
    });
    f.step();
  }
  expect(f.combat.owner(player).ads).toBeGreaterThan(0.99);
  f.controls(player, aim, 0, 0, player.state.life, {
    forward: 1,
    sprint: true,
    jumpPressed: true,
  });
  f.step();
  expect(player.movement.state).toBe('airborne');
  expect(f.combat.owner(player).ads).toBeGreaterThan(0.99);
  expect(f.combat.owner(player).spread).toBeGreaterThan(0.01);
  // Starting aim while already airborne must also work, including held sprint.
  f.combat.get(player.state.id)!.weapons.ads = 0;
  for (let i = 0; i < 20; i++) {
    f.controls(player, aim, 0, 0, player.state.life, {
      forward: 1,
      sprint: true,
    });
    f.step();
  }
  expect(f.combat.owner(player).ads).toBeGreaterThan(0.9);
});

it('keeps automatic reload and empty-magazine interruption authoritative with limited reserves', () => {
  const f = fixture(),
    player = f.add('auto', 0, 12),
    w = f.combat.get('auto')!.weapons;
  w.current.magazine = 1;
  w.current.reserve = 3;
  f.controls(player, { ...trigger, autoReload: true });
  f.step();
  expect(f.combat.owner(player)).toMatchObject({ reloading: true, shots: 1 });
  expect(f.combat.owner(player).ammo.rifle).toEqual({
    magazine: 0,
    reserve: 3,
  });
  for (let i = 0; i < 60; i++) {
    f.controls(player, { ...trigger, autoReload: true });
    f.step();
  }
  expect(f.combat.owner(player)).toMatchObject({ reloading: true, shots: 1 });
  f.step(60);
  expect(f.combat.owner(player).ammo.rifle).toEqual({
    magazine: 3,
    reserve: 0,
  });
  expect(f.combat.owner(player).reloading).toBe(false);
});

it('cancels a partial server reload on a fresh shot without granting or losing reserve ammo', () => {
  const f = fixture(),
    player = f.add('interrupt', 0, 12),
    w = f.combat.get('interrupt')!.weapons;
  w.current.magazine = 5;
  w.current.reserve = 7;
  f.controls(player, {
    ...trigger,
    fire: false,
    firePressed: false,
    reloadPressed: true,
    autoReload: false,
  });
  f.step(40);
  expect(f.combat.owner(player).reloading).toBe(true);
  f.controls(player, { ...trigger, autoReload: false });
  f.step();
  expect(f.combat.owner(player)).toMatchObject({ reloading: false, shots: 1 });
  expect(f.combat.owner(player).ammo.rifle).toEqual({
    magazine: 4,
    reserve: 7,
  });
  f.controls(player, {
    ...trigger,
    fire: false,
    firePressed: false,
    autoReload: false,
  });
  f.step(200);
  expect(f.combat.owner(player).ammo.rifle).toEqual({
    magazine: 4,
    reserve: 7,
  });
});

it.each(['rifle', 'sniper'] as const)(
  'authoritatively interrupts partial %s reloads on fresh ADS but protects empty reloads',
  (id) => {
    const f = fixture(),
      player = f.add('aim-reload', 0, 12),
      w = f.combat.get('aim-reload')!.weapons;
    const aim = { ...trigger, fire: false, firePressed: false, aim: true };
    f.controls(player, { ...aim, switchTo: id });
    f.step(15);
    w.current.magazine = 2;
    w.current.reserve = 3;
    f.controls(player, { ...aim, reloadPressed: true });
    f.step(20);
    expect(f.combat.owner(player).reloading).toBe(true);
    // A tap followed by a newer held packet in the same tick must survive coalescing.
    f.controls(player, { ...aim, aimPressed: true });
    f.controls(player, aim);
    f.step();
    expect(f.combat.owner(player)).toMatchObject({
      reloading: false,
      shots: 0,
    });
    expect(w.current).toMatchObject({ magazine: 2, reserve: 3 });
    // Fresh ADS is consumed once; held input cannot cancel a new reload.
    w.reload();
    f.step(3);
    expect(w.reloading).toBe(true);
    f.step(200);
    expect(w.current.magazine + w.current.reserve).toBe(5);
    w.current.magazine = 0;
    w.current.reserve = 3;
    f.controls(player, { ...aim, reloadPressed: true, aimPressed: true });
    f.step(10);
    expect(w.reloading).toBe(true);
    expect(w.current).toMatchObject({ magazine: 0, reserve: 3 });
    f.step(200);
    expect(w.reloading).toBe(false);
    expect(w.current).toMatchObject({ magazine: 3, reserve: 0 });
    expect(f.shots).toHaveLength(0);
  },
);

it('honors auto reload OFF on the server while manual reload remains available', () => {
  const f = fixture(),
    player = f.add('manual', 0, 12),
    w = f.combat.get('manual')!.weapons;
  w.current.magazine = 1;
  w.current.reserve = 2;
  f.controls(player, { ...trigger, autoReload: false });
  f.step(200);
  expect(f.combat.owner(player).reloading).toBe(false);
  expect(f.combat.owner(player).ammo.rifle).toEqual({
    magazine: 0,
    reserve: 2,
  });
  f.controls(player, {
    ...trigger,
    fire: false,
    firePressed: false,
    reloadPressed: true,
    autoReload: false,
  });
  f.step(121);
  expect(f.combat.owner(player).ammo.rifle).toEqual({
    magazine: 2,
    reserve: 0,
  });
});

it.each([
  { weapons: ['sniper'] as const },
  { weapons: ['shotgun'] as const },
  { weapons: ['shotgun', 'sniper'] as const },
  { weapons: ['rifle', 'smg'] as const },
])(
  'keeps the room loadout $weapons through spawn, forged switches and respawn',
  ({ weapons }) => {
    const f = fixture();
    f.combat.setAllowedWeapons(weapons);
    const player = f.add('Restricted', 0, 12);
    expect(player.state.weapon).toBe(weapons[0]);
    expect([...f.combat.get('Restricted')!.owned]).toEqual(weapons);
    for (const id of ['rifle', 'smg', 'shotgun', 'sniper'] as const) {
      f.controls(player, {
        ...trigger,
        fire: false,
        firePressed: false,
        switchTo: id,
      });
      f.step(15);
      expect(weapons).toContain(player.state.weapon);
      if (weapons.includes(id as never)) expect(player.state.weapon).toBe(id);
    }
    const before = f.combat.get('Restricted')!.weapons.selected;
    f.controls(player, { ...trigger, switchTo: 'rifle' });
    f.step();
    expect(weapons).toContain(f.combat.owner(player).selected);
    expect(
      f.shots.every((shot) => weapons.includes(shot.weapon as never)),
    ).toBe(true);
    if (!weapons.includes('rifle' as never))
      expect(player.state.weapon).toBe(before);
    const equipped = player.state.weapon;
    player.state.alive = false;
    f.step();
    expect(player.state.alive).toBe(true);
    expect(player.state.weapon).toBe(equipped);
    expect([...f.combat.get('Restricted')!.owned]).toEqual(weapons);
  },
);
