import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import type { AddressInfo } from 'node:net';
import { matchDefaults, playerLimits } from '@breakpoint/shared/match';
import { weaponOrder, weaponConfigs, type WeaponId } from '@breakpoint/shared';
import type { OwnerCombat } from '@breakpoint/shared/combat';
import type { Correction } from '@breakpoint/shared/network';
import { createGameServer } from '../server';
import type { RoomState } from './RoomState';

const server = createGameServer();
let client: Client;
const connected: Room<unknown, RoomState>[] = [];
beforeAll(async () => {
  await server.listen(0, '127.0.0.1');
  client = new Client(
    `http://127.0.0.1:${(server.transport.server!.address() as AddressInfo).port}`,
  );
});
afterEach(async () => {
  await Promise.all(connected.splice(0).map((room) => room.leave()));
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});
async function track(room: Room<unknown, RoomState>) {
  for (const type of ['shot', 'kill', 'notice', 'correction'])
    room.onMessage(type, () => {});
  connected.push(room);
  await expect.poll(() => room.state?.players?.has(room.sessionId)).toBe(true);
  return room;
}
async function create(settings: unknown = matchDefaults.ffa) {
  return track(
    await client.create<RoomState>('depot', { name: 'Host', settings }),
  );
}
async function join(code: string, name: string, extra = {}) {
  return track(await client.joinById<RoomState>(code, { name, ...extra }));
}
it.each(playerLimits)(
  'atomically caps a %i-player room including its host and reopens vacated seats',
  async (playerLimit) => {
    const host = await create({ ...matchDefaults.ffa, playerLimit });
    expect(host.state.playerLimit).toBe(playerLimit);
    expect([...host.state.allowedWeapons]).toEqual(weaponOrder);
    const attempts = await Promise.allSettled(
      Array.from({ length: playerLimit + 2 }, (_, i) =>
        join(host.roomId, `Guest ${i}`),
      ),
    );
    const admitted = attempts
      .filter(
        (result): result is PromiseFulfilledResult<Room<unknown, RoomState>> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);
    expect(admitted).toHaveLength(playerLimit - 1);
    await expect.poll(() => host.state.players.size).toBe(playerLimit);
    for (const peer of admitted)
      expect(peer.state.playerLimit).toBe(playerLimit);
    await admitted[0]!.leave();
    await expect.poll(() => host.state.players.size).toBe(playerLimit - 1);
    const replacement = await join(host.roomId, 'Replacement');
    await expect.poll(() => replacement.state.players.size).toBe(playerLimit);
    await expect(
      client.joinById(host.roomId, { name: 'Overflow' }),
    ).rejects.toThrow();
  },
  20000,
);
it.each([
  { allowed: ['sniper'] as WeaponId[] },
  { allowed: ['shotgun'] as WeaponId[] },
  { allowed: ['shotgun', 'sniper'] as WeaponId[] },
  { allowed: ['rifle', 'smg'] as WeaponId[] },
])(
  'synchronizes and enforces $allowed for all peers and ignores join/configuration overrides',
  async ({ allowed }) => {
    const host = await create({
      ...matchDefaults.ffa,
      playerLimit: 4,
      allowedWeapons: allowed,
    });
    const guest = await join(host.roomId, 'Guest', {
      settings: { allowedWeapons: ['rifle'], playerLimit: 8 },
    });
    expect([...guest.state.allowedWeapons]).toEqual(allowed);
    expect(guest.state.playerLimit).toBe(4);
    for (const peer of [host, guest])
      expect(peer.state.players.get(peer.sessionId)!.weapon).toBe(allowed[0]);
    host.send('configure', {
      ...matchDefaults.ffa,
      allowedWeapons: ['rifle', 'smg'],
      playerLimit: 8,
    });
    guest.send('configure', {
      ...matchDefaults.tdm,
      allowedWeapons: ['rifle'],
      playerLimit: 8,
    });
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect([...host.state.allowedWeapons]).toEqual(allowed);
    expect(host.state.playerLimit).toBe(4);
    expect(host.state.mode).toBe('ffa');
    guest.send('ready', true);
    await expect
      .poll(() => [...host.state.players.values()].every((p) => p.ready))
      .toBe(true);
    host.send('start');
    await expect.poll(() => host.state.phase).toBe('playing');
    let owner: OwnerCombat | undefined;
    guest.onMessage('correction', (message: Correction) => {
      owner = message.combat;
    });
    await expect.poll(() => owner?.selected).toBe(allowed[0]);
    let seq = 0;
    const packet = (switchTo: WeaponId | null, fire = false) => ({
      seq: ++seq,
      life: guest.state.players.get(guest.sessionId)!.life,
      forward: 0,
      right: 0,
      yaw: 0,
      pitch: 0,
      sprint: false,
      jump: false,
      jumpPressed: false,
      slidePressed: false,
      divePressed: false,
      weapon: {
        fire,
        firePressed: fire,
        aim: false,
        reloadPressed: false,
        switchTo,
      },
    });
    guest.send('input', [packet(null, true)]);
    await expect.poll(() => owner?.shots).toBe(1);
    expect(owner!.ammo[allowed[0]!].magazine).toBe(
      weaponConfigs[allowed[0]!].magazine - 1,
    );
    for (const id of weaponOrder) {
      guest.send('input', [packet(id)]);
      await expect
        .poll(() => guest.state.players.get(guest.sessionId)!.ack)
        .toBe(seq);
      expect(allowed).toContain(
        guest.state.players.get(guest.sessionId)!.weapon,
      );
      if (allowed.includes(id))
        await expect.poll(() => owner?.selected).toBe(id);
    }
    const late = await join(host.roomId, 'Late', {
      allowedWeapons: ['rifle'],
      playerLimit: 8,
    });
    await expect.poll(() => late.state.phase).toBe('playing');
    expect([...late.state.allowedWeapons]).toEqual(allowed);
    expect(late.state.players.get(late.sessionId)!.weapon).toBe(allowed[0]);
  },
  20000,
);
it('rejects invalid creation requests instead of silently accepting unsafe limits or loadouts', async () => {
  for (const change of [
    { playerLimit: 3 },
    { playerLimit: '2' },
    { allowedWeapons: [] },
    { allowedWeapons: ['rifle', 'smg', 'sniper'] },
    { allowedWeapons: ['sniper', 'sniper'] },
    { allowedWeapons: ['knife'] },
  ])
    await expect(
      client.create('depot', {
        name: 'Invalid',
        settings: { ...matchDefaults.ffa, ...change },
      }),
    ).rejects.toThrow();
  await expect(
    client.create('depot', { name: 'Invalid', settings: null }),
  ).rejects.toThrow();
});
it('retains restrictions and the player cap in a two-player TDM match', async () => {
  const host = await create({
    ...matchDefaults.tdm,
    playerLimit: 2,
    allowedWeapons: ['sniper'],
  });
  const guest = await join(host.roomId, 'Guest');
  guest.send('ready', true);
  await expect
    .poll(() => [...host.state.players.values()].every((p) => p.ready))
    .toBe(true);
  host.send('start');
  await expect.poll(() => host.state.phase).toBe('playing');
  expect([...host.state.players.values()].map((p) => p.team).sort()).toEqual([
    'blue',
    'orange',
  ]);
  expect(
    [...host.state.players.values()].every((p) => p.weapon === 'sniper'),
  ).toBe(true);
  await expect(
    client.joinById(host.roomId, { name: 'Third' }),
  ).rejects.toThrow();
  await guest.leave();
  await expect.poll(() => host.state.players.size).toBe(1);
  const replacement = await join(host.roomId, 'Replacement');
  await expect.poll(() => replacement.state.players.size).toBe(2);
  expect(replacement.state.players.get(replacement.sessionId)!.weapon).toBe(
    'sniper',
  );
  expect(replacement.state.players.get(replacement.sessionId)!.team).toBe(
    'orange',
  );
});
