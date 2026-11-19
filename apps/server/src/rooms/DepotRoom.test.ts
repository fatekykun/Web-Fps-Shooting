import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { matchMaker } from '@colyseus/core';
import type { AddressInfo } from 'node:net';
import type { Correction } from '@breakpoint/shared/network';
import type { OwnerCombat, KillEvent } from '@breakpoint/shared/combat';
import { createGameServer } from '../server';
import type { RoomState } from './RoomState';
import { matchDefaults, type MatchSettings } from '@breakpoint/shared/match';

const server = createGameServer();
const rooms: Room<unknown, RoomState>[] = [];
let client: Client;
beforeAll(async () => {
  await server.listen(0, '127.0.0.1');
  const address = server.transport.server!.address() as AddressInfo;
  client = new Client(`http://127.0.0.1:${address.port}`);
});
afterAll(async () => {
  await Promise.all(rooms.map((room) => room.leave()));
  await server.gracefullyShutdown(false);
});
async function connect(
  code?: string,
  name = 'Player',
  settings?: MatchSettings,
) {
  const room = code
    ? await client.joinById<RoomState>(code, { name })
    : await client.create<RoomState>('depot', { name, settings });
  room.onMessage('correction', () => {});
  room.onMessage('notice', () => {});
  room.onMessage('shot', () => {});
  room.onMessage('kill', () => {});
  rooms.push(room);
  await expect.poll(() => room.state?.players?.has(room.sessionId)).toBe(true);
  return room;
}

it('runs a private eight-player room through capacity, readiness, movement, host migration and cleanup', async () => {
  const host = await connect(undefined, 'Host');
  const code = host.roomId;
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await expect(client.join('depot', { name: 'Stranger' })).rejects.toThrow();
  await expect(client.joinById(code, { name: '  ' })).rejects.toThrow();
  for (let i = 1; i < 8; i++) await connect(code, `Guest ${i}`);
  await expect.poll(() => host.state.players.size).toBe(8);
  await expect(client.joinById(code, { name: 'Ninth' })).rejects.toThrow();
  const listings = await matchMaker.query({ private: false });
  expect(listings.some((room) => room.roomId === code)).toBe(false);
  rooms[1]!.send('start');
  host.send('start');
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(host.state.phase).toBe('lobby');
  for (const room of rooms.slice(1)) room.send('ready', true);
  await expect
    .poll(() =>
      [...host.state.players.values()].every((player) => player.ready),
    )
    .toBe(true);
  rooms[1]!.send('start');
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(host.state.phase).toBe('lobby');
  host.send('start');
  await expect.poll(() => host.state.phase, { timeout: 6000 }).toBe('playing');
  let correction: Correction | undefined;
  host.onMessage('correction', (message: Correction) => {
    correction = message;
  });
  host.send(
    'input',
    [1, 2].map((seq) => ({
      seq,
      forward: 1,
      right: 0,
      yaw: 0,
      pitch: 0,
      sprint: true,
      jump: false,
      jumpPressed: false,
      slidePressed: false,
      divePressed: false,
    })),
  );
  await expect.poll(() => correction?.ack).toBe(2);
  await expect
    .poll(() => rooms[1]!.state.players.get(host.sessionId)?.ack)
    .toBe(2);
  expect(correction!.snapshot.position.z).toBeLessThan(12);
  // Malformed inputs evict the sender, freeing a seat for a late join.
  const invalid = rooms[7]!;
  invalid.send('input', [{ seq: 1, forward: 100, x: 999 }]);
  await expect.poll(() => host.state.players.size).toBe(7);
  const replacement = await connect(code, 'Replacement');
  await expect.poll(() => replacement.state.phase).toBe('playing');
  await expect.poll(() => host.state.players.size).toBe(8);
  const nextHost = rooms[1]!;
  await host.leave();
  await expect.poll(() => nextHost.state.hostId).toBe(nextHost.sessionId);
  await Promise.all(rooms.map((room) => room.leave()));
  await expect
    .poll(async () => (await matchMaker.query({ roomId: code })).length)
    .toBe(0);
}, 20000);

