import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initializePhysics } from '@breakpoint/shared/physics';
import {
  weaponConfigs,
  type WeaponInput,
  type MovementInput,
} from '@breakpoint/shared';
import type { KillEvent, ServerShot } from '@breakpoint/shared/combat';
import { ServerCombat } from './ServerCombat';
import { ServerPlayer } from '../players/ServerPlayer';
import { PlayerState } from '../rooms/RoomState';

beforeAll(initializePhysics);
const worlds: ServerPlayer[] = [];
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
    expect(f.shots[0]!.traces[0]!.end.z).toBeCloseTo(0, 2);
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
    [0, 1.48, 150, true],
    [0, 1.15, 100, false],
    [0, 0.8, 90, false],
    [0.36, 1.03, 70, false],
    [0.15, 0.35, 70, false],
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
      expect(victim.state.health).toBe(100 - Math.min(100, Number(damage)));
      expect(f.combat.owner(shooter)).toMatchObject({
        selected: 'sniper',
        cycling: true,
        shots: 1,
        critical: headshot,
        lastDamage: Math.min(100, Number(damage)),
      });
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
  f.controls(player, { ...trigger, reloadPressed: true });
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
  f.controls(player, { ...trigger, reloadPressed: true });
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
