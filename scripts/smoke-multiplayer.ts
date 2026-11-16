import { Client, type Room } from '@colyseus/sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import type { RoomState } from '../apps/server/src/rooms/RoomState';
import type { Correction, PlayerInput } from '@breakpoint/shared/network';
import {
  isLoopback,
  validateServerUrl,
} from '../apps/client/src/game/networking/serverEndpoint.ts';

const { values } = parseArgs({
  options: {
    server: {
      type: 'string',
      default: process.env.SERVER_URL ?? 'http://127.0.0.1:2567',
    },
    origin: { type: 'string' },
    seconds: { type: 'string', default: '10' },
    output: { type: 'string', default: 'test-results/multiplayer-smoke.json' },
  },
});
const seconds = Number(values.seconds);
if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120)
  throw new Error('--seconds must be 5–120 per mode.');
const endpoint = validateServerUrl(
  values.server,
  !isLoopback(new URL(values.server).hostname),
);
if (values.origin && new URL(values.origin).origin !== values.origin)
  throw new Error('--origin must be an exact website origin.');
const headers: Record<string, string> = values.origin
  ? { Origin: values.origin }
  : {};
const client = new Client(endpoint, { headers });

async function until(
  condition: () => boolean,
  message: string,
  timeout = 20000,
): Promise<void> {
  const deadline = performance.now() + timeout;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`Timed out: ${message}`);
    await delay(50);
  }
}
function percentile(values: number[], fraction: number): number {
  if (!values.length) throw new Error('No acknowledged-input latency samples.');
  const sorted = [...values].sort((a, b) => a - b);
  return (
    Math.round(
      sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
      ]! * 100,
    ) / 100
  );
}
async function health(): Promise<void> {
  console.log(
    'Waiting for the room service (a free host may need a cold start)…',
  );
  const deadline = performance.now() + 90000;
  let lastError: unknown;
  do {
    try {
      const response = await fetch(`${endpoint}/health`, {
        headers,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`Health returned ${response.status}.`);
      const body = (await response.json()) as {
        status?: string;
        maxPlayers?: number;
      };
      if (body.status !== 'ok' || body.maxPlayers !== 8)
        throw new Error('Not an eight-player BREAKPOINT server.');
      if (
        values.origin &&
        response.headers.get('access-control-allow-origin') !== values.origin
      )
        throw new Error('The server CORS origin does not match the website.');
      return;
    } catch (error) {
      lastError = error;
      await delay(1500);
    }
  } while (performance.now() < deadline);
  throw lastError;
}

async function modeCheck(mode: 'ffa' | 'tdm') {
  const rooms: Room<unknown, RoomState>[] = [];
  const faults: string[] = [];
  const sequence = new Map<string, number>();
  const sent = new Map<string, Map<number, number>>();
  const latencies: number[] = [];
  const acknowledgements = new Map<string, number>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let shots = 0;
  try {
    for (let index = 0; index < 8; index++) {
      const room =
        index === 0
          ? await client.create<RoomState>('depot', {
              name: 'Smoke host',
              settings: { mode, scoreLimit: 100, durationSeconds: 300 },
            })
          : await client.joinById<RoomState>(rooms[0]!.roomId, {
              name: `Smoke ${index + 1}`,
            });
      rooms.push(room);
      sequence.set(room.sessionId, 0);
      sent.set(room.sessionId, new Map());
      room.onMessage('notice', (notice: string) => faults.push(notice));
      room.onMessage('shot', () => {
        if (index === 0) shots++;
      });
      room.onMessage('kill', () => {});
      room.onError((code, message) => faults.push(`${code}: ${message}`));
      room.onDrop(() => faults.push('A player connection dropped.'));
      room.onMessage('correction', (correction: Correction) => {
        acknowledgements.set(room.sessionId, correction.ack);
        const pending = sent.get(room.sessionId)!;
        const at = pending.get(correction.ack);
        if (at !== undefined) latencies.push(performance.now() - at);
        for (const key of pending.keys())
          if (key <= correction.ack) pending.delete(key);
      });
    }
    const host = rooms[0]!;
    await until(
      () => rooms.every((room) => room.state?.players?.size === 8),
      'all eight rosters',
    );
    let ninthRejected = false;
    try {
      const ninth = await client.joinById(host.roomId, {
        name: 'Capacity probe',
      });
      await ninth.leave();
    } catch {
      ninthRejected = true;
    }
    if (!ninthRejected) throw new Error('The server admitted a ninth player.');
    if (mode === 'tdm')
      for (const team of ['blue', 'orange'])
        if (
          [...host.state.players.values()].filter(
            (player) => player.team === team,
          ).length !== 4
        )
          throw new Error('TDM did not assign four players per team.');
    for (const room of rooms) room.send('ready', true);
    await until(
      () => [...host.state.players.values()].every((player) => player.ready),
      'readiness',
    );
    host.send('start');
    await until(
      () => rooms.every((room) => room.state.phase === 'playing'),
      'start',
    );
    console.log(
      `${mode.toUpperCase()}: eight clients connected; testing movement, weapons and acknowledgements for ${seconds}s.`,
    );
    const started = performance.now();
    const startingTick = host.state.tick;
    timer = setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      for (const [index, room] of rooms.entries()) {
        const player = room.state.players.get(room.sessionId);
        if (!player) {
          faults.push('Player disappeared from roster.');
          continue;
        }
        const batch: PlayerInput[] = [];
        const batchSize = Math.min(
          6,
          Math.max(0, Math.floor(elapsed * 60) - sequence.get(room.sessionId)!),
        );
        for (let step = 0; step < batchSize; step++) {
          const seq = sequence.get(room.sessionId)! + 1;
          sequence.set(room.sessionId, seq);
          sent.get(room.sessionId)!.set(seq, performance.now());
          const fire = Math.floor(elapsed) % 4 < 2;
          batch.push({
            seq,
            life: player.life,
            forward: Math.floor(elapsed / 2) % 2 === 0 ? 1 : -1,
            right: 0,
            yaw: player.yaw,
            pitch: -0.1,
            sprint: true,
            jump: false,
            jumpPressed: false,
            slidePressed: false,
            divePressed: false,
            weapon: {
              fire,
              firePressed: fire,
              aim: true,
              reloadPressed: Math.floor(elapsed) % 4 === 2,
              switchTo:
                index % 3 === 0 ? 'shotgun' : index % 3 === 1 ? 'smg' : 'rifle',
            },
          });
        }
        if (batch.length) room.send('input', batch);
        if (sent.get(room.sessionId)!.size > 240)
          faults.push('Acknowledgements stalled for more than four seconds.');
      }
    }, 1000 / 30);
    await delay(seconds * 1000);
    clearInterval(timer);
    timer = undefined;
    await until(
      () =>
        rooms.every(
          (room) =>
            (acknowledgements.get(room.sessionId) ?? 0) >=
            sequence.get(room.sessionId)! - 6,
        ),
      'final acknowledgements',
    );
    if (faults.length) throw new Error([...new Set(faults)].join(' '));
    if (shots === 0)
      throw new Error('No server-confirmed weapon reports received.');
    for (const room of rooms)
      if (room.state.players.size !== 8)
        throw new Error('Eight clients did not remain connected.');
    const serverTicks = host.state.tick - startingTick;
    for (const count of sequence.values())
      if (count < seconds * 60 * 0.9)
        throw new Error(
          'The smoke client could not sustain its 60 Hz input target.',
        );
    const nextHost = rooms[1]!;
    await host.leave();
    await until(
      () => nextHost.state.hostId === nextHost.sessionId,
      'host migration',
    );
    return {
      mode,
      players: 8,
      seconds,
      ninthRejected,
      targetInputHz: 60,
      sentInputs: Object.fromEntries(sequence),
      serverTicks,
      serverConfirmedShots: shots,
      inputAcknowledgements: Object.fromEntries(acknowledgements),
      ackLatencyMs: {
        samples: latencies.length,
        median: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
      },
      hostMigration: true,
    };
  } finally {
    if (timer) clearInterval(timer);
    await Promise.allSettled(rooms.map((room) => room.leave()));
  }
}

await health();
const results = [await modeCheck('ffa'), await modeCheck('tdm')];
const report = {
  recordedAt: new Date().toISOString(),
  endpoint,
  origin: values.origin ?? null,
  kind: 'eight SDK clients over HTTP/WebSocket; not eight humans or a GPU benchmark',
  results,
};
const path = resolve(values.output);
await mkdir(dirname(path), { recursive: true });
await writeFile(path, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
console.log(`Report saved to ${path}`);