it('accepts weapon intent over sockets but owns damage, ammo, kills and life transitions', async () => {
  const host = await connect(undefined, 'Shooter');
  const target = await connect(host.roomId, 'Target');
  let owner: OwnerCombat | undefined, targetOwner: OwnerCombat | undefined;
  const kills: KillEvent[] = [];
  host.onMessage('correction', (message: Correction) => {
    owner = message.combat;
  });
  target.onMessage('correction', (message: Correction) => {
    targetOwner = message.combat;
  });
  host.onMessage('kill', (kill: KillEvent) => kills.push(kill));
  target.send('ready', true);
  await expect
    .poll(() =>
      [...host.state.players.values()].every((player) => player.ready),
    )
    .toBe(true);
  host.send('start');
  await expect.poll(() => host.state.phase, { timeout: 6000 }).toBe('playing');
  host.send('damage', { victim: target.sessionId, damage: 9999, health: 0 });
  host.send('shot', {
    victim: target.sessionId,
    origin: { x: -10, y: 1, z: 12 },
    damage: 9999,
  });
  await expect.poll(() => owner?.ammo.rifle.magazine).toBe(30);
  expect(target.state.players.get(target.sessionId)!.health).toBe(100);
  let sequence = 0,
    firing = true;
  const packet = (seq: number, life: number, fire: boolean, yaw: number) => ({
    seq,
    life,
    forward: 0,
    right: 0,
    yaw,
    pitch: -0.12,
    sprint: false,
    jump: false,
    jumpPressed: false,
    slidePressed: false,
    divePressed: false,
    weapon: {
      fire,
      firePressed: fire,
      aim: true,
      reloadPressed: false,
      switchTo: null,
      ammo: 999,
      damage: 9999,
      seed: 0,
      origin: { x: -10, y: 1, z: 12 },
    },
  });
  const stream = setInterval(() => {
    host.send('input', [
      packet(++sequence, 1, firing, -Math.PI / 2),
      packet(++sequence, 1, firing, -Math.PI / 2),
    ]);
  }, 1000 / 30);
  try {
    await expect.poll(() => kills.length, { timeout: 10000 }).toBe(1);
    firing = false;
    expect(kills[0]).toMatchObject({
      killer: 'Shooter',
      victim: 'Target',
      weapon: 'rifle',
    });
    await expect
      .poll(() => target.state.players.get(target.sessionId)!.alive)
      .toBe(false);
    await expect.poll(() => targetOwner?.alive).toBe(false);
    expect(owner!.ammo.rifle.magazine).toBeLessThan(30);
    expect(owner!.ammo.rifle.magazine).toBeGreaterThanOrEqual(0);
    target.send('input', [packet(1, 1, true, 0)]);
    await expect.poll(() => targetOwner?.shots).toBe(0);
    await expect
      .poll(() => target.state.players.get(target.sessionId)?.life, {
        timeout: 8000,
      })
      .toBe(2);
    target.send('input', [packet(2, 1, true, 0)]);
    await expect
      .poll(() => target.state.players.get(target.sessionId)?.ack)
      .toBe(2);
    await expect.poll(() => targetOwner?.life).toBe(2);
    expect(targetOwner!.health).toBe(100);
    expect(targetOwner!.shots).toBe(0);
    expect(targetOwner!.ammo.rifle.magazine).toBe(30);
    target.send('input', [packet(3, 2, true, 0)]);
    await expect.poll(() => targetOwner?.shots).toBeGreaterThan(0);
    expect(kills).toHaveLength(1);
  } finally {
    clearInterval(stream);
    await host.leave();
    await target.leave();
  }
}, 25000);

