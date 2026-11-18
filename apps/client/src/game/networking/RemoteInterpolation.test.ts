import { expect, it } from 'vitest';
import type { PublicPlayer, RoomView } from '@breakpoint/shared/network';
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
it('interpolates at 100 ms delay, clamps stalls and removes departed players', () => {
  const buffer = new RemoteInterpolation();
  buffer.push(view(6, 0), 100);
  buffer.push(view(12, 6), 200);
  let sampled = player;
  buffer.sample(250, (p) => {
    sampled = p;
  });
  expect(sampled.x).toBeCloseTo(3);
  buffer.sample(2000, (p) => {
    sampled = p;
  });
  expect(sampled.x).toBe(6);
  buffer.push({ ...view(13, 0), players: [] }, 2100);
  buffer.sample(2200, () => {
    throw new Error('Departed avatar remained.');
  });
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
      ...view(6, 0),
      players: [{ ...player, gaitPhase: 2 * Math.PI - 0.1, gaitAmount: 0.2 }],
    },
    100,
  );
  buffer.push(
    { ...view(12, 6), players: [{ ...player, gaitPhase: 0.1, gaitAmount: 1 }] },
    200,
  );
  buffer.sample(250, (sample) => {
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
