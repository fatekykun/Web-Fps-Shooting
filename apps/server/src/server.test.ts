import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createGameServer } from './server';
import { readServerConfig } from './config';
import { DepotRoom } from './rooms/DepotRoom';

let ready = true;
const origin = 'https://game.example';
const server = createGameServer(
  readServerConfig({
    NODE_ENV: 'production',
    ALLOWED_ORIGINS: origin,
    MAX_ROOMS: '1',
  }),
  () => ready,
);
let endpoint: string;
const rooms: Room[] = [];
beforeAll(async () => {
  await server.listen(0, '127.0.0.1');
  endpoint = `http://127.0.0.1:${(server.transport.server!.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await Promise.all(rooms.map((room) => room.leave()));
  await server.gracefullyShutdown(false);
});

function upgrade(testOrigin: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(`${endpoint}/test/test`, {
      headers: {
        Origin: testOrigin,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.alloc(16, 1).toString('base64'),
      },
    });
    req.on('response', (response) => {
      response.resume();
      resolve(response.statusCode!);
    });
    req.on('upgrade', (_response, socket) => {
      socket.destroy();
      reject(new Error('Unexpected socket upgrade.'));
    });
    req.on('error', reject);
    req.end();
  });
}

it('serves readiness and CORS while refusing untrusted HTTP matchmaking and WebSocket origins', async () => {
  const health = await fetch(`${endpoint}/health`);
  expect(health.status).toBe(200);
  expect(await health.json()).toEqual({ status: 'ok', maxPlayers: 8 });
  expect(health.headers.get('cache-control')).toBe('no-store');
  const preflight = await fetch(`${endpoint}/matchmake/create/depot`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
  const refused = await fetch(`${endpoint}/matchmake/create/depot`, {
    method: 'POST',
    headers: {
      Origin: 'https://untrusted.example',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Untrusted' }),
  });
  expect(refused.status).toBe(403);
  expect(DepotRoom.capacity.active).toBe(0);
  expect(await upgrade('https://untrusted.example')).toBe(403);
  ready = false;
  try {
    expect((await fetch(`${endpoint}/health`)).status).toBe(503);
    const restarting = await fetch(`${endpoint}/matchmake/create/depot`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Wait' }),
    });
    expect(restarting.status).toBe(503);
    expect(await upgrade(origin)).toBe(503);
  } finally {
    ready = true;
  }
});

it('rejects simultaneous room over-capacity, releases failed initialization and frees disposed rooms', async () => {
  const client = new Client(endpoint, { headers: { Origin: origin } });
  await expect(
    client.create('depot', {
      name: 'Bad rules',
      settings: { mode: 'invalid' },
    }),
  ).rejects.toThrow();
  expect(DepotRoom.capacity.active).toBe(0);
  const attempts = await Promise.allSettled([
    client.create('depot', { name: 'One' }),
    client.create('depot', { name: 'Two' }),
  ]);
  const successful = attempts.filter((result) => result.status === 'fulfilled');
  expect(successful).toHaveLength(1);
  expect(
    attempts.filter((result) => result.status === 'rejected'),
  ).toHaveLength(1);
  for (const result of successful)
    if (result.status === 'fulfilled') rooms.push(result.value);
  expect(DepotRoom.capacity.active).toBe(1);
  await rooms[0]!.leave();
  await expect.poll(() => DepotRoom.capacity.active).toBe(0);
  const replacement = await client.create('depot', { name: 'Replacement' });
  rooms.push(replacement);
  await replacement.leave();
  await expect.poll(() => DepotRoom.capacity.active).toBe(0);
}, 15000);