it('scores an actual elimination, freezes results, then rematches as four-versus-four TDM', async () => {
  const host = await connect(undefined, 'Winner', {
    ...matchDefaults.ffa,
    scoreLimit: 1,
    durationSeconds: 30,
  });
  const guest = await connect(host.roomId, 'Guest');
  const roundRooms = [host, guest];
  guest.send('configure', matchDefaults.tdm);
  guest.send('ready', true);
  await expect
    .poll(() => [...host.state.players.values()].every((p) => p.ready))
    .toBe(true);
  expect(host.state.mode).toBe('ffa');
  host.send('start');
  await expect.poll(() => host.state.phase, { timeout: 6000 }).toBe('playing');
  let seq = 0,
    firing = true,
    owner: OwnerCombat | undefined;
  host.onMessage('correction', (message: Correction) => {
    owner = message.combat;
  });
  const stream = setInterval(() => {
    const packet = () => ({
      seq: ++seq,
      life: host.state.players.get(host.sessionId)!.life,
      forward: 0,
      right: 0,
      yaw: -Math.PI / 2,
      pitch: -0.12,
      sprint: false,
      jump: false,
      jumpPressed: false,
      slidePressed: false,
      divePressed: false,
      weapon: {
        fire: firing,
        firePressed: firing,
        aim: true,
        reloadPressed: false,
        switchTo: null,
      },
    });
    host.send('input', [packet(), packet()]);
  }, 1000 / 30);
  try {
    await expect
      .poll(() => host.state.phase, { timeout: 10000 })
      .toBe('results');
    expect(host.state.winnerId).toBe(host.sessionId);
    expect(host.state.scores.get(host.sessionId)!.kills).toBe(1);
    expect(host.state.scores.get(guest.sessionId)!.deaths).toBe(1);
    await expect.poll(() => owner?.hitSequence).toBeGreaterThan(0);
    const ammo = owner!.ammo.rifle.magazine;
    const position = host.state.players.get(host.sessionId)!.z;
    guest.send('lobby');
    guest.send('score', { kills: 999, blueScore: 999 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(host.state.phase).toBe('results');
    expect(owner!.ammo.rifle.magazine).toBe(ammo);
    expect(host.state.players.get(host.sessionId)!.z).toBe(position);
    firing = false;
    host.send('lobby');
    await expect.poll(() => host.state.phase, { timeout: 6000 }).toBe('lobby');
    expect(host.state.scores.size).toBe(0);
    host.send('configure', matchDefaults.tdm);
    await expect.poll(() => host.state.mode).toBe('tdm');
    for (let i = 2; i < 8; i++)
      roundRooms.push(await connect(host.roomId, `Guest ${i}`));
    for (const room of roundRooms) room.send('ready', true);
    await expect.poll(() => host.state.players.size).toBe(8);
    await expect
      .poll(() => [...host.state.players.values()].every((p) => p.ready))
      .toBe(true);
    host.send('start');
    await expect
      .poll(() => host.state.phase, { timeout: 6000 })
      .toBe('playing');
    expect(host.state.round).toBe(2);
    expect(host.state.durationSeconds).toBe(420);
    expect(
      [...host.state.players.values()].filter((p) => p.team === 'blue'),
    ).toHaveLength(4);
    expect(
      [...host.state.players.values()].filter((p) => p.team === 'orange'),
    ).toHaveLength(4);
    expect(
      [...host.state.players.values()].every((p) =>
        p.team === 'blue' ? p.z > 0 : p.z < 0,
      ),
    ).toBe(true);
    host.send('configure', matchDefaults.ffa);
    guest.send('team', 'blue');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(host.state.mode).toBe('tdm');
    expect(host.state.blueScore).toBe(0);
    expect(host.state.scores.get(host.sessionId)!.kills).toBe(0);
    clearInterval(stream);
    await host.leave();
    await expect.poll(() => guest.state.hostId).toBe(guest.sessionId);
    await expect
      .poll(() => guest.state.scores.get(host.sessionId)?.connected)
      .toBe(false);
    const replacement = await connect(guest.roomId, 'Replacement');
    roundRooms.push(replacement);
    await expect.poll(() => replacement.state.players.size).toBe(8);
    expect(replacement.state.players.get(replacement.sessionId)!.team).toBe(
      'blue',
    );
  } finally {
    clearInterval(stream);
    await Promise.all(roundRooms.map((room) => room.leave()));
  }
}, 25000);
