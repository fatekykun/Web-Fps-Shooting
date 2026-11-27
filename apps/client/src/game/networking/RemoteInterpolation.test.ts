import { expect, it } from 'vitest';
import {
  networkConfig,
  type PublicPlayer,
  type RoomView,
} from '@breakpoint/shared/network';
import { lerpAngle, RemoteInterpolation } from './RemoteInterpolation';
import { matchDefaults } from '@breakpoint/shared/match';

const player: PublicPlayer = {
  id: 'other',
  name: 'Other',
  slot: 1,
  ready: true,
  x: 0,
  y: 1,
  z: 0,
  yaw: 0,
  pitch: 0,
  halfHeight: 0.55,
  movement: 'sprinting',
  ack: 0,
  health: 100,
  alive: true,
  life: 1,
  weapon: 'rifle',
  protected: false,
  team: 'none',
};
const view = (tick: number, x: number): RoomView => ({
  mapId: 'shipment',
  code: 'ABC234',
  selfId: 'self',
  hostId: 'self',
  phase: 'playing',
  tick,
  match: {
    ...matchDefaults.ffa,
    round: 1,
    remainingSeconds: 300,
    blueScore: 0,
    orangeScore: 0,
    winnerId: '',
    winnerName: '',
    winningTeam: 'none',
    endReason: '',
    scores: [],
  },
  players: [
    { ...player, x },
    { ...player, id: 'self' },
  ],
});
const tickMs = 1000 / networkConfig.tickRate;

it('interpolates at the short baseline delay, clamps stalls and removes departed players', () => {
  const buffer = new RemoteInterpolation();
  buffer.push(view(6, 0), 6 * tickMs);
  buffer.push(view(8, 2), 8 * tickMs);
  buffer.push(view(10, 4), 10 * tickMs);
  expect(buffer.delaySeconds * 1000).toBeCloseTo(41.667);
  let sampled = player;
  buffer.sample(10 * tickMs, (p) => {
    sampled = p;
  });
  expect(sampled.x).toBeCloseTo(1.5);
  buffer.sample(11 * tickMs, (p) => {
    sampled = p;
  });
  expect(sampled.x).toBeCloseTo(2.5);
  buffer.sample(2000, (p) => {
    sampled = p;
  });
  expect(sampled.x).toBe(4);
  buffer.push({ ...view(13, 0), players: [] }, 2100);
  buffer.sample(2200, () => {
    throw new Error('Departed avatar remained.');
  });
});

it('adds bounded delay under jitter and advances smoothly through burst arrivals', () => {
  const buffer = new RemoteInterpolation();
  buffer.push(view(10, 10), 0);
  buffer.push(view(12, 12), 2 * tickMs);
  let x = 0;
  const consume = (sample: PublicPlayer) => {
    x = sample.x;
  };
  buffer.sample(50, consume);
  const before = x;
  buffer.push(view(14, 14), 51);
  buffer.sample(52, consume);
  expect(x).toBeGreaterThanOrEqual(before);
  expect(x - before).toBeLessThan(0.16);
  for (let i = 1; i <= 10; i++)
    buffer.push(view(14 + i * 2, 14 + i * 2), 51 + i * 150);
  expect(buffer.delaySeconds).toBe(
    networkConfig.maxInterpolationDelay / networkConfig.tickRate,
  );
  buffer.clear();
  expect(buffer.delaySeconds).toBeCloseTo(
    networkConfig.interpolationDelay / networkConfig.tickRate,
  );
});

it('learns the slower snapshot cadence of an older server', () => {
  const buffer = new RemoteInterpolation();
  for (let tick = 0; tick <= 45; tick += 3)
    buffer.push(view(tick, tick), tick * tickMs);
  expect(buffer.delaySeconds).toBeGreaterThan(0.05);
  expect(buffer.delaySeconds).toBeLessThan(0.06);
});
it('takes the short arc across wrapped yaw', () => {
  expect(Math.abs(lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5))).toBeCloseTo(
    Math.PI,
  );
});

it('interpolates server-owned gait across a wrapped animation cycle', () => {
  const buffer = new RemoteInterpolation();
  buffer.push(
    {
      ...view(10, 0),
      players: [{ ...player, gaitPhase: 2 * Math.PI - 0.1, gaitAmount: 0.2 }],
    },
    10 * tickMs,
  );
  buffer.push(
    { ...view(12, 6), players: [{ ...player, gaitPhase: 0.1, gaitAmount: 1 }] },
    12 * tickMs,
  );
  buffer.sample(13.5 * tickMs, (sample) => {
    expect(sample.gaitPhase).toBeCloseTo(2 * Math.PI);
    expect(sample.gaitAmount).toBeCloseTo(0.6);
  });
});

it('snaps to a new life and removes the living pose immediately on death', () => {
  const buffer = new RemoteInterpolation();
  buffer.push(view(6, 0), 100);
  buffer.push(
    { ...view(12, 10), players: [{ ...player, x: 10, life: 2 }] },
    200,
  );
  let result = player;
  buffer.sample(200, (sample) => {
    result = sample;
  });
  expect(result.x).toBe(10);
  buffer.push(
    { ...view(15, 10), players: [{ ...player, x: 10, life: 2, alive: false }] },
    250,
  );
  buffer.sample(250, (sample) => {
    result = sample;
  });
  expect(result.alive).toBe(false);
});
